
// GLSL
const VS_GL = `
precision highp float;

attribute vec3 position;
attribute vec2 uv;
attribute vec4 matricesIndices;
attribute vec4 matricesWeights;
#if NUM_BONE_INFLUENCERS > 4
attribute vec4 matricesIndicesExtra;
attribute vec4 matricesWeightsExtra;
#endif

uniform mat4 worldViewProjection;

varying vec2 vUV;
varying vec4 vColor;

#include<ActorInstance>
#include<ActorInstanceOffsets>
#include<InstancePoolStorage>
#include<bakedVertexAnimationDeclaration>

void main() {
  vUV = uv;
  int drawIdx = gl_InstanceID;

  int packedBase = uInstancePool_instancesBase + drawIdx * uInstancePool_instancesStride;
  uint bits = floatBitsToUint(InstancePool_fetch(packedBase + ActorInstance_visibleIndex_OFF));
  int  srcIdx = int(bits);

  if (srcIdx < 0) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vColor = vec4(0.0);
    return;
  }

  int base = uInstancePool_instancesBase + srcIdx * uInstancePool_instancesStride;

  vec4 translation = InstancePool_fetch4(base + ActorInstance_translation_OFF);
  vec4 col4        = InstancePool_fetch4(base + ActorInstance_color_OFF);
  vec4 anim        = InstancePool_fetch4(base + ActorInstance_animationBuffer_OFF);

  float startF = anim.x;
  float endF   = max(anim.y, startF);
  float total  = (endF - startF) + 1.0;

  float tSec   = bakedVertexAnimationTime + anim.z;
  float tFrames = tSec * anim.w;
  float fNorm  = mod(tFrames, total);
  float fAbs   = startF + fNorm;
  float f0     = floor(fAbs);
  float f1     = min(f0 + 1.0, endF);
  float lerpT  = fract(fAbs);

  // --- accumulate bone matrices, all as floats ---
  mat4 M0 = mat4(0.0);
  mat4 M1 = mat4(0.0);

  // 0..3
  if (matricesWeights.x > 0.0) {
    mat4 a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.x, f0);
    mat4 b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.x, f1);
    M0 += a * matricesWeights.x;
    M1 += b * matricesWeights.x;
  }
  if (matricesWeights.y > 0.0) {
    mat4 a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.y, f0);
    mat4 b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.y, f1);
    M0 += a * matricesWeights.y;
    M1 += b * matricesWeights.y;
  }
  if (matricesWeights.z > 0.0) {
    mat4 a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.z, f0);
    mat4 b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.z, f1);
    M0 += a * matricesWeights.z;
    M1 += b * matricesWeights.z;
  }
  if (matricesWeights.w > 0.0) {
    mat4 a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.w, f0);
    mat4 b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices.w, f1);
    M0 += a * matricesWeights.w;
    M1 += b * matricesWeights.w;
  }

  mat4 M = M0 * (1.0 - lerpT) + M1 * lerpT;

  vec3 skinnedPos = (M * vec4(position, 1.0)).xyz;
  vec3 p = skinnedPos * translation.w + translation.xyz;

  gl_Position = worldViewProjection * vec4(p, 1.0);
  vColor = col4;
}
`;


const FS_GL = `
precision highp float;

varying vec2 vUV;
varying vec4 vColor;
void main() {
  gl_FragColor = vec4(vColor.rgb * vColor.a, 1.0);
}
`;
 
BABYLON.Effect.ShadersStore["actorPoolSchemaVertexShader"] = VS_GL;
BABYLON.Effect.ShadersStore["actorPoolSchemaFragmentShader"] = FS_GL;


const MSDF_VS = `
// MSDF vertex
precision highp float;
attribute vec2 corner;

uniform mat4 worldViewProjection;
uniform mat4 view;
uniform float uThickness;

#include<ActorInstance>
#include<ActorInstanceOffsets>
#include<InstancePoolStorage>      // instances (owners)
#include<NameplateDataStorage>   // accessors for glyphUv4/Plane4/Advance + glyph streams

varying vec2 vUV;
varying float vThickness;
varying vec4 vNameColor;

vec3 camRight() { return vec3(view[0][0], view[1][0], view[2][0]); }
vec3 camUp()    { return vec3(view[0][1], view[1][1], view[2][1]); }

void main() {
  int j = gl_InstanceID;

  // per-glyph stream now from NameplateData
  int   gid   = int(NameplateData_glyphGid_get(j));
  vec2  ofsEM = NameplateData_glyphOfs2_get(j);
  int   owner = int(NameplateData_glyphOwner_get(j));

  // per-owner (child) from InstancePool
  int obase = uInstancePool_instancesBase + owner * uInstancePool_instancesStride;
int ownerVisible = floatBitsToInt(InstancePool_fetch(obase + ActorInstance_visibleFlag_OFF));
  if (ownerVisible == 0) {
    // punt off-screen (or you can set zero alpha—your call)
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    vNameColor  = vec4(0.0);
    vUV         = vec2(0.0);
    vThickness  = 0.0;
    return;
  }
  vec4 tr   = InstancePool_fetch4(obase + ActorInstance_translation_OFF);
  float worldPerEM    = InstancePool_fetch(obase + ActorInstance_nameWorldPerEM_OFF);
  float nameLiftWorld = InstancePool_fetch(obase + ActorInstance_nameLiftWorld_OFF);
  vec4 nameCol = InstancePool_fetch4(obase + ActorInstance_nameplateColor_OFF);
  vNameColor = nameCol;
  // LUTs from NameplateData
  vec4 planeEM = NameplateData_glyphPlane4_get(gid);
  vec4 uv      = NameplateData_glyphUv4_get(gid);

  float ws = worldPerEM * tr.w;
  vec2  p2 = mix(planeEM.xy, planeEM.zw, corner) * ws;

  float liftWorld = tr.w + nameLiftWorld * tr.w;

  vec3 basePos = tr.xyz;
  vec3 worldPos = basePos
                + camRight() * (ofsEM.x * ws + p2.x)
                + camUp()    * (liftWorld + p2.y + ofsEM.y * ws);

  vUV = vec2(uv.x + corner.x * uv.z,
             uv.y + (1.0 - corner.y) * uv.w);
  vThickness = uThickness;
  gl_Position = worldViewProjection * vec4(worldPos, 1.0);
}


`;

const MSDF_FS = `
precision highp float;
uniform sampler2D uFontAtlas;
varying vec2 vUV;
varying float vThickness;
varying vec4 vNameColor;

float median(float r, float g, float b) {
  return max(min(r,g), min(max(r,g), b));
}

void main() {
  vec3 msdf = texture2D(uFontAtlas, vUV).rgb;
  float sd  = median(msdf.r, msdf.g, msdf.b) - 0.5;
  float w   = fwidth(sd);
  float alpha = smoothstep(-w - vThickness, w - vThickness, sd);
  if (alpha <= 0.001) discard;
  gl_FragColor = vec4(vNameColor.rgb, alpha * vNameColor.a);
}
`;

BABYLON.Effect.ShadersStore["msdfTextVertexShader"] = MSDF_VS;
BABYLON.Effect.ShadersStore["msdfTextFragmentShader"] = MSDF_FS;

export {};
