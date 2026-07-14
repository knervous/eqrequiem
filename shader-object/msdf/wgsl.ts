
const VS_WGSL = /* wgsl */`

attribute position : vec3f;
attribute uv       : vec2f;
attribute matricesIndices : vec4<f32>;
attribute matricesWeights : vec4<f32>;

uniform worldViewProjection: mat4x4f;
varying vUV    : vec2f;
varying vColor : vec4f;

#include<sceneUboDeclaration>
#include<ActorInstance>
#include<ActorInstanceOffsets>
#include<InstancePoolStorage>
#include<bakedVertexAnimationDeclaration>

@vertex
fn main(input: VertexInputs) -> FragmentInputs {

  vertexOutputs.vUV = vertexInputs.uv;
  let drawIdx   : i32 = i32(vertexInputs.instanceIndex);
  let packedBase: i32 = uInstancePool_instancesBase() + drawIdx * uInstancePool_instancesStride();

  // fetch float, bitcast to u32/i32
  let bits  : u32 = bitcast<u32>(InstancePool_fetch(packedBase + ActorInstance_visibleIndex_OFF));
  var srcIdx: i32 = bitcast<i32>(bits);
  if (bits == 0xFFFFFFFFu || srcIdx < 0 || srcIdx >= uInstancePool_instancesCount()) {
    vertexOutputs.position = vec4f(2.0, 2.0, 0.0, 1.0);
    vertexOutputs.vColor   = vec4f(0.0);
    return vertexOutputs;
  } 

  let base : i32 = uInstancePool_instancesBase() + srcIdx * uInstancePool_instancesStride();

  let translation : vec4f = InstancePool_fetch4(base + ActorInstance_translation_OFF);
  let col4        : vec4f = InstancePool_fetch4(base + ActorInstance_color_OFF);
  let anim        : vec4f = InstancePool_fetch4(base + ActorInstance_animationBuffer_OFF);

  let startF = anim.x; 
  let endF   = max(anim.y, startF);
  let total  = (endF - startF) + 1.0;

  let tSec    = uniforms.bakedVertexAnimationTime + anim.z;
  let tFrames = tSec * anim.w;
  // mod(tFrames, total) that is numerically stable for large t
  let fAbs  = startF + (tFrames - total * floor(tFrames / total));
  let f0    = floor(fAbs);
  let f1    = min(f0 + 1.0, endF);
  let lerpT = fract(fAbs);

  var M0 : mat4x4f = mat4x4f();
  var M1 : mat4x4f = mat4x4f();

  if (vertexInputs.matricesWeights.x > 0.0) {
    let a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.x, f0);
    let b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.x, f1);
    M0 += a * vertexInputs.matricesWeights.x;
    M1 += b * vertexInputs.matricesWeights.x;
  }
  if (vertexInputs.matricesWeights.y > 0.0) {
    let a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.y, f0);
    let b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.y, f1);
    M0 += a * vertexInputs.matricesWeights.y;
    M1 += b * vertexInputs.matricesWeights.y;
  }
  if (vertexInputs.matricesWeights.z > 0.0) {
    let a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.z, f0);
    let b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.z, f1);
    M0 += a * vertexInputs.matricesWeights.z;
    M1 += b * vertexInputs.matricesWeights.z;
  }
  if (vertexInputs.matricesWeights.w > 0.0) {
    let a = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.w, f0);
    let b = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, vertexInputs.matricesIndices.w, f1);
    M0 += a * vertexInputs.matricesWeights.w;
    M1 += b * vertexInputs.matricesWeights.w;
  }

  let M = M0 * (1.0 - lerpT) + M1 * lerpT;

  let skinnedPos = (M * vec4f(vertexInputs.position, 1.0)).xyz;
  let p = skinnedPos * translation.w + translation.xyz;

  vertexOutputs.position = uniforms.worldViewProjection * vec4f(p, 1.0);
  vertexOutputs.vColor = col4;
  vertexOutputs.vUV = vertexInputs.uv;
}
`;

const FS_WGSL = /* wgsl */`
varying vColor: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  fragmentOutputs.color = vec4f(fragmentInputs.vColor.rgb * fragmentInputs.vColor.a, 1.0);
}
`;

