/**
 * WGSL emitters for the hybrid pre-skin compute.
 *
 * Split out of `ShadoHybridPreSkinCache` so the shader source can be generated
 * and asserted on without importing the Babylon runtime — the cache class pulls
 * in the whole engine, which makes the emitters awkward to unit-test.
 */

import type { ShadoVatQualityTier } from '../../materials/ShadoMaterial';

export const SOURCE_VEC4S_PER_VERTEX = 6;
export const OUTPUT_VEC4S_PER_VERTEX = 2;
export const WORKGROUP_SIZE = 128;


function emitAccumulation(dominantBone: boolean): string {
  if (dominantBone) {
    return `
  var dominantIndex = boneIndices0.x;
  var dominantWeight = weights0.x;
  for (var lane = 1u; lane < 4u; lane++) {
    if (weights0[lane] > dominantWeight) {
      dominantIndex = boneIndices0[lane];
      dominantWeight = weights0[lane];
    }
  }
  for (var lane = 0u; lane < 4u; lane++) {
    if (weights1[lane] > dominantWeight) {
      dominantIndex = boneIndices1[lane];
      dominantWeight = weights1[lane];
    }
  }
  dq0 = fetchBone(dominantIndex, frame0);
  dq1 = fetchBone(dominantIndex, frame1);`;
  }
  return `
  var weightSum = max(
    weights0.x + weights0.y + weights0.z + weights0.w +
    weights1.x + weights1.y + weights1.z + weights1.w,
    1e-8
  );
  weights0 = weights0 / weightSum;
  weights1 = weights1 / weightSum;
  for (var lane = 0u; lane < 4u; lane++) {
    if (weights0[lane] > 0.0) {
      dq0 = accumulate(dq0, fetchBone(boneIndices0[lane], frame0), weights0[lane]);
      dq1 = accumulate(dq1, fetchBone(boneIndices0[lane], frame1), weights0[lane]);
    }
    if (weights1[lane] > 0.0) {
      dq0 = accumulate(dq0, fetchBone(boneIndices1[lane], frame0), weights1[lane]);
      dq1 = accumulate(dq1, fetchBone(boneIndices1[lane], frame1), weights1[lane]);
    }
  }`;
}

/**
 * Accumulation for the pose-palette path: the DQ is already frame-resolved, so
 * there is only one to build instead of two, and no interpolation afterwards.
 */
function emitPaletteAccumulation(dominantBone: boolean): string {
  if (dominantBone) {
    return `
  var dominantIndex = boneIndices0.x;
  var dominantWeight = weights0.x;
  for (var lane = 1u; lane < 4u; lane++) {
    if (weights0[lane] > dominantWeight) {
      dominantIndex = boneIndices0[lane];
      dominantWeight = weights0[lane];
    }
  }
  for (var lane = 0u; lane < 4u; lane++) {
    if (weights1[lane] > dominantWeight) {
      dominantIndex = boneIndices1[lane];
      dominantWeight = weights1[lane];
    }
  }
  dq0 = fetchBoneFromPalette(poseSlot, boneStride, dominantIndex);`;
  }
  return `
  var weightSum = max(
    weights0.x + weights0.y + weights0.z + weights0.w +
    weights1.x + weights1.y + weights1.z + weights1.w,
    1e-8
  );
  weights0 = weights0 / weightSum;
  weights1 = weights1 / weightSum;
  for (var lane = 0u; lane < 4u; lane++) {
    if (weights0[lane] > 0.0) {
      dq0 = accumulate(dq0, fetchBoneFromPalette(poseSlot, boneStride, boneIndices0[lane]), weights0[lane]);
    }
    if (weights1[lane] > 0.0) {
      dq0 = accumulate(dq0, fetchBoneFromPalette(poseSlot, boneStride, boneIndices1[lane]), weights1[lane]);
    }
  }`;
}

export type ShadoPreSkinComputeOptions = {
  /**
   * Read bone transforms from an already-resolved pose palette instead of
   * sampling the DQ atlas twice per influence. Requires a
   * `ShadoVatPosePalette` dispatch earlier in the frame.
   */
  posePalette?: boolean;
};

