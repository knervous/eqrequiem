import { describe, expect, it } from '@jest/globals';
import { emitShadoPreSkinComputeWGSL } from '../src/extensions/ShadoInstanceContainer/preskin-wgsl';

const atlas = (quality: 'full' | 'medium' | 'low' = 'full') =>
  emitShadoPreSkinComputeWGSL(quality);
const palette = (quality: 'full' | 'medium' | 'low' = 'full') =>
  emitShadoPreSkinComputeWGSL(quality, { posePalette: true });

describe('pre-skin compute: atlas path is unchanged', () => {
  it('still samples the DQ atlas directly by default', () => {
    const source = atlas();
    expect(source).toContain('var dqAtlas: texture_2d<f32>');
    expect(source).toContain('textureLoad');
    // Two frames fetched per influence, then interpolated.
    expect(source).toContain('fetchBone(boneIndices0[lane], frame0)');
    expect(source).toContain('fetchBone(boneIndices0[lane], frame1)');
    expect(source).toContain('bitcast<f32>(params[2])');
  });

  it('keeps single-frame behaviour for reduced tiers', () => {
    expect(atlas('medium')).toContain('let frameLerp = 0.0;');
    expect(atlas('low')).toContain('dominantIndex');
  });
});

describe('pre-skin compute: pose-palette path', () => {
  it('reads the resolved palette and never touches the atlas', () => {
    const source = palette();
    expect(source).toContain('var<storage, read> posePalette: array<vec4u>');
    expect(source).toContain('var<storage, read> poseScales: array<f32>');
    expect(source).toContain('unpack2x16float');
    // The whole point: no texture sampling, no atlas binding.
    expect(source).not.toContain('textureLoad');
    expect(source).not.toContain('dqAtlas');
  });

  it('does no per-vertex frame interpolation', () => {
    const source = palette();
    // The palette is already frame-resolved, so there is no second frame,
    // no lerp factor and no cross-frame hemisphere align in the vertex pass.
    expect(source).not.toContain('frame1');
    expect(source).not.toContain('frameLerp');
    expect(source).not.toContain('bitcast<f32>(params[2])');
    expect(source).not.toContain('dq1');
  });

  it('fetches exactly one DQ per influence lane', () => {
    const source = palette();
    const fetches = source.match(/fetchBoneFromPalette\(/g) ?? [];
    // One per weight set in the declaration plus the two accumulate lanes.
    expect(fetches.length).toBeGreaterThan(0);
    expect(source).toContain('fetchBoneFromPalette(poseSlot, boneStride, boneIndices0[lane])');
    expect(source).toContain('fetchBoneFromPalette(poseSlot, boneStride, boneIndices1[lane])');
  });

  it('addresses the palette with the same bone stride the palette allocates', () => {
    const source = palette();
    // ShadoVatPosePalette sizes each slot as tilesX * widthBones, which is
    // params[4] * params[3] here. A mismatch would read a neighbouring pose.
    expect(source).toContain('let boneStride = params[3] * params[4];');
    expect(source).toContain('let index = poseSlot * boneCount + bone;');
    expect(source).toContain('let poseSlot = params[8];');
  });

  it('clamps the bone index so a bad influence cannot read another slot', () => {
    expect(palette()).toContain('clamp(boneIndex, 0, i32(boneCount) - 1)');
  });

  it('preserves the deformation maths of the atlas path', () => {
    const source = palette();
    for (const fn of ['fn rotatePoint', 'fn accumulate', 'fn normalizeDQ', 'fn transformPoint']) {
      expect(source).toContain(fn);
    }
    // Same DQ transform, same normalisation, same orthogonality restoration.
    expect(source).toContain('dual = dual - real * dot(real, dual);');
    expect(source).toContain('outputVertices[output + 1u] = vec4f(rotatePoint(blended.real, normal), 0.0);');
  });

  it('collapses to the dominant bone on the low tier', () => {
    const source = palette('low');
    expect(source).toContain('dominantIndex');
    expect(source).toContain('fetchBoneFromPalette(poseSlot, boneStride, dominantIndex)');
    expect(source).not.toContain('boneIndices0[lane])');
  });
});
