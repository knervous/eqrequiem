import { SHADO_WORLD_REDUCER_WASM_BASE64 } from './world-reducer-wasm.generated';
import type { ShadoWorldSpatialPackage, WorldVec3 } from './types';
import type {
  ShadoEntityVisibilitySoA,
  ShadoEntityVisibilityOptions,
} from './ShadoWorldVisibilityCoordinator';

const CONTROL_LENGTH = 16;

export const ShadoVisibilityWorkerControl = {
  RequestedGeneration: 0,
  CompletedGeneration: 1,
  PublishedOutputBuffer: 2,
  EntityCount: 3,
  ResultCount0: 4,
  ResultCount1: 5,
  SpatialRevision: 6,
  WorkerDurationMicros: 7,
  WorkerState: 8,
  ResultEntityCount0: 9,
  ResultEntityCount1: 10,
  CandidateCount: 11,
  HierarchyRebuildMicros: 12,
  CopiedInputBytes: 13,
  PublishedFlagBytes: 14,
} as const;

export type ShadoEntityVisibilityWorkerLayout = {
  byteLength: number;
  capacity: number;
  controlOffset: number;
  positionXOffset: number;
  positionYOffset: number;
  positionZOffset: number;
  radiusOffset: number;
  enabledOffset: number;
  phaseMaskOffset: number;
  visibleIndicesOffsets: readonly [number, number];
  flagsOffsets: readonly [number, number];
  flagsCapacity: number;
};

export type ShadoEntityVisibilityWorkerResult = {
  generation: number;
  visibleIndices: Uint32Array;
  flags: Uint8Array;
  workerDurationMs: number;
  candidateCount: number;
  hierarchyRebuildMs: number;
  copiedInputBytes: number;
  publishedFlagBytes: number;
};

export type ShadoEntityVisibilityWorkerStats = {
  requestedGeneration: number;
  completedGeneration: number;
  workerDurationMs: number;
  inFlight: boolean;
  hasPendingRequest: boolean;
  candidateCount: number;
  hierarchyRebuildMs: number;
  copiedInputBytes: number;
  publishedFlagBytes: number;
  scheduledSkips: number;
  error: string | null;
};

type WorkerRequest = {
  type: 'reduce';
  generation: number;
  planes: Float32Array;
  cellFlags: Uint8Array;
  camera: WorldVec3;
  maxDistance: number;
  outsideWorldVisible: boolean;
  activePhaseMask: number;
  radiusScale: number;
};

type WorkerMessage =
  { type: 'ready' } | { type: 'complete'; generation: number } | { type: 'error'; message: string };

export type ShadoVisibilityWorkerPort = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerMessage>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  terminate(): void;
};

export type ShadoEntityVisibilityWorkerOptions = {
  capacity: number;
  /** Publish entity-indexed reason flags. Compact-only mode avoids the full-size copy. */
  publishFlags?: boolean;
  workerFactory?: (source: string) => ShadoVisibilityWorkerPort;
};

export type ShadoEntityVisibilitySchedule = {
  cameraEpoch: number;
  cellEpoch: number;
  policyEpoch?: number;
  minimumIntervalMs?: number;
  nowMs?: number;
  force?: boolean;
};

export type ShadoEntityVisibilityWorkerWorld = {
  tiles: Pick<ShadoWorldSpatialPackage['tiles'], 'x' | 'z' | 'size' | 'originX' | 'originZ'>;
};

/**
 * Fixed-capacity, SharedArrayBuffer-backed visibility projection.
 *
 * Update only entities that moved or changed bounds. Publishing a visibility
 * request never walks this projection, so request cost does not grow with the
 * total entity count.
 */
export class ShadoEntityVisibilityProjection {
  public readonly positionX: Float32Array;
  public readonly positionY: Float32Array;
  public readonly positionZ: Float32Array;
  public readonly radius: Float32Array;
  public readonly enabled: Uint8Array;
  public readonly phaseMask: Uint32Array;