/** Emits the compute deformation used by the synchronized hybrid cohort. */
export function emitShadoPreSkinComputeWGSL(
  quality: ShadoVatQualityTier,
  options: ShadoPreSkinComputeOptions = {},
): string {
  const singleFrame = quality === 'medium' || quality === 'low';
  if (options.posePalette) return emitPalettePreSkinWGSL(quality);
  return `
struct DQScale {
  real: vec4f,
  dual: vec4f,
  scale: f32,
}

@group(0) @binding(0) var<storage, read> sourceVertices: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outputVertices: array<vec4f>;
@group(0) @binding(2) var<storage, read> params: array<u32>;
@group(0) @binding(3) var dqAtlas: texture_2d<f32>;

fn rotatePoint(q: vec4f, point: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, point);
  return point + q.w * t + cross(q.xyz, t);
}

fn fetchBone(boneIndex: i32, frame: i32) -> DQScale {
  let width = i32(params[3]);
  let tilesX = i32(params[4]);
  let framesX = i32(params[5]);
  let stride = i32(params[6]);
  let clampedIndex = clamp(boneIndex, 0, tilesX * width - 1);
  let x = clampedIndex % width;
  let tile = clampedIndex / width;
  let frameColumn = frame % framesX;
  let frameGridRow = frame / framesX;
  let y = frameGridRow * tilesX + tile;
  let baseX = frameColumn * width * stride + x * stride;
  let real = textureLoad(dqAtlas, vec2i(baseX, y), 0);
  let dual = textureLoad(dqAtlas, vec2i(baseX + 1, y), 0);
  var scale = 1.0;
  if (params[7] != 0u && stride >= 3) {
    scale = textureLoad(dqAtlas, vec2i(baseX + 2, y), 0).x;
  }
  return DQScale(real, dual, scale);
}

fn accumulate(sum: DQScale, value: DQScale, weight: f32) -> DQScale {
  var real = value.real;
  var dual = value.dual;
  if (any(sum.real != vec4f(0.0)) && dot(real, sum.real) < 0.0) {
    real = -real;
    dual = -dual;
  }
  return DQScale(
    sum.real + real * weight,
    sum.dual + dual * weight,
    sum.scale + value.scale * weight
  );
}

fn normalizeDQ(value: DQScale) -> DQScale {
  let inverseLength = inverseSqrt(max(dot(value.real, value.real), 1e-20));
  let real = value.real * inverseLength;
  var dual = value.dual * inverseLength;
  dual = dual - real * dot(real, dual);
  return DQScale(real, dual, value.scale);
}

fn transformPoint(real: vec4f, dual: vec4f, point: vec3f) -> vec3f {
  let translation = 2.0 * (
    dual.xyz * real.w - real.xyz * dual.w + cross(real.xyz, dual.xyz)
  );
  return rotatePoint(real, point) + translation;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let vertex = id.x;
  let vertexCount = arrayLength(&sourceVertices) / ${SOURCE_VEC4S_PER_VERTEX}u;
  if (vertex >= vertexCount) { return; }
  let source = vertex * ${SOURCE_VEC4S_PER_VERTEX}u;
  let output = vertex * ${OUTPUT_VEC4S_PER_VERTEX}u;
  let position = sourceVertices[source].xyz;
  let normal = sourceVertices[source + 1u].xyz;
  let maxBone = i32(params[3] * params[4]) - 1;
  let boneIndices0 = clamp(vec4i(floor(sourceVertices[source + 2u] + vec4f(0.5))), vec4i(0), vec4i(maxBone));
  var weights0 = sourceVertices[source + 3u];
  let boneIndices1 = clamp(vec4i(floor(sourceVertices[source + 4u] + vec4f(0.5))), vec4i(0), vec4i(maxBone));
  var weights1 = sourceVertices[source + 5u];
  let frame0 = i32(params[0]);
  let frame1 = i32(params[1]);
  var dq0 = DQScale(vec4f(0.0), vec4f(0.0), 0.0);
  var dq1 = DQScale(vec4f(0.0), vec4f(0.0), 0.0);
${emitAccumulation(quality === 'low')}
  dq0 = normalizeDQ(dq0);
  dq1 = normalizeDQ(dq1);
  if (dot(dq1.real, dq0.real) < 0.0) {
    dq1 = DQScale(-dq1.real, -dq1.dual, dq1.scale);
  }
  let frameLerp = ${singleFrame ? '0.0' : 'bitcast<f32>(params[2])'};
  var blended = DQScale(
    mix(dq0.real, dq1.real, frameLerp),
    mix(dq0.dual, dq1.dual, frameLerp),
    mix(dq0.scale, dq1.scale, frameLerp)
  );
  blended = normalizeDQ(blended);
  let scale = select(1.0, blended.scale, params[7] != 0u);
  outputVertices[output] = vec4f(transformPoint(blended.real, blended.dual, position * scale), 1.0);
  outputVertices[output + 1u] = vec4f(rotatePoint(blended.real, normal), 0.0);
}
`;
}

