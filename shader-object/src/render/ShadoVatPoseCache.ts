/**
 * Active pose-palette cache (WebGPU).
 *
 * The direct VAT path resolves animation *per vertex*: every influence reads two
 * atlas frames, hemisphere-aligns them, and interpolates. Since bones (~107)
 * are vastly outnumbered by vertices (tens of thousands), that work is almost
 * entirely redundant — the same (frame0, frame1, alpha) triple produces the same
 * bone transform for every vertex and every instance using that pose.
 *
 * This resolves each *active pose* once, per bone, into a packed palette in a
 * storage buffer. Consumers then read one final DQ per influence:
 *
 *     before:  influences x 2 frames x 2 texels  =  16 loads/vertex (4 influences)
 *     after:   influences x 1 palette entry      =   4 loads/vertex
 *
 * plus the per-vertex frame lerp, normalisation and hemisphere align disappear.
 *
 * Poses are keyed and refcounted, so any number of actors sharing a pose share
 * one slot. Slots carry a generation counter so a recycled slot can never be
 * mistaken for a live one.
 *
 * See docs/shado/shado-vat-storage-and-webgpu-fetch-optimization.md §14–19.
 */

/** Identifies one resolved skeletal pose. */
export type ShadoPoseKey = {
  /** Source animation bank / VAT identity. */
  bankId: number;
  clipId: number;
  frame0: number;
  frame1: number;
  /** Quantised interpolation factor, used for cache identity. */
  alphaBucket: number;
  /** Representative interpolation factor for `alphaBucket`, used by the resolve. */
  alpha: number;
  /** Single-frame tiers skip interpolation entirely. */
  singleFrame: boolean;
};

export type ShadoPoseSlot = {
  readonly slot: number;
  readonly generation: number;
};

export type ShadoPoseCacheStats = {
  readonly capacity: number;
  readonly live: number;
  readonly resident: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly paletteBytes: number;
  readonly requestBytes: number;
};

/** u32 words per pose request record. */
export const POSE_REQUEST_WORDS = 8;
/** Bytes per packed bone DQ: vec4<u32>, two half floats per word. */
export const POSE_PALETTE_BYTES_PER_BONE = 16;

/**
 * Bucket an interpolation factor so that actors at nearly the same animation
 * phase collapse onto one pose. Without this, independent floating-point phases
 * give every actor a unique key and the cache degenerates to one slot each.
 */
export function quantizeAlpha(alpha: number, buckets: number): number {
  if (buckets <= 1) return 0;
  const clamped = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  return Math.min(buckets - 1, Math.floor(clamped * buckets));
}

/** Stable per-entity phase cohort, so NPCs vary without each being unique. */
export function phaseCohort(entityId: number, cohortCount: number): number {
  if (cohortCount <= 1) return 0;
  // xorshift-ish avalanche so adjacent ids do not land in the same cohort.
  let hash = entityId | 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) % cohortCount;
}

/**
 * Build a cache key, collapsing `alpha` onto `buckets` discrete steps. The
 * representative alpha is the bucket midpoint, so quantisation error is bounded
 * by half a bucket rather than a full one.
 */
export function makePoseKey(options: {
  bankId: number;
  clipId: number;
  frame0: number;
  frame1: number;
  alpha: number;
  /** 1 disables interpolation buckets entirely (near tier). */
  alphaBuckets?: number;
  singleFrame?: boolean;
}): ShadoPoseKey {
  const buckets = Math.max(1, options.alphaBuckets ?? 64);
  const singleFrame = options.singleFrame ?? false;
  const bucket = singleFrame ? 0 : quantizeAlpha(options.alpha, buckets);
  return {
    bankId: options.bankId,
    clipId: options.clipId,
    frame0: options.frame0,
    frame1: options.frame1,
    alphaBucket: bucket,
    alpha: singleFrame ? 0 : (bucket + 0.5) / buckets,
    singleFrame,
  };
}

export function posePaletteKeyString(key: ShadoPoseKey): string {
  return `${key.bankId}:${key.clipId}:${key.frame0}:${key.frame1}:${key.alphaBucket}:${key.singleFrame ? 1 : 0}`;
}

type CacheEntry = {
  key: string;
  slot: number;
  generation: number;
  refCount: number;
  lastUsedFrame: number;
  request: ShadoPoseKey;
  dirty: boolean;
};

/**
 * Slot allocator + request-buffer builder. Deliberately free of any GPU types so
 * the allocation policy is unit-testable without a device; the Babylon binding
 * lives in {@link ShadoVatPoseCache}.
 */