  public constructor(
    public readonly buffer: SharedArrayBuffer,
    public readonly layout: ShadoEntityVisibilityWorkerLayout
  ) {
    this.positionX = new Float32Array(buffer, layout.positionXOffset, layout.capacity);
    this.positionY = new Float32Array(buffer, layout.positionYOffset, layout.capacity);
    this.positionZ = new Float32Array(buffer, layout.positionZOffset, layout.capacity);
    this.radius = new Float32Array(buffer, layout.radiusOffset, layout.capacity);
    this.enabled = new Uint8Array(buffer, layout.enabledOffset, layout.capacity);
    this.phaseMask = new Uint32Array(buffer, layout.phaseMaskOffset, layout.capacity);
  }

  public get capacity(): number {
    return this.layout.capacity;
  }

  public get count(): number {
    return Atomics.load(this.control, ShadoVisibilityWorkerControl.EntityCount);
  }

  public set count(value: number) {
    const count = Math.max(0, value | 0);
    if (count > this.capacity) {
      throw new RangeError(
        `Visibility projection count ${count} exceeds reserved capacity ${this.capacity}`
      );
    }
    Atomics.store(this.control, ShadoVisibilityWorkerControl.EntityCount, count);
    Atomics.add(this.control, ShadoVisibilityWorkerControl.SpatialRevision, 1);
  }

  public setEntity(index: number, x: number, y: number, z: number, radius: number): void {
    this.assertIndex(index);
    this.positionX[index] = x;
    this.positionY[index] = y;
    this.positionZ[index] = z;
    this.radius[index] = Math.max(0, radius);
    this.markSpatialChange();
  }

  public setEntityPolicy(index: number, enabled: boolean, phaseMask = 0xffffffff): void {
    this.assertIndex(index);
    this.enabled[index] = enabled ? 1 : 0;
    this.phaseMask[index] = phaseMask >>> 0;
  }

  /** One-time/bulk synchronization. Prefer setEntity for normal moving updates. */
  public load(entities: ShadoEntityVisibilitySoA, defaultRadius = 0): void {
    const count = Math.max(0, entities.count | 0);
    if (count > this.capacity) {
      throw new RangeError(
        `Visibility projection input ${count} exceeds reserved capacity ${this.capacity}`
      );
    }
    copyNumbers(this.positionX, entities.positionX, count);
    copyNumbers(this.positionY, entities.positionY, count);
    copyNumbers(this.positionZ, entities.positionZ, count);
    if (entities.radius) copyNumbers(this.radius, entities.radius, count);
    else this.radius.fill(Math.max(0, defaultRadius), 0, count);
    this.enabled.fill(1, 0, count);
    this.phaseMask.fill(0xffffffff, 0, count);
    this.count = count;
  }

  public markSpatialChange(): number {
    return Atomics.add(this.control, ShadoVisibilityWorkerControl.SpatialRevision, 1) + 1;
  }

  private get control(): Int32Array {
    return new Int32Array(this.buffer, this.layout.controlOffset, CONTROL_LENGTH);
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.capacity) {
      throw new RangeError(`Visibility projection index ${index} is out of range`);
    }
  }
}

/**
 * Main-thread controller for the amortized entity-visibility worker.
 *
 * It never waits for visibility. acquireLatest() returns null until a complete
 * generation is available, and callers continue rendering the previous result.
 */
export class ShadoEntityVisibilityWorker {
  public readonly projection: ShadoEntityVisibilityProjection;

  private readonly control: Int32Array;
  private readonly visibleIndices: readonly [Uint32Array, Uint32Array];
  private readonly flags: readonly [Uint8Array, Uint8Array];
  private inFlight = false;
  private pendingRequest: WorkerRequest | null = null;
  private consumedGeneration = 0;
  private disposed = false;
  private error: string | null = null;
  private lastScheduledSignature = '';
  private lastScheduledAt = Number.NEGATIVE_INFINITY;
  private scheduledSkips = 0;

