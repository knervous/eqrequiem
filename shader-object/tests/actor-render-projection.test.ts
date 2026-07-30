import { describe, expect, it } from '@jest/globals';

import {
  ActorRenderProjection,
  type ActorProjectionActor,
} from '../src/render-data/ActorRenderProjection';
import {
  pack2x16Snorm,
  pack2x16Unorm,
  packRgba8Unorm,
  unpack2x16Snorm,
  unpack2x16Unorm,
  unpackRgba8Unorm,
} from '../src/render-data/PackedCodecs';
import { emitComputeScatterWGSL } from '../src/render-data/ComputeScatter';

function actor(
  translation = [12.25, -8.5, 31.75, 1.25],
  rotation = [0.182574, -0.365148, 0.547723, 0.730297],
  color = [0.2, 0.4, 0.6, 0.8]
): ActorProjectionActor {
  return {
    translation: new Float32Array(translation),
    rotation: new Float32Array(rotation),
    color: new Float32Array(color),
  };
}

const packedDomain = {
  origin: [-64, -64, -64] as const,
  extent: [128, 128, 128] as const,
  scaleRange: [0, 8] as const,
};

describe('packed actor codecs', () => {
  it('round-trips normalized values at their documented precision', () => {
    const unorm = unpack2x16Unorm(pack2x16Unorm(0.12345, 0.98765));
    expect(Math.abs(unorm[0] - 0.12345)).toBeLessThanOrEqual(0.5 / 0xffff);
    expect(Math.abs(unorm[1] - 0.98765)).toBeLessThanOrEqual(0.5 / 0xffff);

    const snorm = unpack2x16Snorm(pack2x16Snorm(-0.12345, 0.98765));
    expect(Math.abs(snorm[0] + 0.12345)).toBeLessThanOrEqual(0.5 / 0x7fff);
    expect(Math.abs(snorm[1] - 0.98765)).toBeLessThanOrEqual(0.5 / 0x7fff);

    const color = unpackRgba8Unorm(packRgba8Unorm(new Float32Array([0.2, 0.4, 0.6, 0.8])));
    expect(color).toEqual([0.2, 0.4, 0.6, 0.8]);
  });

  it('clamps values at the GPU codec boundaries', () => {
    expect(unpack2x16Unorm(pack2x16Unorm(-1, 2))).toEqual([0, 1]);
    expect(unpack2x16Snorm(pack2x16Snorm(-2, 2))).toEqual([-1, 1]);
    expect(unpackRgba8Unorm(packRgba8Unorm(new Float32Array([-1, 0.5, 2, 1])))).toEqual([
      0,
      128 / 255,
      1,
      1,
    ]);
  });
});

describe('compute scatter ABI', () => {
  it('emits a bounds-checked slot-indexed word kernel', () => {
    const source = emitComputeScatterWGSL(4);

    expect(source).toContain('SHADO_SCATTER_STRIDE_WORDS: u32 = 4u');
    expect(source).toContain('SHADO_SCATTER_RECORD_WORDS: u32 = 5u');
    expect(source).toContain('recordIndex >= shadoScatterParams[0]');
    expect(source).toContain('destinationRow * SHADO_SCATTER_STRIDE_WORDS');
    expect(source).not.toContain('for (var word');
    expect(source).toContain('@workgroup_size(64)');
  });

  it('specializes records and unrolled stores to a struct span', () => {
    const source = emitComputeScatterWGSL({
      destinationStrideWords: 8,
      destinationOffsetWords: 4,
      copyWords: 4,
    });

    expect(source).toContain('SHADO_SCATTER_STRIDE_WORDS: u32 = 8u');
    expect(source).toContain('SHADO_SCATTER_OFFSET_WORDS: u32 = 4u');
    expect(source).toContain('SHADO_SCATTER_COPY_WORDS: u32 = 4u');
    expect(source).toContain('SHADO_SCATTER_RECORD_WORDS: u32 = 5u');
    expect(source).toContain('destinationBase + 3u');
    expect(source).not.toContain('destinationBase + 4u');
  });

  it('rejects invalid physical layouts', () => {
    expect(() => emitComputeScatterWGSL(0)).toThrow('positive integer');
    expect(() => emitComputeScatterWGSL(4, 0)).toThrow('positive integer');
    expect(() =>
      emitComputeScatterWGSL({
        destinationStrideWords: 4,
        destinationOffsetWords: 3,
        copyWords: 2,
      })
    ).toThrow('fit inside');
  });
});