export class ShadoPoseSlotTable {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly bySlot: (CacheEntry | undefined)[];
  private readonly free: number[] = [];
  private generation = 1;
  private frame = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('Pose slot table needs a positive capacity');
    this.bySlot = new Array(capacity).fill(undefined);
    for (let slot = capacity - 1; slot >= 0; slot--) this.free.push(slot);
  }

  /** Advance the frame counter used for LRU ordering. */
  public beginFrame(): void {
    this.frame++;
  }

  /**
   * Reserve a slot for `key`, reusing the existing one when the pose is already
   * resident. Returns the slot plus the generation it was issued under.
   */
  public acquire(key: ShadoPoseKey): ShadoPoseSlot {
    const id = posePaletteKeyString(key);
    const existing = this.entries.get(id);
    if (existing) {
      existing.refCount++;
      existing.lastUsedFrame = this.frame;
      this.hits++;
      return { slot: existing.slot, generation: existing.generation };
    }

    this.misses++;
    const slot = this.free.pop() ?? this.evictLeastRecentlyUsed();
    const entry: CacheEntry = {
      key: id,
      slot,
      generation: this.generation++,
      refCount: 1,
      lastUsedFrame: this.frame,
      request: key,
      dirty: true,
    };
    this.entries.set(id, entry);
    this.bySlot[slot] = entry;
    return { slot, generation: entry.generation };
  }

  /** Drop one reference. Unreferenced slots stay resident until evicted. */
  public release(slot: number): void {
    const entry = this.bySlot[slot];
    if (entry && entry.refCount > 0) entry.refCount--;
  }

  /** True when `handle` still refers to the pose it was issued for. */
  public isLive(handle: ShadoPoseSlot): boolean {
    const entry = this.bySlot[handle.slot];
    return !!entry && entry.generation === handle.generation;
  }

  /** Poses that need a resolve dispatch this frame. */
  public pendingRequests(): CacheEntry[] {
    return [...this.entries.values()].filter(entry => entry.dirty);
  }

  public markResolved(): void {
    for (const entry of this.entries.values()) entry.dirty = false;
  }

  /**
   * Pack pending poses into the request buffer layout the resolve shader reads.
   * Returns the number of poses written.
   */
  public buildRequestBuffer(target: Uint32Array, boneCount: number): number {
    const pending = this.pendingRequests();
    const capacity = Math.floor(target.length / POSE_REQUEST_WORDS);
    const count = Math.min(pending.length, capacity);
    const floats = new Float32Array(target.buffer, target.byteOffset, target.length);
    for (let i = 0; i < count; i++) {
      const entry = pending[i];
      const base = i * POSE_REQUEST_WORDS;
      target[base + 0] = entry.request.frame0 >>> 0;
      target[base + 1] = entry.request.frame1 >>> 0;
      floats[base + 2] = entry.request.singleFrame ? 0 : entry.request.alpha;
      target[base + 3] = entry.slot >>> 0;
      target[base + 4] = boneCount >>> 0;
      target[base + 5] = entry.request.singleFrame ? 1 : 0;
      target[base + 6] = 0;
      target[base + 7] = 0;
    }
    return count;
  }

  public getStats(paletteBytes: number, requestBytes: number): ShadoPoseCacheStats {
    let live = 0;
    for (const entry of this.entries.values()) if (entry.refCount > 0) live++;
    return {
      capacity: this.capacity,
      live,
      resident: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      paletteBytes,
      requestBytes,
    };
  }

  private evictLeastRecentlyUsed(): number {
    let victim: CacheEntry | undefined;
    for (const entry of this.entries.values()) {
      if (entry.refCount > 0) continue;
      if (!victim || entry.lastUsedFrame < victim.lastUsedFrame) victim = entry;
    }
    if (!victim) {
      throw new Error(
        `Pose palette exhausted: all ${this.capacity} slots are referenced this frame. ` +
          'Raise maxPoses or increase phase cohorting.'
      );
    }
    this.entries.delete(victim.key);
    this.bySlot[victim.slot] = undefined;
    this.evictions++;
    return victim.slot;
  }
}

/**
 * Reference implementation of the resolve compute shader, in plain TypeScript.
 *
 * This exists so the numeric behaviour can be unit-tested without a GPU: the
 * WGSL below is a direct transliteration of this function, and the tests assert
 * that resolving a pose then skinning equals skinning directly from two frames.
 */
export function resolvePoseDQ(
  frame0Real: readonly number[],
  frame0Dual: readonly number[],
  frame1Real: readonly number[],
  frame1Dual: readonly number[],
  alpha: number
): { real: number[]; dual: number[] } {
  let real1 = [...frame1Real];
  let dual1 = [...frame1Dual];

  // Hemisphere align frame1 against frame0 before interpolating; q and -q are the
  // same rotation but blend to garbage. Real and dual must flip together.
  const dot01 =
    frame0Real[0] * real1[0] +
    frame0Real[1] * real1[1] +
    frame0Real[2] * real1[2] +
    frame0Real[3] * real1[3];
  if (dot01 < 0) {
    real1 = real1.map(v => -v);
    dual1 = dual1.map(v => -v);
  }

  const real = frame0Real.map((v, i) => v + (real1[i] - v) * alpha);
  const dual = frame0Dual.map((v, i) => v + (dual1[i] - v) * alpha);

  const lengthSquared = real.reduce((sum, v) => sum + v * v, 0);
  const inverseLength = 1 / Math.sqrt(Math.max(lengthSquared, 1e-20));
  const normalizedReal = real.map(v => v * inverseLength);
  const scaledDual = dual.map(v => v * inverseLength);

  // Re-establish the unit-DQ orthogonality condition dot(real, dual) == 0.
  const cross = normalizedReal.reduce((sum, v, i) => sum + v * scaledDual[i], 0);
  const orthogonalDual = scaledDual.map((v, i) => v - normalizedReal[i] * cross);

  return { real: normalizedReal, dual: orthogonalDual };
}

