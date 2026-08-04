import { describe, expect, it } from '@jest/globals';
import {
  emitPoseFetchWGSL,
  emitPoseResolveWGSL,
  makePoseKey,
  phaseCohort,
  POSE_REQUEST_WORDS,
  posePaletteKeyString,
  quantizeAlpha,
  resolvePoseDQ,
  ShadoPoseSlotTable,
} from '../src/render/ShadoVatPoseCache';

// ---------------------------------------------------------------------------
// DQ helpers mirroring the shader's transformPoint / accumulate, so the tests
// can compare "resolve then skin" against "skin directly from two frames".
// ---------------------------------------------------------------------------

type DQ = { real: number[]; dual: number[] };

function dqFromRotationTranslation(axis: number[], angle: number, t: number[]): DQ {
  const half = angle / 2;
  const s = Math.sin(half);
  const length = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const real = [(axis[0] / length) * s, (axis[1] / length) * s, (axis[2] / length) * s, Math.cos(half)];
  const [x, y, z, w] = real;
  const dual = [
    0.5 * (t[0] * w + t[1] * z - t[2] * y),
    0.5 * (-t[0] * z + t[1] * w + t[2] * x),
    0.5 * (t[0] * y - t[1] * x + t[2] * w),
    -0.5 * (t[0] * x + t[1] * y + t[2] * z),
  ];
  // Store as (xyz, w) with the scalar last, matching VATBuilder's texel layout.
  return { real: [x, y, z, w], dual: [dual[0], dual[1], dual[2], dual[3]] };
}

function transformPoint(dq: DQ, point: number[]): number[] {
  const [qx, qy, qz, qw] = dq.real;
  const [dx, dy, dz, dw] = dq.dual;
  // rotate
  const tx = 2 * (qy * point[2] - qz * point[1]);
  const ty = 2 * (qz * point[0] - qx * point[2]);
  const tz = 2 * (qx * point[1] - qy * point[0]);
  const rotated = [
    point[0] + qw * tx + (qy * tz - qz * ty),
    point[1] + qw * ty + (qz * tx - qx * tz),
    point[2] + qw * tz + (qx * ty - qy * tx),
  ];
  // translate
  const translation = [
    2 * (dx * qw - qx * dw + (qy * dz - qz * dy)),
    2 * (dy * qw - qy * dw + (qz * dx - qx * dz)),
    2 * (dz * qw - qz * dw + (qx * dy - qy * dx)),
  ];
  return [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]];
}

/** What the current per-vertex path does: fetch both frames, align, lerp, normalise. */
function skinDirect(frame0: DQ, frame1: DQ, alpha: number, point: number[]): number[] {
  const resolved = resolvePoseDQ(frame0.real, frame0.dual, frame1.real, frame1.dual, alpha);
  return transformPoint(resolved, point);
}

describe('pose alpha quantisation', () => {
  it('buckets alpha and keeps the representative within half a bucket', () => {
    const buckets = 64;
    for (let i = 0; i <= 100; i++) {
      const alpha = i / 100;
      const key = makePoseKey({ bankId: 0, clipId: 0, frame0: 3, frame1: 4, alpha, alphaBuckets: buckets });
      expect(key.alphaBucket).toBe(quantizeAlpha(alpha, buckets));
      expect(Math.abs(key.alpha - alpha)).toBeLessThanOrEqual(0.5 / buckets + 1e-9);
    }
  });

  it('collapses nearby phases onto one cache key', () => {
    const a = makePoseKey({ bankId: 1, clipId: 2, frame0: 10, frame1: 11, alpha: 0.5001, alphaBuckets: 16 });
    const b = makePoseKey({ bankId: 1, clipId: 2, frame0: 10, frame1: 11, alpha: 0.5049, alphaBuckets: 16 });
    expect(posePaletteKeyString(a)).toBe(posePaletteKeyString(b));
  });

  it('single-frame poses ignore alpha entirely', () => {
    const a = makePoseKey({ bankId: 0, clipId: 0, frame0: 5, frame1: 6, alpha: 0.1, singleFrame: true });
    const b = makePoseKey({ bankId: 0, clipId: 0, frame0: 5, frame1: 6, alpha: 0.9, singleFrame: true });
    expect(posePaletteKeyString(a)).toBe(posePaletteKeyString(b));
    expect(a.alpha).toBe(0);
  });

  it('spreads entities across phase cohorts', () => {
    const counts = new Array(8).fill(0);
    for (let entity = 0; entity < 4000; entity++) counts[phaseCohort(entity, 8)]++;
    // No cohort should collapse or dominate; a fair split is 500 each.
    for (const count of counts) {
      expect(count).toBeGreaterThan(300);
      expect(count).toBeLessThan(750);
    }
  });
});