/**
 * Pose-palette variant of the pre-skin compute.
 *
 * Identical deformation maths, but each influence reads one already-resolved DQ
 * from the palette instead of two atlas frames. On the NM_M supermesh that is
 * 4 palette reads per vertex instead of 16 atlas texture loads, and the
 * per-vertex frame lerp, hemisphere align and second normalisation disappear —
 * they happened once per bone in the resolve pass instead.
 */
function emitPalettePreSkinWGSL(quality: ShadoVatQualityTier): string {
  return `
struct DQScale {
  real: vec4f,
  dual: vec4f,
  scale: f32,
}

@group(0) @binding(0) var<storage, read> sourceVertices: array<vec4f>;
@group(0) @binding(1) var<storage, read_write> outputVertices: array<vec4f>;
@group(0) @binding(2) var<storage, read> params: array<u32>;
@group(0) @binding(3) var<storage, read> posePalette: array<vec4u>;
@group(0) @binding(4) var<storage, read> poseScales: array<f32>;

fn rotatePoint(q: vec4f, point: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, point);
  return point + q.w * t + cross(q.xyz, t);
}

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

fn accumulate(sum: DQScale, value: DQScale, weight: f32) -> DQScale {
  var real = value.real;
  var dual = value.dual;
  if (any(sum.real != vec4f(0.0)) && dot(real, sum.real) < 0.0) {
    real = -real;
    dual = -dual;
  }
  return DQScale(
    sum.real + real * weight,
    sum.dual + dual * weight,
    sum.scale + value.scale * weight
  );
}

fn normalizeDQ(value: DQScale) -> DQScale {
  let inverseLength = inverseSqrt(max(dot(value.real, value.real), 1e-20));
  let real = value.real * inverseLength;
  var dual = value.dual * inverseLength;
  dual = dual - real * dot(real, dual);
  return DQScale(real, dual, value.scale);
}

fn transformPoint(real: vec4f, dual: vec4f, point: vec3f) -> vec3f {
  let translation = 2.0 * (
    dual.xyz * real.w - real.xyz * dual.w + cross(real.xyz, dual.xyz)
  );
  return rotatePoint(real, point) + translation;
}

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3u) {
  let vertex = id.x;
  let vertexCount = arrayLength(&sourceVertices) / ${SOURCE_VEC4S_PER_VERTEX}u;
  if (vertex >= vertexCount) { return; }
  let source = vertex * ${SOURCE_VEC4S_PER_VERTEX}u;
  let output = vertex * ${OUTPUT_VEC4S_PER_VERTEX}u;
  let position = sourceVertices[source].xyz;
  let normal = sourceVertices[source + 1u].xyz;
  let boneStride = params[3] * params[4];
  let maxBone = i32(boneStride) - 1;
  let poseSlot = params[8];
  let boneIndices0 = clamp(vec4i(floor(sourceVertices[source + 2u] + vec4f(0.5))), vec4i(0), vec4i(maxBone));
  var weights0 = sourceVertices[source + 3u];
  let boneIndices1 = clamp(vec4i(floor(sourceVertices[source + 4u] + vec4f(0.5))), vec4i(0), vec4i(maxBone));
  var weights1 = sourceVertices[source + 5u];
  var dq0 = DQScale(vec4f(0.0), vec4f(0.0), 0.0);
${emitPaletteAccumulation(quality === 'low')}
  let blended = normalizeDQ(dq0);
  let scale = select(1.0, blended.scale, params[7] != 0u);
  outputVertices[output] = vec4f(transformPoint(blended.real, blended.dual, position * scale), 1.0);
  outputVertices[output + 1u] = vec4f(rotatePoint(blended.real, normal), 0.0);
}
`;
}