/**
 * WGSL for the pose resolve pass.
 *
 * Dispatch shape is (ceil(boneCount / 64), activePoseCount, 1): x indexes bones,
 * y indexes pose requests.
 */
export function emitPoseResolveWGSL(workgroupSize = 64): string {
  return `
// Shado active pose-palette resolve.
// One invocation per (pose request, bone). Writes one packed DQ per bone.

@group(0) @binding(0) var<storage, read> poseRequests: array<u32>;
@group(0) @binding(1) var dqAtlas: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> posePalette: array<vec4u>;
@group(0) @binding(3) var<storage, read_write> poseScales: array<f32>;
@group(0) @binding(4) var<storage, read> atlasParams: array<u32>;

struct DQ { real: vec4f, dual: vec4f, scale: f32 }

// Mirrors fetchBoneDQScale() in the render path and fetchBone() in the
// pre-skin compute: framesX complete palettes may share one atlas row.
fn fetchBone(boneIndex: i32, frame: i32) -> DQ {
  let width  = i32(atlasParams[0]);
  let tilesX = i32(atlasParams[1]);
  let framesX = i32(atlasParams[2]);
  let stride = i32(atlasParams[3]);
  let clamped = clamp(boneIndex, 0, tilesX * width - 1);
  let x = clamped % width;
  let tile = clamped / width;
  let frameColumn = frame % framesX;
  let frameGridRow = frame / framesX;
  let y = frameGridRow * tilesX + tile;
  let baseX = frameColumn * width * stride + x * stride;
  let real = textureLoad(dqAtlas, vec2i(baseX, y), 0);
  let dual = textureLoad(dqAtlas, vec2i(baseX + 1, y), 0);
  var scale = 1.0;
  if (atlasParams[4] != 0u && stride >= 3) {
    scale = textureLoad(dqAtlas, vec2i(baseX + 2, y), 0).x;
  }
  return DQ(real, dual, scale);
}

fn packDQ(real: vec4f, dual: vec4f) -> vec4u {
  return vec4u(
    pack2x16float(real.xy),
    pack2x16float(real.zw),
    pack2x16float(dual.xy),
    pack2x16float(dual.zw)
  );
}

@compute @workgroup_size(${workgroupSize}, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let requestBase = id.y * ${POSE_REQUEST_WORDS}u;
  let boneCount = poseRequests[requestBase + 4u];
  let bone = id.x;
  if (bone >= boneCount) { return; }

  let frame0 = i32(poseRequests[requestBase + 0u]);
  let frame1 = i32(poseRequests[requestBase + 1u]);
  let alpha = bitcast<f32>(poseRequests[requestBase + 2u]);
  let slot = poseRequests[requestBase + 3u];
  let singleFrame = poseRequests[requestBase + 5u] != 0u;

  let dq0 = fetchBone(i32(bone), frame0);
  var real = dq0.real;
  var dual = dq0.dual;
  var scale = dq0.scale;

  if (!singleFrame) {
    let dq1 = fetchBone(i32(bone), frame1);
    var real1 = dq1.real;
    var dual1 = dq1.dual;
    if (dot(real, real1) < 0.0) {
      real1 = -real1;
      dual1 = -dual1;
    }
    real = mix(real, real1, alpha);
    dual = mix(dual, dual1, alpha);
    scale = mix(scale, dq1.scale, alpha);
  }

  let inverseLength = inverseSqrt(max(dot(real, real), 1e-20));
  real = real * inverseLength;
  dual = dual * inverseLength;
  dual = dual - real * dot(real, dual);

  let index = slot * boneCount + bone;
  posePalette[index] = packDQ(real, dual);
  poseScales[index] = scale;
}
`;
}

/**
 * WGSL helpers consumers include to read the resolved palette. Replaces the
 * two-frame `fetchBone` in the pre-skin compute and the render path.
 */
export function emitPoseFetchWGSL(): string {
  return `
// Read one already-resolved bone DQ. No frame interpolation, no atlas access.
fn fetchBoneFromPalette(poseSlot: u32, boneCount: u32, boneIndex: i32) -> DQScale {
  let bone = u32(clamp(boneIndex, 0, i32(boneCount) - 1));
  let index = poseSlot * boneCount + bone;
  let packed = posePalette[index];
  let rxy = unpack2x16float(packed.x);
  let rzw = unpack2x16float(packed.y);
  let dxy = unpack2x16float(packed.z);
  let dzw = unpack2x16float(packed.w);
  return DQScale(
    vec4f(rxy.x, rxy.y, rzw.x, rzw.y),
    vec4f(dxy.x, dxy.y, dzw.x, dzw.y),
    poseScales[index]
  );
}
`;
}