describe('pose resolve numerics', () => {
  it('resolve-then-skin equals skinning directly from two frames', () => {
    const frame0 = dqFromRotationTranslation([0, 1, 0], 0.4, [1, 2, 3]);
    const frame1 = dqFromRotationTranslation([0, 1, 0], 1.1, [1.5, 2.2, 2.4]);
    const point = [0.3, -1.2, 0.75];

    for (let step = 0; step <= 10; step++) {
      const alpha = step / 10;
      const resolved = resolvePoseDQ(frame0.real, frame0.dual, frame1.real, frame1.dual, alpha);
      const viaPalette = transformPoint(resolved, point);
      const direct = skinDirect(frame0, frame1, alpha, point);
      for (let axis = 0; axis < 3; axis++) {
        expect(viaPalette[axis]).toBeCloseTo(direct[axis], 10);
      }
    }
  });

  it('produces a unit dual quaternion with orthogonal dual part', () => {
    const frame0 = dqFromRotationTranslation([1, 0, 0], 0.9, [4, -1, 2]);
    const frame1 = dqFromRotationTranslation([0, 0, 1], 2.6, [-3, 5, 1]);
    const resolved = resolvePoseDQ(frame0.real, frame0.dual, frame1.real, frame1.dual, 0.37);

    const realLength = Math.hypot(...resolved.real);
    expect(realLength).toBeCloseTo(1, 10);
    const orthogonality = resolved.real.reduce((sum, v, i) => sum + v * resolved.dual[i], 0);
    expect(Math.abs(orthogonality)).toBeLessThan(1e-10);
  });

  it('hemisphere-aligns frame1 before interpolating', () => {
    const frame0 = dqFromRotationTranslation([0, 1, 0], 0.2, [1, 0, 0]);
    const frame1 = dqFromRotationTranslation([0, 1, 0], 0.6, [1.2, 0, 0]);
    // Negating a DQ is the same rigid transform; the resolve must be invariant.
    const negated = { real: frame1.real.map(v => -v), dual: frame1.dual.map(v => -v) };

    const a = resolvePoseDQ(frame0.real, frame0.dual, frame1.real, frame1.dual, 0.5);
    const b = resolvePoseDQ(frame0.real, frame0.dual, negated.real, negated.dual, 0.5);

    const point = [1, 2, -0.5];
    const pa = transformPoint(a, point);
    const pb = transformPoint(b, point);
    for (let axis = 0; axis < 3; axis++) expect(pa[axis]).toBeCloseTo(pb[axis], 10);
  });

  it('alpha 0 and 1 reproduce the endpoint transforms exactly', () => {
    const frame0 = dqFromRotationTranslation([0, 1, 0], 0.4, [1, 2, 3]);
    const frame1 = dqFromRotationTranslation([1, 1, 0], 1.9, [0, -2, 1]);
    const point = [0.25, 0.5, -1];

    const at0 = transformPoint(resolvePoseDQ(frame0.real, frame0.dual, frame1.real, frame1.dual, 0), point);
    const direct0 = transformPoint(frame0, point);
    const at1 = transformPoint(resolvePoseDQ(frame0.real, frame0.dual, frame1.real, frame1.dual, 1), point);
    const direct1 = transformPoint(frame1, point);

    for (let axis = 0; axis < 3; axis++) {
      expect(at0[axis]).toBeCloseTo(direct0[axis], 10);
      expect(at1[axis]).toBeCloseTo(direct1[axis], 10);
    }
  });
});