  private constructor(
    private readonly worker: ShadoVisibilityWorkerPort,
    buffer: SharedArrayBuffer,
    public readonly layout: ShadoEntityVisibilityWorkerLayout,
    private readonly cellCount: number
  ) {
    this.control = new Int32Array(buffer, layout.controlOffset, CONTROL_LENGTH);
    this.projection = new ShadoEntityVisibilityProjection(buffer, layout);
    this.visibleIndices = [
      new Uint32Array(buffer, layout.visibleIndicesOffsets[0], layout.capacity),
      new Uint32Array(buffer, layout.visibleIndicesOffsets[1], layout.capacity),
    ];
    this.flags = [
      new Uint8Array(buffer, layout.flagsOffsets[0], layout.flagsCapacity),
      new Uint8Array(buffer, layout.flagsOffsets[1], layout.flagsCapacity),
    ];
    worker.addEventListener('message', event => this.handleWorkerMessage(event.data));
    worker.addEventListener('error', event => {
      this.fail(event.error instanceof Error ? event.error.message : event.message);
    });
  }

  public static get supported(): boolean {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined' &&
      typeof Worker !== 'undefined'
    );
  }

  public static async create(
    world: ShadoEntityVisibilityWorkerWorld,
    options: ShadoEntityVisibilityWorkerOptions
  ): Promise<ShadoEntityVisibilityWorker> {
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error(
        'SharedArrayBuffer is unavailable; visibility offload requires cross-origin isolation'
      );
    }
    const layout = createShadoEntityVisibilityWorkerLayout(
      options.capacity,
      options.publishFlags !== false
    );
    const buffer = new SharedArrayBuffer(layout.byteLength);
    const workerFactory = options.workerFactory ?? createBrowserWorker;
    const worker = workerFactory(SHADO_ENTITY_VISIBILITY_WORKER_SOURCE);
    const controller = new ShadoEntityVisibilityWorker(
      worker,
      buffer,
      layout,
      world.tiles.x.length
    );
    const ready = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'ready') resolve();
        if (event.data.type === 'error') reject(new Error(event.data.message));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', event => reject(event.error ?? new Error(event.message)));
    });
    const wasmBytes = decodeBase64(SHADO_WORLD_REDUCER_WASM_BASE64);
    const wasmBuffer = wasmBytes.buffer.slice(
      wasmBytes.byteOffset,
      wasmBytes.byteOffset + wasmBytes.byteLength
    ) as ArrayBuffer;
    worker.postMessage(
      {
        type: 'init',
        buffer,
        layout,
        publishFlags: layout.flagsCapacity === layout.capacity,
        wasmBytes: wasmBuffer,
        tiles: {
          x: world.tiles.x,
          z: world.tiles.z,
          size: world.tiles.size,
          originX: world.tiles.originX,
          originZ: world.tiles.originZ,
        },
      },
      [wasmBuffer]
    );
    try {
      await ready;
      return controller;
    } catch (error) {
      controller.dispose();
      throw error;
    }
  }

  /**
   * Publishes a small camera/cell snapshot. If work is already running, the
   * previous pending snapshot is replaced rather than queued.
   */
  public request(
    planes: ArrayLike<number>,
    cellFlags: ArrayLike<number>,
    options: ShadoEntityVisibilityOptions & {
      activePhaseMask?: number;
      /** Multiplies projected radii inside the worker; useful when rows store scale. */
      radiusScale?: number;
    }
  ): number {
    if (this.disposed) throw new Error('Visibility worker has been disposed');
    if (this.error) throw new Error(`Visibility worker failed: ${this.error}`);
    if (planes.length < 24) {
      throw new Error('Entity visibility requires six vec4 frustum planes');
    }
    const generation =
      Atomics.add(this.control, ShadoVisibilityWorkerControl.RequestedGeneration, 1) + 1;
    const cellSnapshot = new Uint8Array(this.cellCount);
    cellSnapshot.set(Uint8Array.from(cellFlags as ArrayLike<number>).subarray(0, this.cellCount));
    const request: WorkerRequest = {
      type: 'reduce',
      generation,
      planes: Float32Array.from(planes as ArrayLike<number>).subarray(0, 24),
      cellFlags: cellSnapshot,
      camera: [...options.camera] as WorldVec3,
      maxDistance: Math.max(0, options.maxDistance ?? 0),
      outsideWorldVisible: options.outsideWorldVisible !== false,
      activePhaseMask: (options.activePhaseMask ?? 0xffffffff) >>> 0,
      radiusScale: Math.max(0, options.radiusScale ?? 1),
    };
    if (this.inFlight) this.pendingRequest = request;
    else this.dispatch(request);
    return generation;
  }

  /**
   * Issues visibility work only when an input epoch changes and the configured
   * interval has elapsed. Callers keep rendering the last complete generation.
   */
  public requestScheduled(
    planes: ArrayLike<number>,
    cellFlags: ArrayLike<number>,
    options: ShadoEntityVisibilityOptions & {
      activePhaseMask?: number;
      radiusScale?: number;
    },
    schedule: ShadoEntityVisibilitySchedule
  ): number | null {
    const spatialEpoch = Atomics.load(this.control, ShadoVisibilityWorkerControl.SpatialRevision);
    const signature = [
      schedule.cameraEpoch,
      schedule.cellEpoch,
      schedule.policyEpoch ?? 0,
      spatialEpoch,
    ].join(':');
    const now = schedule.nowMs ?? performance.now();
    const minimumIntervalMs = Math.max(0, schedule.minimumIntervalMs ?? 0);
    if (
      !schedule.force &&
      (signature === this.lastScheduledSignature || now - this.lastScheduledAt < minimumIntervalMs)
    ) {
      this.scheduledSkips++;
      return null;
    }
    this.lastScheduledSignature = signature;
    this.lastScheduledAt = now;
    return this.request(planes, cellFlags, options);
  }

  /**
   * Acquires the latest complete shared output without waiting.
   *
   * Returned views are valid for immediate consumption. Do not retain them
   * across multiple later generations because the worker reuses both buffers.
   */
  public acquireLatest(): ShadoEntityVisibilityWorkerResult | null {
    const generation = Atomics.load(this.control, ShadoVisibilityWorkerControl.CompletedGeneration);
    if (generation === this.consumedGeneration) return null;
    const output = Atomics.load(
      this.control,
      ShadoVisibilityWorkerControl.PublishedOutputBuffer
    ) as 0 | 1;
    const count = Atomics.load(
      this.control,
      output === 0
        ? ShadoVisibilityWorkerControl.ResultCount0
        : ShadoVisibilityWorkerControl.ResultCount1
    );
    const entityCount = Atomics.load(
      this.control,
      output === 0
        ? ShadoVisibilityWorkerControl.ResultEntityCount0
        : ShadoVisibilityWorkerControl.ResultEntityCount1
    );
    this.consumedGeneration = generation;
    return {
      generation,
      visibleIndices: this.visibleIndices[output].subarray(0, count),
      flags: this.flags[output].subarray(0, entityCount),
      workerDurationMs:
        Atomics.load(this.control, ShadoVisibilityWorkerControl.WorkerDurationMicros) / 1000,
      candidateCount: Atomics.load(this.control, ShadoVisibilityWorkerControl.CandidateCount),
      hierarchyRebuildMs:
        Atomics.load(this.control, ShadoVisibilityWorkerControl.HierarchyRebuildMicros) / 1000,
      copiedInputBytes: Atomics.load(this.control, ShadoVisibilityWorkerControl.CopiedInputBytes),
      publishedFlagBytes: Atomics.load(
        this.control,
        ShadoVisibilityWorkerControl.PublishedFlagBytes
      ),
    };
  }

  public get stats(): ShadoEntityVisibilityWorkerStats {
    return {
      requestedGeneration: Atomics.load(
        this.control,
        ShadoVisibilityWorkerControl.RequestedGeneration
      ),
      completedGeneration: Atomics.load(
        this.control,
        ShadoVisibilityWorkerControl.CompletedGeneration
      ),
      workerDurationMs:
        Atomics.load(this.control, ShadoVisibilityWorkerControl.WorkerDurationMicros) / 1000,
      inFlight: this.inFlight,
      hasPendingRequest: this.pendingRequest !== null,
      candidateCount: Atomics.load(this.control, ShadoVisibilityWorkerControl.CandidateCount),
      hierarchyRebuildMs:
        Atomics.load(this.control, ShadoVisibilityWorkerControl.HierarchyRebuildMicros) / 1000,
      copiedInputBytes: Atomics.load(this.control, ShadoVisibilityWorkerControl.CopiedInputBytes),
      publishedFlagBytes: Atomics.load(
        this.control,
        ShadoVisibilityWorkerControl.PublishedFlagBytes
      ),
      scheduledSkips: this.scheduledSkips,
      error: this.error,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingRequest = null;
    this.worker.terminate();
  }

  private dispatch(request: WorkerRequest): void {
    this.inFlight = true;
    this.worker.postMessage(request, [
      request.planes.buffer as ArrayBuffer,
      request.cellFlags.buffer as ArrayBuffer,
    ]);
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (message.type === 'error') {
      this.fail(message.message);
      return;
    }
    if (message.type !== 'complete') return;
    this.inFlight = false;
    const pending = this.pendingRequest;
    this.pendingRequest = null;
    if (pending && !this.disposed) this.dispatch(pending);
  }

  private fail(message: string): void {
    this.error = message;
    this.inFlight = false;
    this.pendingRequest = null;
  }
}

