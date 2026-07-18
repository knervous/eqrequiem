import { describe, it, expect, beforeAll } from '@jest/globals';
import { NullEngine } from '@babylonjs/core';

import { DirtyPageTracker } from '../src/arena/DirtyPageTracker';
import { FloatArena } from '../src/arena/FloatArena';
import { StorageBacking } from '../src/backings/StorageBacking';
import { ShadoDynamicEntityContainer } from '../src/render/ShadoDynamicEntityContainer';

const PAGE = DirtyPageTracker.PAGE_BYTES;

describe('DirtyPageTracker', () => {
  it('starts fully dirty and resets after consume', () => {
    const tracker = new DirtyPageTracker();
    expect(tracker.isDirty()).toBe(true);
    expect(tracker.consumeRanges(PAGE * 8)).toEqual([{ start: 0, end: PAGE * 8 }]);
    expect(tracker.isDirty()).toBe(false);
    expect(tracker.consumeRanges(PAGE * 8)).toEqual([]);
  });

  it('coalesces adjacent pages and separates sparse pages', () => {
    const tracker = new DirtyPageTracker();
    tracker.consumeRanges(PAGE * 64);
    tracker.markBytes(0, 8); // page 0
    tracker.markBytes(PAGE + 4, 4); // page 1 (adjacent)
    tracker.markBytes(PAGE * 10, 16); // page 10 (separate)
    const ranges = tracker.consumeRanges(PAGE * 64);
    expect(ranges).toEqual([
      { start: 0, end: PAGE * 2 },
      { start: PAGE * 10, end: PAGE * 11 },
    ]);
  });

  it('falls back to one full range when dirty coverage is high', () => {
    const tracker = new DirtyPageTracker();
    tracker.consumeRanges(PAGE * 10);
    for (let page = 0; page < 8; page++) tracker.markBytes(page * PAGE, 4);
    expect(tracker.consumeRanges(PAGE * 10)).toEqual([{ start: 0, end: PAGE * 10 }]);
  });

  it('markAll produces one full range', () => {
    const tracker = new DirtyPageTracker();
    tracker.consumeRanges(PAGE * 4);
    tracker.markAll();
    expect(tracker.consumeRanges(PAGE * 4)).toEqual([{ start: 0, end: PAGE * 4 }]);
  });
});

describe('FloatArena dirty ranges', () => {
  it('marks the precise range for write() and clears on markClean', () => {
    const arena = new FloatArena(4096);
    arena.markClean();
    expect(arena.isDirty()).toBe(false);
    arena.write(2048, [1, 2, 3, 4]);
    expect(arena.isDirty()).toBe(true);
    const ranges = arena.consumeDirtyRanges();
    expect(ranges.length).toBe(1);
    expect(ranges[0].start).toBeLessThanOrEqual(2048 * 4);
    expect(ranges[0].end).toBeGreaterThanOrEqual(2048 * 4 + 16);
    expect(arena.isDirty()).toBe(false);
  });

  it('growth conservatively marks everything', () => {
    const arena = new FloatArena(64);
    arena.markClean();
    arena.write(4096, [1]); // forces growth
    const ranges = arena.consumeDirtyRanges();
    expect(ranges).toEqual([{ start: 0, end: arena.take().byteLength }]);
  });
});

type UpdateCall = { bytes: number; offset: number };

class RecordingBacking extends StorageBacking {
  public updates: UpdateCall[] = [];
  protected override makeBuffer(_byteLength: number): any {
    const self = this;
    return {
      update(view: Float32Array | Int32Array, offset = 0) {
        self.updates.push({ bytes: view.byteLength, offset });
      },
      dispose() {},
    };
  }
}

function makeOwner(floats: number) {
  const arena = new FloatArena(floats);
  const owner: any = {
    arena,
    _arena: arena,
    _headerSeg: { offF: 0, lenF: 4, capF: 4 },
    _varSeg: {},
    _structSeg: { entities: { offF: 4, lenF: floats - 4, capF: floats - 4 } },
    _structArrayCount: { entities: Math.floor((floats - 4) / 28) },
    prepareUnifiedForUpload: () => arena.take(),
  };
  const schema = {
    name: 'Bench',
    fields: [],
    headerFloatCount: 4,
    varArrays: {},
    structArrays: {
      entities: { schema: { fields: [], headerFloatCount: 28 } },
    },
  };
  return { owner, schema, arena };
}