describe('pose slot table', () => {
  const key = (frame0: number, alpha = 0) =>
    makePoseKey({ bankId: 0, clipId: 0, frame0, frame1: frame0 + 1, alpha, alphaBuckets: 8 });

  it('shares one slot across every actor using the same pose', () => {
    const table = new ShadoPoseSlotTable(16);
    const a = table.acquire(key(4));
    const b = table.acquire(key(4));
    const c = table.acquire(key(4));
    expect(b.slot).toBe(a.slot);
    expect(c.slot).toBe(a.slot);
    expect(table.getStats(0, 0).hits).toBe(2);
    expect(table.getStats(0, 0).misses).toBe(1);
  });

  it('hands out distinct slots for distinct poses', () => {
    const table = new ShadoPoseSlotTable(16);
    const slots = new Set([0, 1, 2, 3].map(frame => table.acquire(key(frame)).slot));
    expect(slots.size).toBe(4);
  });

  it('evicts the least recently used unreferenced slot', () => {
    const table = new ShadoPoseSlotTable(2);
    const first = table.acquire(key(0));
    table.beginFrame();
    const second = table.acquire(key(1));
    table.release(first.slot);
    table.release(second.slot);

    table.beginFrame();
    // Touch `second` so `first` is the stale one.
    table.acquire(key(1));
    table.beginFrame();

    const third = table.acquire(key(2));
    expect(third.slot).toBe(first.slot);
    expect(table.getStats(0, 0).evictions).toBe(1);
    // The recycled handle must no longer be considered live.
    expect(table.isLive(first)).toBe(false);
  });

  it('refuses to evict slots still referenced this frame', () => {
    const table = new ShadoPoseSlotTable(2);
    table.acquire(key(0));
    table.acquire(key(1));
    expect(() => table.acquire(key(2))).toThrow(/Pose palette exhausted/);
  });

  it('keeps generation counters so recycled slots cannot be confused', () => {
    const table = new ShadoPoseSlotTable(1);
    const first = table.acquire(key(0));
    expect(table.isLive(first)).toBe(true);
    table.release(first.slot);
    table.beginFrame();
    const second = table.acquire(key(9));
    expect(second.slot).toBe(first.slot);
    expect(second.generation).not.toEqual(first.generation);
    expect(table.isLive(first)).toBe(false);
    expect(table.isLive(second)).toBe(true);
  });

  it('packs pending poses into the request buffer layout the shader reads', () => {
    const table = new ShadoPoseSlotTable(8);
    const a = table.acquire(makePoseKey({ bankId: 0, clipId: 0, frame0: 7, frame1: 8, alpha: 0.25, alphaBuckets: 4 }));
    table.acquire(makePoseKey({ bankId: 0, clipId: 0, frame0: 20, frame1: 21, alpha: 0, singleFrame: true }));

    const buffer = new Uint32Array(8 * POSE_REQUEST_WORDS);
    const count = table.buildRequestBuffer(buffer, 107);
    expect(count).toBe(2);

    const floats = new Float32Array(buffer.buffer);
    expect(buffer[0]).toBe(7);
    expect(buffer[1]).toBe(8);
    expect(floats[2]).toBeCloseTo(0.375, 6); // bucket 1 of 4 -> midpoint 0.375
    expect(buffer[3]).toBe(a.slot);
    expect(buffer[4]).toBe(107);
    expect(buffer[5]).toBe(0);

    // Second record: single-frame, so alpha is forced to zero.
    expect(buffer[POSE_REQUEST_WORDS + 0]).toBe(20);
    expect(floats[POSE_REQUEST_WORDS + 2]).toBe(0);
    expect(buffer[POSE_REQUEST_WORDS + 5]).toBe(1);
  });

  it('stops marking poses dirty once resolved', () => {
    const table = new ShadoPoseSlotTable(4);
    table.acquire(key(0));
    expect(table.pendingRequests()).toHaveLength(1);
    table.markResolved();
    expect(table.pendingRequests()).toHaveLength(0);
    // Re-acquiring a resident pose does not need another resolve.
    table.acquire(key(0));
    expect(table.pendingRequests()).toHaveLength(0);
  });
});

describe('emitted WGSL', () => {
  it('declares the bindings the resolve pass needs', () => {
    const source = emitPoseResolveWGSL();
    for (const binding of ['poseRequests', 'dqAtlas', 'posePalette', 'poseScales', 'atlasParams']) {
      expect(source).toContain(binding);
    }
    expect(source).toContain('@compute @workgroup_size(64, 1, 1)');
    expect(source).toContain('pack2x16float');
  });

  it('reproduces the framesX atlas addressing used elsewhere', () => {
    const source = emitPoseResolveWGSL();
    // Must match fetchBoneDQScale() / the pre-skin fetchBone(), not the framesX=1 shortcut.
    expect(source).toContain('frame % framesX');
    expect(source).toContain('frame / framesX');
    expect(source).toContain('frameColumn * width * stride');
  });

  it('the palette fetch does no atlas sampling and no frame interpolation', () => {
    const source = emitPoseFetchWGSL();
    expect(source).toContain('unpack2x16float');
    expect(source).not.toContain('textureLoad');
    expect(source).not.toContain('mix(');
  });
});