describe('ActorRenderProjection behavior', () => {
  it('preserves legacy transform and color values exactly in split-f32 mode', () => {
    const source = actor();
    const projection = new ActorRenderProjection({ encoding: 'split-f32' });
    const first = projection.sync([source]);
    const decoded = projection.decode(0);

    expect(decoded.translation).toEqual(Array.from(source.translation));
    expect(decoded.rotation).toEqual(Array.from(source.rotation));
    expect(decoded.color).toEqual(Array.from(source.color));
    expect(first.transform.uploadedBytes).toBe(32);
    expect(first.appearance.uploadedBytes).toBe(16);
    expect(first.uploadedBytes).toBe(48);
  });

  it('keeps packed error inside the quantization bounds', () => {
    const source = actor();
    const projection = new ActorRenderProjection({
      encoding: 'packed',
      domain: packedDomain,
    });
    projection.sync([source]);
    const decoded = projection.decode(0);

    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(decoded.translation[axis] - source.translation[axis])).toBeLessThanOrEqual(
        packedDomain.extent[axis] / (2 * 0xffff) + 1e-7
      );
    }
    expect(Math.abs(decoded.translation[3] - source.translation[3])).toBeLessThanOrEqual(
      (packedDomain.scaleRange[1] - packedDomain.scaleRange[0]) / (2 * 0xffff) + 1e-7
    );
    const rotationDot = Math.abs(
      decoded.rotation.reduce(
        (sum, component, index) => sum + component * source.rotation[index],
        0
      )
    );
    expect(rotationDot).toBeGreaterThan(0.99999);
    for (let channel = 0; channel < 4; channel++) {
      expect(Math.abs(decoded.color[channel] - source.color[channel])).toBeLessThanOrEqual(
        0.5 / 255 + 1e-7
      );
    }
  });

  it('publishes no bytes while idle and isolates color-only changes', () => {
    const source = actor();
    const projection = new ActorRenderProjection({
      encoding: 'packed',
      domain: packedDomain,
    });
    projection.sync([source]);
    expect(projection.sync([source]).uploadedBytes).toBe(0);

    source.color[1] = 0.75;
    const changed = projection.sync([source], { dirtyIndices: [0] });
    expect(changed.transform.mode).toBe('none');
    expect(changed.appearance.mode).toBe('full');
    expect(changed.appearance.uploadedBytes).toBe(4);
    expect(projection.decode(0).color[1]).toBeCloseTo(0.75, 2);
  });

  it('coalesces a contiguous transform edit into one exact range', () => {
    const unchanged = actor();
    const actors = Array.from({ length: 100 }, () => unchanged);
    const projection = new ActorRenderProjection({
      encoding: 'packed',
      domain: packedDomain,
    });
    projection.sync(actors);
    for (let index = 20; index < 30; index++) {
      actors[index] = actor([index, -8.5, 31.75, 1.25]);
    }

    const changed = projection.sync(actors, {
      dirtyIndices: Array.from({ length: 10 }, (_, index) => index + 20),
    });
    expect(changed.transform.mode).toBe('direct');
    expect(changed.transform.uploadCalls).toBe(1);
    expect(changed.transform.uploadedBytes).toBe(10 * 16);
    expect(changed.transform.ranges[0].byteOffset).toBe(20 * 16);
    expect(changed.appearance.mode).toBe('none');
  });

  it('tracks a swap-removed actor at its new source slot', () => {
    const actors = [actor([1, 2, 3, 1]), actor([4, 5, 6, 1]), actor([7, 8, 9, 1])];
    const projection = new ActorRenderProjection({ encoding: 'split-f32' });
    projection.sync(actors);

    actors[0] = actors[2];
    actors.pop();
    projection.sync(actors, { dirtyIndices: [0] });

    expect(projection.count).toBe(2);
    expect(projection.decode(0).translation).toEqual([7, 8, 9, 1]);
  });

  it('builds one shape-specialized scatter payload for random sparse edits at 100k', () => {
    const count = 100_000;
    const unchanged = actor();
    const actors = Array.from({ length: count }, () => unchanged);
    const projection = new ActorRenderProjection({
      encoding: 'packed',
      domain: packedDomain,
      uploadPolicy: { allowScatter: true, maxDirectRanges: 32 },
    });
    projection.sync(actors);

    const dirty = Array.from({ length: 1_000 }, (_, index) => index * 97);
    for (const index of dirty) {
      actors[index] = actor([13.25, -8.5, 31.75, 1.25]);
    }
    const changed = projection.sync(actors, { dirtyIndices: dirty });

    expect(changed.candidateRows).toBe(1_000);
    expect(changed.transform.mode).toBe('scatter');
    expect(changed.transform.uploadCalls).toBe(1);
    expect(changed.transform.encodedBytes).toBe(1_000 * 16);
    expect(changed.transform.uploadedBytes).toBe(1_000 * 12);
    expect(changed.transform.scatterBatches).toHaveLength(1);
    expect(changed.transform.scatterBatches?.[0]).toMatchObject({
      shapeName: 'positionScale',
      destinationStrideWords: 4,
      destinationOffsetWords: 0,
      copyWords: 2,
      changedRows: 1_000,
    });
    expect(changed.appearance.mode).toBe('none');
    expect(changed.transform.uploadedBytes).toBeLessThan(count * 112 * 0.002);
  });

  it('chooses shaped batches or a whole row from the actual changed struct fields', () => {
    const count = 10_000;
    const base = actor();
    const actors = Array.from({ length: count }, () => base);
    const projection = new ActorRenderProjection({
      encoding: 'packed',
      domain: packedDomain,
      uploadPolicy: { allowScatter: true, maxDirectRanges: 8 },
    });
    projection.sync(actors);

    const translationRows = Array.from({ length: 50 }, (_, index) => index * 101);
    const rotationRows = Array.from({ length: 50 }, (_, index) => index * 101 + 1);
    for (const index of translationRows) {
      actors[index] = actor([13.25, -8.5, 31.75, 1.25]);
    }
    for (const index of rotationRows) {
      actors[index] = actor(undefined, [0.282574, -0.365148, 0.547723, 0.730297]);
    }
    const disjoint = projection.sync(actors, {
      dirtyIndices: [...translationRows, ...rotationRows],
    });

    expect(disjoint.transform.mode).toBe('scatter');
    expect(disjoint.transform.uploadCalls).toBe(2);
    expect(disjoint.transform.uploadedBytes).toBe(100 * 12);
    expect(disjoint.transform.scatterBatches?.map(batch => batch.shapeName)).toEqual([
      'positionScale',
      'rotation',
    ]);

    const mixedRows = Array.from({ length: 100 }, (_, index) => index * 97);
    for (const index of mixedRows) {
      actors[index] = actor([14.25, -8.5, 31.75, 1.25], [0.382574, -0.365148, 0.547723, 0.730297]);
    }
    const mixed = projection.sync(actors, { dirtyIndices: mixedRows });

    expect(mixed.transform.mode).toBe('scatter');
    expect(mixed.transform.uploadCalls).toBe(1);
    expect(mixed.transform.uploadedBytes).toBe(100 * 20);
    expect(mixed.transform.scatterBatches?.[0]).toMatchObject({
      shapeName: 'row',
      destinationOffsetWords: 0,
      copyWords: 4,
      changedRows: 100,
    });
  });

  it('shape-scatters only the translation half of split-f32 transforms', () => {
    const count = 10_000;
    const base = actor();
    const actors = Array.from({ length: count }, () => base);
    const projection = new ActorRenderProjection({
      encoding: 'split-f32',
      uploadPolicy: { allowScatter: true, maxDirectRanges: 8 },
    });
    projection.sync(actors);
    const dirty = Array.from({ length: 100 }, (_, index) => index * 97);
    for (const index of dirty) {
      actors[index] = actor([13.25, -8.5, 31.75, 1.25]);
    }

    const changed = projection.sync(actors, { dirtyIndices: dirty });

    expect(changed.transform.uploadedBytes).toBe(100 * 20);
    expect(changed.transform.scatterBatches?.[0]).toMatchObject({
      shapeName: 'translation',
      destinationStrideWords: 8,
      destinationOffsetWords: 0,
      copyWords: 4,
    });
  });

  it('falls back to a compact transform stream without compute scatter', () => {
    const count = 100_000;
    const unchanged = actor();
    const actors = Array.from({ length: count }, () => unchanged);
    const projection = new ActorRenderProjection({
      encoding: 'packed',
      domain: packedDomain,
      uploadPolicy: { allowScatter: false, maxDirectRanges: 8 },
    });
    projection.sync(actors);

    const dirty = Array.from({ length: 1_000 }, (_, index) => index * 97);
    for (const index of dirty) {
      actors[index] = actor([13.25, -8.5, 31.75, 1.25]);
    }
    const changed = projection.sync(actors, { dirtyIndices: dirty });
    const legacyActorArenaBytes = count * 112;

    expect(changed.transform.mode).toBe('full');
    expect(changed.transform.uploadedBytes).toBe(count * 16);
    expect(changed.appearance.mode).toBe('none');
    expect(changed.uploadedBytes / legacyActorArenaBytes).toBeLessThan(0.15);

    const denseActor = actor([14.25, -8.5, 31.75, 1.25]);
    actors.fill(denseActor);
    const dense = projection.sync(actors, {
      dirtyIndices: actors.keys(),
    });
    expect(dense.transform.mode).toBe('full');
    expect(dense.transform.changedRows).toBe(count);
    expect(dense.transform.uploadedBytes).toBe(1_600_000);
    expect(dense.appearance.mode).toBe('none');
  });
});