export function createShadoEntityVisibilityWorkerLayout(
  requestedCapacity: number,
  publishFlags = true
): ShadoEntityVisibilityWorkerLayout {
  const capacity = Math.max(1, requestedCapacity | 0);
  let offset = CONTROL_LENGTH * Int32Array.BYTES_PER_ELEMENT;
  const take = (bytes: number, alignment: number): number => {
    offset = Math.ceil(offset / alignment) * alignment;
    const result = offset;
    offset += bytes;
    return result;
  };
  const floats = capacity * Float32Array.BYTES_PER_ELEMENT;
  const indices = capacity * Uint32Array.BYTES_PER_ELEMENT;
  const positionXOffset = take(floats, 4);
  const positionYOffset = take(floats, 4);
  const positionZOffset = take(floats, 4);
  const radiusOffset = take(floats, 4);
  const enabledOffset = take(capacity, 1);
  const phaseMaskOffset = take(indices, 4);
  const visibleIndicesOffsets = [take(indices, 4), take(indices, 4)] as const;
  const flagsCapacity = publishFlags ? capacity : 1;
  const flagsOffsets = [take(flagsCapacity, 1), take(flagsCapacity, 1)] as const;
  return {
    byteLength: offset,
    capacity,
    controlOffset: 0,
    positionXOffset,
    positionYOffset,
    positionZOffset,
    radiusOffset,
    enabledOffset,
    phaseMaskOffset,
    visibleIndicesOffsets,
    flagsOffsets,
    flagsCapacity,
  };
}