// Register:
BABYLON.ShaderStore.ShadersStoreWGSL["actorPoolSchemaVertexShader"] = VS_WGSL;
BABYLON.ShaderStore.ShadersStoreWGSL["actorPoolSchemaFragmentShader"] = FS_WGSL;

const MSDF_VS_WGSL = /* wgsl */`

attribute position : vec3f;
attribute corner : vec2f;
varying vUV         : vec2f;
varying vThickness  : f32;
varying vNameColor  : vec4f;
uniform view: mat4x4f;
uniform worldViewProjection: mat4x4f;

#include<sceneUboDeclaration>
#include<ActorInstance>
#include<NameplateDataStorage>
#include<ActorInstanceOffsets>
#include<InstancePoolStorage>

fn camRight(view: mat4x4f) -> vec3f { return vec3f(view[0].x, view[1].x, view[2].x); }
fn camUp(view: mat4x4f)    -> vec3f { return vec3f(view[0].y, view[1].y, view[2].y); }

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let j: i32 = i32(vertexInputs.instanceIndex);

  let gid   : i32 = i32(NameplateData_glyphGid_get(j));
  let ofsEM : vec2f = NameplateData_glyphOfs2_get(j);
  let owner : i32 = i32(NameplateData_glyphOwner_get(j));

  let obase = uInstancePool_instancesBase() + owner * uInstancePool_instancesStride();
  let flagBits : u32 = bitcast<u32>(InstancePool_fetch(obase + ActorInstance_visibleFlag_OFF));
  if (flagBits == 0u) {
    vertexOutputs.position    = vec4f(2.0, 2.0, 0.0, 1.0);
    return vertexOutputs;
  }
  let tr    = InstancePool_fetch4(obase + ActorInstance_translation_OFF);
  let worldPerEM    = InstancePool_fetch(obase + ActorInstance_nameWorldPerEM_OFF);
  let nameLiftWorld = InstancePool_fetch(obase + ActorInstance_nameLiftWorld_OFF);
  let nameCol       = InstancePool_fetch4(obase + ActorInstance_nameplateColor_OFF);
  vertexOutputs.vNameColor = nameCol;

  let planeEM = NameplateData_glyphPlane4_get(gid);
  let uv      = NameplateData_glyphUv4_get(gid);

  let ws = worldPerEM * tr.w;
  let p2 = mix(planeEM.xy, planeEM.zw, vertexInputs.corner) * ws;

  let liftWorld = tr.w + nameLiftWorld * tr.w;

  let basePos  = tr.xyz;
  let worldPos = basePos
               + camRight(uniforms.view) * (ofsEM.x * ws + p2.x)
               + camUp(uniforms.view)    * (liftWorld + p2.y + ofsEM.y * ws);

  vertexOutputs.vUV = vec2f(uv.x + vertexInputs.corner.x * uv.z,
                uv.y + (1.0 - vertexInputs.corner.y) * uv.w);
  vertexOutputs.vThickness = 0.0;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(worldPos, 1.0);
}
`;

const MSDF_FS_WGSL = /* wgsl */`
var uFontAtlasSampler : sampler;
var uFontAtlas        : texture_2d<f32>;

fn median(a: f32, b: f32, c: f32) -> f32 {
  return max(min(a,b), min(max(a,b), c));
}

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let msdf = textureSample(uFontAtlas, uFontAtlasSampler, fragmentInputs.vUV).rgb;
  let sd   = median(msdf.r, msdf.g, msdf.b) - 0.5;
  // Simple width; if you have Babylon's derivative include, use that instead
  let w    = abs(dpdx(sd)) + abs(dpdy(sd));
  let alpha = smoothstep(-w - fragmentInputs.vThickness, w - fragmentInputs.vThickness, sd);
  if (alpha <= 0.001) { discard; }
  fragmentOutputs.color = vec4f(fragmentInputs.vNameColor.rgb, alpha * fragmentInputs.vNameColor.a);
}

`;

// Register:
BABYLON.ShaderStore.ShadersStoreWGSL["msdfTextVertexShader"] = MSDF_VS_WGSL;
BABYLON.ShaderStore.ShadersStoreWGSL["msdfTextFragmentShader"] = MSDF_FS_WGSL;

export {};