describe('StorageBacking partial uploads', () => {
  it('uploads nothing on a clean frame and a small range for one change', () => {
    const { owner, schema, arena } = makeOwner(64 * 1024);
    const backing = new RecordingBacking(new NullEngine(), schema, owner);

    // First commit: structural, full upload expected.
    const first = backing.commit();
    expect(first.uploadCalls).toBe(1);
    expect(first.uploadedBytes).toBe(arena.take().byteLength);

    // No mutations: zero uploads.
    const idle = backing.commit();
    expect(idle.uploadCalls).toBe(0);
    expect(idle.uploadedBytes).toBe(0);

    // One entity record changes: upload stays within a couple of pages.
    arena.write(4 + 100 * 28, [1, 2, 3, 4]);
    const sparse = backing.commit();
    expect(sparse.uploadCalls).toBe(1);
    expect(sparse.uploadedBytes).toBeLessThanOrEqual(2 * PAGE);
    expect(sparse.uploadedBytes).toBeGreaterThan(0);
  });

  it('keeps the full-upload fallback for dense changes', () => {
    const { owner, schema, arena } = makeOwner(16 * 1024);
    const backing = new RecordingBacking(new NullEngine(), schema, owner);
    backing.commit();
    arena.markDirty();
    const stats = backing.commit();
    expect(stats.uploadCalls).toBe(1);
    expect(stats.uploadedBytes).toBe(arena.take().byteLength);
  });
});

describe('ShadoDynamicEntityContainer draw partitioning', () => {
  let engine: NullEngine;

  beforeAll(async () => {
    engine = new NullEngine();
    const ok = await ShadoDynamicEntityContainer.initialize(engine, {});
    if (!ok) throw new Error('container initialize failed');
  }, 30000);

  function populate(container: ShadoDynamicEntityContainer) {
    const inputs = [];
    for (let i = 0; i < 30; i++) {
      inputs.push({
        id: `e${i}`,
        x: i,
        y: 0,
        width: 1,
        meshIndex: i % 3,
        visible: true,
      });
    }
    container.upsertMany(inputs as any);
  }

  it('partitions draw ids into contiguous per-mesh ranges covering all visible', () => {
    const container = new ShadoDynamicEntityContainer(engine);
    populate(container);

    const ranges = [0, 1, 2].map(mesh => container.getMeshDrawRange(mesh));
    const total = ranges.reduce((sum, range) => sum + range.count, 0);
    expect(total).toBe(30);
    expect(container.drawCount).toBe(30);
    // Ranges are contiguous and non-overlapping.
    expect(ranges[0].offset).toBe(0);
    expect(ranges[1].offset).toBe(ranges[0].count);
    expect(ranges[2].offset).toBe(ranges[0].count + ranges[1].count);
    // An empty variant produces no draw work.
    expect(container.getMeshDrawRange(7)).toEqual({ offset: 0, count: 0 });
  });

  it('moves entities between mesh buckets without a full rescan', () => {
    const container = new ShadoDynamicEntityContainer(engine);
    populate(container);
    const before0 = container.getMeshDrawRange(0).count;
    const before1 = container.getMeshDrawRange(1).count;

    expect(container.setEntityMeshIndex('e0', 1)).toBe(true);
    expect(container.getMeshDrawRange(0).count).toBe(before0 - 1);
    expect(container.getMeshDrawRange(1).count).toBe(before1 + 1);

    // Re-partitioned ranges still cover every visible entity exactly once.
    const total = [0, 1, 2]
      .map(mesh => container.getMeshDrawRange(mesh).count)
      .reduce((sum, count) => sum + count, 0);
    expect(total).toBe(30);
  });

  it('frame-owned sync commits at most once per frame', () => {
    const container = new ShadoDynamicEntityContainer(engine);
    populate(container);
    const backing = (container as any)._backing;
    let commits = 0;
    const original = backing.commit.bind(backing);
    backing.commit = () => {
      commits++;
      return original();
    };

    container.syncGpu(1);
    container.syncGpu(1);
    container.syncGpu(1);
    expect(commits).toBe(1);
    container.syncGpu(2);
    expect(commits).toBe(2);
  });
});