function copyNumbers(target: Float32Array, source: ArrayLike<number>, count: number): void {
  for (let i = 0; i < count; i++) target[i] = Number(source[i] ?? 0);
}

function createBrowserWorker(source: string): ShadoVisibilityWorkerPort {
  if (typeof Worker === 'undefined') {
    throw new Error('Web Workers are unavailable in this environment');
  }
  const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(objectUrl, { name: 'shado-entity-visibility' });
  URL.revokeObjectURL(objectUrl);
  return worker;
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

const SHADO_ENTITY_VISIBILITY_WORKER_SOURCE = String.raw`
let state;

self.onmessage = async event => {
  try {
    const message = event.data;
    if (message.type === 'init') {
      state = await createState(message);
      self.postMessage({ type: 'ready' });
      return;
    }
    if (message.type === 'reduce') reduce(message);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

async function createState(message) {
  const { instance } = await WebAssembly.instantiate(message.wasmBytes, {});
  const wasm = instance.exports;
  const { layout, buffer, tiles } = message;
  const control = new Int32Array(buffer, layout.controlOffset, 16);
  const positions = [
    new Float32Array(buffer, layout.positionXOffset, layout.capacity),
    new Float32Array(buffer, layout.positionYOffset, layout.capacity),
    new Float32Array(buffer, layout.positionZOffset, layout.capacity),
  ];
  const radius = new Float32Array(buffer, layout.radiusOffset, layout.capacity);
  const enabled = new Uint8Array(buffer, layout.enabledOffset, layout.capacity);
  const phaseMask = new Uint32Array(buffer, layout.phaseMaskOffset, layout.capacity);
  const sharedIndices = layout.visibleIndicesOffsets.map(
    offset => new Uint32Array(buffer, offset, layout.capacity)
  );
  const sharedFlags = layout.flagsOffsets.map(
    offset => new Uint8Array(buffer, offset, layout.flagsCapacity)
  );
  const minX = tiles.x.length ? Math.min(...tiles.x) : 0;
  const maxX = tiles.x.length ? Math.max(...tiles.x) : 0;
  const minZ = tiles.z.length ? Math.min(...tiles.z) : 0;
  const maxZ = tiles.z.length ? Math.max(...tiles.z) : 0;
  const gridWidth = maxX - minX + 1;
  const gridHeight = maxZ - minZ + 1;
  const tileLookup = new Int32Array(gridWidth * gridHeight).fill(-1);
  tiles.x.forEach((x, cell) => {
    tileLookup[(tiles.z[cell] - minZ) * gridWidth + x - minX] = cell;
  });
  const alloc = values => {
    const pointer = wasm.alloc(values.byteLength) >>> 0;
    if (values instanceof Int32Array)
      new Int32Array(wasm.memory.buffer, pointer, values.length).set(values);
    return pointer;
  };
  return {
    wasm,
    layout,
    control,
    positions,
    radius,
    enabled,
    phaseMask,
    sharedIndices,
    sharedFlags,
    publishFlags: message.publishFlags,
    tiles,
    gridWidth,
    gridHeight,
    gridMinX: minX,
    gridMinZ: minZ,
    tileLookup,
    tileLookupPtr: alloc(tileLookup),
    descriptorPtr: wasm.alloc(88) >>> 0,
    planesPtr: wasm.alloc(24 * 4) >>> 0,
    cellFlagsPtr: wasm.alloc(Math.max(1, tiles.x.length)) >>> 0,
    capacity: 0,
    xPtr: 0,
    yPtr: 0,
    zPtr: 0,
    radiusPtr: 0,
    outputPtr: 0,
    flagsPtr: 0,
    hierarchyRevision: -1,
    hierarchyCount: -1,
    cellOffsets: new Uint32Array(tiles.x.length + 2),
    binMembers: new Uint32Array(layout.capacity),
    candidateIds: new Uint32Array(layout.capacity),
  };
}

function ensureCapacity(count) {
  if (count <= state.capacity) return;
  let capacity = Math.max(4, state.capacity);
  while (capacity < count) capacity *= 2;
  state.capacity = capacity;
  state.xPtr = state.wasm.alloc(capacity * 4) >>> 0;
  state.yPtr = state.wasm.alloc(capacity * 4) >>> 0;
  state.zPtr = state.wasm.alloc(capacity * 4) >>> 0;
  state.radiusPtr = state.wasm.alloc(capacity * 4) >>> 0;
  state.outputPtr = state.wasm.alloc(capacity * 4) >>> 0;
  state.flagsPtr = state.wasm.alloc(capacity) >>> 0;
}

function locateCell(x, z) {
  if (!state.tiles.x.length || !(state.tiles.size > 0)) return -1;
  const tileX = Math.floor((x - state.tiles.originX) / state.tiles.size);
  const tileZ = Math.floor((z - state.tiles.originZ) / state.tiles.size);
  const localX = tileX - state.gridMinX;
  const localZ = tileZ - state.gridMinZ;
  if (
    localX < 0 || localX >= state.gridWidth ||
    localZ < 0 || localZ >= state.gridHeight
  ) return -1;
  return state.tileLookup[localZ * state.gridWidth + localX];
}

function rebuildHierarchy(count, revision) {
  const bucketCount = state.tiles.x.length + 1;
  const outsideBucket = bucketCount - 1;
  const counts = new Uint32Array(bucketCount);
  for (let entity = 0; entity < count; entity++) {
    const cell = locateCell(state.positions[0][entity], state.positions[2][entity]);
    counts[cell < 0 ? outsideBucket : cell]++;
  }
  state.cellOffsets[0] = 0;
  for (let bucket = 0; bucket < bucketCount; bucket++) {
    state.cellOffsets[bucket + 1] = state.cellOffsets[bucket] + counts[bucket];
  }
  const cursors = state.cellOffsets.slice(0, bucketCount);
  for (let entity = 0; entity < count; entity++) {
    const cell = locateCell(state.positions[0][entity], state.positions[2][entity]);
    const bucket = cell < 0 ? outsideBucket : cell;
    state.binMembers[cursors[bucket]++] = entity;
  }
  state.hierarchyRevision = revision;
  state.hierarchyCount = count;
}

function prepareCandidateIds(count, message) {
  // Full reason flags require visiting every entity. Compact-only consumers can
  // skip whole cells before copying positions into private WASM memory.
  if (state.publishFlags || !state.tiles.x.length) {
    for (let entity = 0; entity < count; entity++) state.candidateIds[entity] = entity;
    return count;
  }
  let candidateCount = 0;
  const requiredCellBits = 0x71;
  for (let cell = 0; cell < state.tiles.x.length; cell++) {
    if ((message.cellFlags[cell] & requiredCellBits) !== requiredCellBits) continue;
    const start = state.cellOffsets[cell];
    const end = state.cellOffsets[cell + 1];
    state.candidateIds.set(state.binMembers.subarray(start, end), candidateCount);
    candidateCount += end - start;
  }
  if (message.outsideWorldVisible) {
    const outsideBucket = state.tiles.x.length;
    const start = state.cellOffsets[outsideBucket];
    const end = state.cellOffsets[outsideBucket + 1];
    state.candidateIds.set(state.binMembers.subarray(start, end), candidateCount);
    candidateCount += end - start;
  }
  return candidateCount;
}

function reduce(message) {
  const started = performance.now();
  const count = Math.max(0, Atomics.load(state.control, 3));
  const revision = Atomics.load(state.control, 6);
  let hierarchyRebuildMs = 0;
  if (
    !state.publishFlags &&
    state.tiles.x.length &&
    (revision !== state.hierarchyRevision || count !== state.hierarchyCount)
  ) {
    const rebuildStarted = performance.now();
    rebuildHierarchy(count, revision);
    hierarchyRebuildMs = performance.now() - rebuildStarted;
  }
  const candidateCount = prepareCandidateIds(count, message);
  ensureCapacity(candidateCount);
  const memory = state.wasm.memory.buffer;
  const wasmX = new Float32Array(memory, state.xPtr, candidateCount);
  const wasmY = new Float32Array(memory, state.yPtr, candidateCount);
  const wasmZ = new Float32Array(memory, state.zPtr, candidateCount);
  const wasmRadius = new Float32Array(memory, state.radiusPtr, candidateCount);
  for (let local = 0; local < candidateCount; local++) {
    const entity = state.candidateIds[local];
    wasmX[local] = state.positions[0][entity];
    wasmY[local] = state.positions[1][entity];
    wasmZ[local] = state.positions[2][entity];
    wasmRadius[local] = state.radius[entity] * message.radiusScale;
  }
  new Float32Array(memory, state.planesPtr, 24).set(message.planes);
  new Uint8Array(memory, state.cellFlagsPtr, state.tiles.x.length).set(message.cellFlags);
  const descriptor = new DataView(memory, state.descriptorPtr, 88);
  [
    candidateCount, state.xPtr, state.yPtr, state.zPtr, state.radiusPtr, state.planesPtr,
    state.cellFlagsPtr, state.tileLookupPtr,
  ].forEach((value, index) => descriptor.setUint32(index * 4, value >>> 0, true));
  descriptor.setInt32(32, state.gridWidth, true);
  descriptor.setInt32(36, state.gridHeight, true);
  descriptor.setInt32(40, state.gridMinX, true);
  descriptor.setInt32(44, state.gridMinZ, true);
  descriptor.setFloat32(48, state.tiles.originX, true);
  descriptor.setFloat32(52, state.tiles.originZ, true);
  descriptor.setFloat32(56, state.tiles.size, true);
  message.camera.forEach((value, axis) => descriptor.setFloat32(60 + axis * 4, value, true));
  descriptor.setFloat32(72, message.maxDistance, true);
  descriptor.setInt32(76, message.outsideWorldVisible ? 1 : 0, true);
  descriptor.setUint32(80, state.outputPtr, true);
  descriptor.setUint32(84, state.flagsPtr, true);
  const wasmVisibleCount = state.wasm.reduceEntityVisibility(state.descriptorPtr);
  if (wasmVisibleCount < 0 || wasmVisibleCount > candidateCount) {
    throw new Error('WASM visibility reducer returned invalid count ' + wasmVisibleCount);
  }
  const output = 1 - Atomics.load(state.control, 2);
  const wasmIndices = new Uint32Array(memory, state.outputPtr, wasmVisibleCount);
  const wasmFlags = new Uint8Array(memory, state.flagsPtr, candidateCount);
  if (state.publishFlags) {
    state.sharedFlags[output].set(wasmFlags, 0);
  }
  let visibleCount = 0;
  for (let i = 0; i < wasmVisibleCount; i++) {
    const local = wasmIndices[i];
    const entity = state.candidateIds[local];
    if (
      !state.enabled[entity] ||
      !(state.phaseMask[entity] & message.activePhaseMask)
    ) {
      if (state.publishFlags) state.sharedFlags[output][entity] &= 0x7f;
      continue;
    }
    state.sharedIndices[output][visibleCount++] = entity;
  }
  Atomics.store(state.control, output === 0 ? 4 : 5, visibleCount);
  Atomics.store(state.control, output === 0 ? 9 : 10, state.publishFlags ? count : 0);
  Atomics.store(state.control, 11, candidateCount);
  Atomics.store(state.control, 12, Math.max(0, Math.round(hierarchyRebuildMs * 1000)));
  Atomics.store(state.control, 13, candidateCount * 16);
  Atomics.store(state.control, 14, state.publishFlags ? count : 0);
  Atomics.store(state.control, 7, Math.max(0, Math.round((performance.now() - started) * 1000)));
  Atomics.store(state.control, 2, output);
  Atomics.store(state.control, 1, message.generation);
  self.postMessage({ type: 'complete', generation: message.generation });
}
`;
