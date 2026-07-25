import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { RequiemEntityContainer } from "./shado-entity-pool";
import type { EntityMeshMetadata } from "./entity-types";
import type { ShadoEntityPool } from "./shado-entity-pool";

const VS_GL = `
    precision highp float;

    // Attributes
    attribute vec3 position;
    attribute vec2 uv;
    attribute vec2 submeshData;

    // Varyings → fragment
    flat varying int vSlice;
    flat varying int vAtlasIndex;
    varying vec2 vUV;
    varying vec3 vTint;

    // Uniforms
    uniform mat4 worldViewProjection;
    uniform int  uSubmeshCount;
    uniform int  uInstanceCount;
    uniform highp sampler2D uShadoVisibleIndices;
    uniform int uShadoVisibleIndexTexWidth;
    uniform int uShadoVisibleCount;

    // Babylon.js includes (will be transpiled under the hood)
    #define THIN_INSTANCES
    #define INSTANCES
    #define BAKED_VERTEX_ANIMATION_TEXTURE
    #include<bonesDeclaration>
    #undef INSTANCES
    #include<bakedVertexAnimationDeclaration>
    #define INSTANCES
    #include<RequiemEntityActor>
    #include<RequiemEntityActorOffsets>
    #include<RequiemEntityContainerStorage>

    int requiemVisibleActorIndex(int drawIndex) {
      int texelIndex = drawIndex / 4;
      vec4 packed = texelFetch(
        uShadoVisibleIndices,
        ivec2(texelIndex % uShadoVisibleIndexTexWidth, texelIndex / uShadoVisibleIndexTexWidth),
        0
      );
      int lane = drawIndex - texelIndex * 4;
      float value = lane == 0 ? packed.x : lane == 1 ? packed.y : lane == 2 ? packed.z : packed.w;
      return int(value + 0.5);
    }

    void main() {
        int drawIndex = gl_InstanceID;
        if (drawIndex >= uShadoVisibleCount) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        int sourceIndex = requiemVisibleActorIndex(drawIndex);
        RequiemEntityActorHeader actor = RequiemEntityContainer_instances_get(sourceIndex);
        // Shado is the authoritative instance transform. Babylon's thin
        // instance is retained only as the draw-count adapter.
        mat4 finalWorld = mat4(1.0);
        vec4 anim = actor.animationBuffer;
        float totalFrames = anim.y - anim.x + 1.0;
        float vatTime = bakedVertexAnimationTime * anim.w / totalFrames;
        float frameCorrection = vatTime < 1.0 ? 0.0 : 1.0;
        float frameCount = totalFrames - frameCorrection;
        float frame = floor(mod(fract(vatTime) * frameCount + anim.z, frameCount));
        frame += anim.x + frameCorrection;
        mat4 VATInfluence = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[0], frame) * matricesWeights[0];
        #if NUM_BONE_INFLUENCERS > 1
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[1], frame) * matricesWeights[1];
        #endif
        #if NUM_BONE_INFLUENCERS > 2
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[2], frame) * matricesWeights[2];
        #endif
        #if NUM_BONE_INFLUENCERS > 3
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[3], frame) * matricesWeights[3];
        #endif
        #if NUM_BONE_INFLUENCERS > 4
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[0], frame) * matricesWeightsExtra[0];
        #endif
        #if NUM_BONE_INFLUENCERS > 5
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[1], frame) * matricesWeightsExtra[1];
        #endif
        #if NUM_BONE_INFLUENCERS > 6
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[2], frame) * matricesWeightsExtra[2];
        #endif
        #if NUM_BONE_INFLUENCERS > 7
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[3], frame) * matricesWeightsExtra[3];
        #endif
        finalWorld *= VATInfluence;

        // Pass through to fragment
        vUV = uv;
        int subIdx  = int(submeshData.y + 0.5);
        int flatIndex = subIdx + sourceIndex * uSubmeshCount;
        vec4 textureAttributes = RequiemEntityContainer_appearance_get(flatIndex);
        
        vTint = textureAttributes.yzw;
        vSlice = int(textureAttributes.x);
        vAtlasIndex = int(submeshData.x);

        if (vSlice == -1) {
            gl_Position = vec4(0.0, 0.0, 0.0, 0.0); // Degenerate position (not rendered)
        } else {
            vec3 skinned = (finalWorld * vec4(position, 1.0)).xyz;
            vec3 qv = actor.rotation.xyz;
            vec3 scaled = skinned * actor.translation.w;
            vec3 rotated = scaled + 2.0 * cross(
              qv,
              cross(qv, scaled) + actor.rotation.w * scaled
            );
            gl_Position = worldViewProjection * vec4(rotated + actor.translation.xyz, 1.0);
        }
    }
`;

const FS_GL = `
    precision highp float;

    // Varyings from vertex
    varying vec2 vUV;

    // From texture attributes
    flat varying int vSlice;
    flat varying int vAtlasIndex;
    varying vec3 vTint;

    // Atlas textures
    uniform highp sampler2DArray uAtlasArray;
    uniform highp sampler2DArray uCloakAtlasArray;
    uniform highp sampler2DArray uHelmAtlasArray;

    void main() {
      // never branch on vAtlasIndex
      vec3 coords = vec3(vUV, float(vSlice));
      vec4 c0 = texture(uAtlasArray,       coords);
      vec4 c1 = texture(uCloakAtlasArray,   coords);
      vec4 c2 = texture(uHelmAtlasArray,    coords);

      // make three masks: each is 1.0 if the index matches, else 0.0
      float m0 = vAtlasIndex == 0 ? 1.0 : 0.0;
      float m1 = vAtlasIndex == 1 ? 1.0 : 0.0;
      float m2 = vAtlasIndex == 2 ? 1.0 : 0.0;

      vec4 base = c0 * m0 + c1 * m1 + c2 * m2;
      gl_FragColor = vec4(base.rgb * vTint, 1.0);
    }
`;

// GPUPicker's stock material derives its VAT attributes from a live skeleton
// and applies Babylon's thin-instance matrix. Entity transforms live in Shado,
// so picking needs the same vertex path as the visible entity material.
const PICK_VS_GL = `
    precision highp float;

    attribute vec3 position;
    attribute float instanceMeshID;
    flat varying float vMeshID;

    uniform mat4 viewProjection;
    uniform highp sampler2D uShadoVisibilityFlags;
    uniform int uShadoVisibleIndexTexWidth;

    #define THIN_INSTANCES
    #define INSTANCES
    #define BAKED_VERTEX_ANIMATION_TEXTURE
    #include<bonesDeclaration>
    #undef INSTANCES
    #include<bakedVertexAnimationDeclaration>
    #define INSTANCES
    #include<RequiemEntityActor>
    #include<RequiemEntityActorOffsets>
    #include<RequiemEntityContainerStorage>

    void main() {
        int sourceIndex = gl_InstanceID;
        bool actorVisible = texelFetch(
          uShadoVisibilityFlags,
          ivec2(sourceIndex % uShadoVisibleIndexTexWidth, sourceIndex / uShadoVisibleIndexTexWidth),
          0
        ).r > 0.5;
        if (!actorVisible) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        RequiemEntityActorHeader actor = RequiemEntityContainer_instances_get(sourceIndex);
        vMeshID = instanceMeshID;

        vec4 anim = actor.animationBuffer;
        float totalFrames = anim.y - anim.x + 1.0;
        float vatTime = bakedVertexAnimationTime * anim.w / totalFrames;
        float frameCorrection = vatTime < 1.0 ? 0.0 : 1.0;
        float frameCount = totalFrames - frameCorrection;
        float frame = floor(mod(fract(vatTime) * frameCount + anim.z, frameCount));
        frame += anim.x + frameCorrection;
        mat4 VATInfluence = readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[0], frame) * matricesWeights[0];
        #if NUM_BONE_INFLUENCERS > 1
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[1], frame) * matricesWeights[1];
        #endif
        #if NUM_BONE_INFLUENCERS > 2
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[2], frame) * matricesWeights[2];
        #endif
        #if NUM_BONE_INFLUENCERS > 3
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndices[3], frame) * matricesWeights[3];
        #endif
        #if NUM_BONE_INFLUENCERS > 4
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[0], frame) * matricesWeightsExtra[0];
        #endif
        #if NUM_BONE_INFLUENCERS > 5
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[1], frame) * matricesWeightsExtra[1];
        #endif
        #if NUM_BONE_INFLUENCERS > 6
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[2], frame) * matricesWeightsExtra[2];
        #endif
        #if NUM_BONE_INFLUENCERS > 7
          VATInfluence += readMatrixFromRawSamplerVAT(bakedVertexAnimationTexture, matricesIndicesExtra[3], frame) * matricesWeightsExtra[3];
        #endif

        vec3 skinned = (VATInfluence * vec4(position, 1.0)).xyz;
        vec3 qv = actor.rotation.xyz;
        vec3 scaled = skinned * actor.translation.w;
        vec3 rotated = scaled + 2.0 * cross(
          qv,
          cross(qv, scaled) + actor.rotation.w * scaled
        );
        gl_Position = viewProjection * vec4(rotated + actor.translation.xyz, 1.0);
    }
`;

const PICK_FS_GL = `
    precision highp float;
    flat varying float vMeshID;

    void main() {
      float id = floor(vMeshID + 0.5);
      vec3 color = vec3(
        floor(mod(id, 16777216.0) / 65536.0),
        floor(mod(id, 65536.0) / 256.0),
        mod(id, 256.0)
      ) / 255.0;
      gl_FragColor = vec4(color, 1.0);
    }
`;

const WGSL_VAT_DECLARATIONS = `
attribute matricesIndices: vec4f;
attribute matricesWeights: vec4f;
#if NUM_BONE_INFLUENCERS > 4
attribute matricesIndicesExtra: vec4f;
attribute matricesWeightsExtra: vec4f;
#endif
uniform bakedVertexAnimationTime: f32;
var bakedVertexAnimationTexture: texture_2d<f32>;

fn requiemReadVatMatrix(index: f32, frame: f32) -> mat4x4f {
  let offset = i32(index) * 4;
  let row = i32(frame);
  return mat4x4f(
    textureLoad(bakedVertexAnimationTexture, vec2i(offset + 0, row), 0),
    textureLoad(bakedVertexAnimationTexture, vec2i(offset + 1, row), 0),
    textureLoad(bakedVertexAnimationTexture, vec2i(offset + 2, row), 0),
    textureLoad(bakedVertexAnimationTexture, vec2i(offset + 3, row), 0)
  );
}

fn requiemVatInfluence(anim: vec4f, input: VertexInputs) -> mat4x4f {
  let totalFrames = anim.y - anim.x + 1.0;
  let vatTime = uniforms.bakedVertexAnimationTime * anim.w / totalFrames;
  let frameCorrection = select(1.0, 0.0, vatTime < 1.0);
  let frameCount = totalFrames - frameCorrection;
  var frame = floor((fract(vatTime) * frameCount + anim.z) % frameCount);
  frame += anim.x + frameCorrection;
  var influence =
    requiemReadVatMatrix(input.matricesIndices[0], frame) *
    input.matricesWeights[0];
#if NUM_BONE_INFLUENCERS > 1
  influence += requiemReadVatMatrix(input.matricesIndices[1], frame) * input.matricesWeights[1];
#endif
#if NUM_BONE_INFLUENCERS > 2
  influence += requiemReadVatMatrix(input.matricesIndices[2], frame) * input.matricesWeights[2];
#endif
#if NUM_BONE_INFLUENCERS > 3
  influence += requiemReadVatMatrix(input.matricesIndices[3], frame) * input.matricesWeights[3];
#endif
#if NUM_BONE_INFLUENCERS > 4
  influence += requiemReadVatMatrix(input.matricesIndicesExtra[0], frame) * input.matricesWeightsExtra[0];
#endif
#if NUM_BONE_INFLUENCERS > 5
  influence += requiemReadVatMatrix(input.matricesIndicesExtra[1], frame) * input.matricesWeightsExtra[1];
#endif
#if NUM_BONE_INFLUENCERS > 6
  influence += requiemReadVatMatrix(input.matricesIndicesExtra[2], frame) * input.matricesWeightsExtra[2];
#endif
#if NUM_BONE_INFLUENCERS > 7
  influence += requiemReadVatMatrix(input.matricesIndicesExtra[3], frame) * input.matricesWeightsExtra[3];
#endif
  return influence;
}

fn requiemRotate(q: vec4f, point: vec3f) -> vec3f {
  return point + 2.0 * cross(q.xyz, cross(q.xyz, point) + q.w * point);
}
`;

const VS_WGSL = `
attribute position: vec3f;
attribute uv: vec2f;
attribute submeshData: vec2f;
flat varying vSlice: i32;
flat varying vAtlasIndex: i32;
varying vUV: vec2f;
varying vTint: vec3f;
uniform worldViewProjection: mat4x4f;
uniform uSubmeshCount: i32;
uniform uShadoVisibleCount: i32;
var<storage, read> uShadoVisibleIndices: array<u32>;

#include<RequiemEntityActor>
#include<RequiemEntityContainerStorage>
${WGSL_VAT_DECLARATIONS}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let drawIndex = i32(vertexInputs.instanceIndex);
  if (drawIndex >= uniforms.uShadoVisibleCount) {
    vertexOutputs.position = vec4f(2.0, 2.0, 2.0, 1.0);
    return vertexOutputs;
  }

  let sourceIndex = i32(uShadoVisibleIndices[drawIndex]);
  let actor = RequiemEntityContainer_instances_get(sourceIndex);
  let influence = requiemVatInfluence(actor.animationBuffer, input);
  vertexOutputs.vUV = vertexInputs.uv;
  let submeshIndex = i32(vertexInputs.submeshData.y + 0.5);
  let flatIndex = submeshIndex + sourceIndex * uniforms.uSubmeshCount;
  let textureAttributes = RequiemEntityContainer_appearance_get(flatIndex);
  vertexOutputs.vTint = textureAttributes.yzw;
  vertexOutputs.vSlice = i32(textureAttributes.x);
  vertexOutputs.vAtlasIndex = i32(vertexInputs.submeshData.x);

  if (vertexOutputs.vSlice == -1) {
    vertexOutputs.position = vec4f(0.0);
    return vertexOutputs;
  }
  let skinned = (influence * vec4f(vertexInputs.position, 1.0)).xyz;
  let scaled = skinned * actor.translation.w;
  let worldPosition = requiemRotate(actor.rotation, scaled) + actor.translation.xyz;
  vertexOutputs.position = uniforms.worldViewProjection * vec4f(worldPosition, 1.0);
}
`;

const FS_WGSL = `
flat varying vSlice: i32;
flat varying vAtlasIndex: i32;
varying vUV: vec2f;
varying vTint: vec3f;
var uAtlasArraySampler: sampler;
var uAtlasArray: texture_2d_array<f32>;
var uCloakAtlasArraySampler: sampler;
var uCloakAtlasArray: texture_2d_array<f32>;
var uHelmAtlasArraySampler: sampler;
var uHelmAtlasArray: texture_2d_array<f32>;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let slice = fragmentInputs.vSlice;
  let c0 = textureSampleLevel(uAtlasArray, uAtlasArraySampler, fragmentInputs.vUV, slice, 0.0);
  let c1 = textureSampleLevel(
    uCloakAtlasArray,
    uCloakAtlasArraySampler,
    fragmentInputs.vUV,
    slice,
    0.0
  );
  let c2 = textureSampleLevel(
    uHelmAtlasArray,
    uHelmAtlasArraySampler,
    fragmentInputs.vUV,
    slice,
    0.0
  );
  let m0 = select(0.0, 1.0, fragmentInputs.vAtlasIndex == 0);
  let m1 = select(0.0, 1.0, fragmentInputs.vAtlasIndex == 1);
  let m2 = select(0.0, 1.0, fragmentInputs.vAtlasIndex == 2);
  let base = c0 * m0 + c1 * m1 + c2 * m2;
  fragmentOutputs.color = vec4f(base.rgb * fragmentInputs.vTint, 1.0);
}
`;

const PICK_VS_WGSL = `
attribute position: vec3f;
attribute instanceMeshID: f32;
flat varying vMeshID: f32;
uniform viewProjection: mat4x4f;
var uShadoVisibilityFlags: texture_2d<f32>;

#include<RequiemEntityActor>
#include<RequiemEntityContainerStorage>
${WGSL_VAT_DECLARATIONS}

fn requiemPickingActorVisible(index: i32) -> bool {
  let size = textureDimensions(uShadoVisibilityFlags, 0);
  return textureLoad(
    uShadoVisibilityFlags,
    vec2i(index % i32(size.x), index / i32(size.x)),
    0
  ).r > 0.5;
}

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  let sourceIndex = i32(vertexInputs.instanceIndex);
  if (!requiemPickingActorVisible(sourceIndex)) {
    vertexOutputs.position = vec4f(2.0, 2.0, 2.0, 1.0);
    return vertexOutputs;
  }
  let actor = RequiemEntityContainer_instances_get(sourceIndex);
  vertexOutputs.vMeshID = vertexInputs.instanceMeshID;
  let influence = requiemVatInfluence(actor.animationBuffer, input);
  let skinned = (influence * vec4f(vertexInputs.position, 1.0)).xyz;
  let worldPosition =
    requiemRotate(actor.rotation, skinned * actor.translation.w) +
    actor.translation.xyz;
  vertexOutputs.position = uniforms.viewProjection * vec4f(worldPosition, 1.0);
}
`;

const PICK_FS_WGSL = `
flat varying vMeshID: f32;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let id = floor(fragmentInputs.vMeshID + 0.5);
  let encoded = vec3f(
    floor((id % 16777216.0) / 65536.0),
    floor((id % 65536.0) / 256.0),
    id % 256.0
  ) / 255.0;
  fragmentOutputs.color = vec4f(encoded, 1.0);
}
`;

BABYLON.Effect.ShadersStore["vatVertexShader"] = VS_GL;
BABYLON.Effect.ShadersStore["vatFragmentShader"] = FS_GL;
BABYLON.Effect.ShadersStore["vatPickingVertexShader"] = PICK_VS_GL;
BABYLON.Effect.ShadersStore["vatPickingFragmentShader"] = PICK_FS_GL;
BABYLON.ShaderStore.ShadersStoreWGSL["vatVertexShader"] = VS_WGSL;
BABYLON.ShaderStore.ShadersStoreWGSL["vatFragmentShader"] = FS_WGSL;
BABYLON.ShaderStore.ShadersStoreWGSL["vatPickingVertexShader"] = PICK_VS_WGSL;
BABYLON.ShaderStore.ShadersStoreWGSL["vatPickingFragmentShader"] = PICK_FS_WGSL;

// ShaderMaterial appends the active skeleton's matricesIndices/Weights streams
// in isReady(). Listing them here as well produces duplicate WebGPU vertex
// descriptors for the same generated shader locations.
const VAT_ATTRIBUTES = ["position", "uv", "submeshData"];

export function createVATShaderMaterial(
  scene: BJS.Scene,
  shadoPool: ShadoEntityPool,
  model: string,
): BJS.ShaderMaterial {
  shadoPool.commit();
  const useStorageWGSL =
    scene.getEngine().isWebGPU &&
    (RequiemEntityContainer as any).backingPreference === "storage";
  const shadoIo = RequiemEntityContainer.shaderIO(scene.getEngine());
  const shaderMat = new BABYLON.ShaderMaterial(
    `vatShader_${model}`,
    scene,
    {
      vertex: "vat",
      fragment: "vat",
    },
    {
      attributes: VAT_ATTRIBUTES,
      uniforms: [
        "worldViewProjection",
        "uSubmeshCount",
        "uInstanceCount",
        "uShadoVisibleCount",
        "bakedVertexAnimationTextureSizeInverted",
        "bakedVertexAnimationTime",
        ...(useStorageWGSL
          ? []
          : ["uShadoVisibleIndexTexWidth", ...shadoIo.uniforms]),
      ],
      // uniformBuffers: ['TestStructBlock'],
      samplers: [
        "uAtlasArray",
        "uCloakAtlasArray",
        "uHelmAtlasArray",
        "bakedVertexAnimationTexture",
        ...(useStorageWGSL
          ? []
          : ["uShadoVisibleIndices", ...shadoIo.samplers]),
      ],
      defines: [
        "INSTANCES",
        "THIN_INSTANCES",
        "BAKED_VERTEX_ANIMATION_TEXTURE",
        ...((scene.getEngine() as BJS.ThinEngine).disableUniformBuffers
          ? ["DISABLE_UNIFORM_BUFFERS"]
          : []),
      ],
      needAlphaBlending: false,
      needAlphaTesting: false,
      shaderLanguage: useStorageWGSL
        ? BABYLON.ShaderLanguage.WGSL
        : BABYLON.ShaderLanguage.GLSL,
    },
    true,
  );
  // WebGPU establishes the bind group before onBind. Seed this pool's Shado
  // resource once; subsequent draws only update the already-created effect.
  shadoPool.shado.bindMaterial(shaderMat);
  shaderMat.onBind = (mesh) => {
    const effect = shaderMat.getEffect()!;
    const metadata = mesh.metadata as EntityMeshMetadata;

    if (!metadata) {
      console.warn("Entity mesh metadata is missing");
      return;
    }

    const {
      submeshCount,
      atlasArrayTexture,
      cloakAtlasArrayTexture,
      helmAtlasArrayTexture,
      vatTexture,
    } = metadata;
    metadata.shadoPool.commit();
    metadata.shadoPool.shado.bind(effect);
    const visibleCount = metadata.shadoPool.shado.getVisibleCount();
    (mesh as BJS.Mesh).forcedInstanceCount = visibleCount;

    const tmgr = mesh.bakedVertexAnimationManager;
    if (atlasArrayTexture) {
      effect.setTexture("uAtlasArray", atlasArrayTexture);
    }
    if (cloakAtlasArrayTexture) {
      effect.setTexture("uCloakAtlasArray", cloakAtlasArrayTexture);
    }
    if (helmAtlasArrayTexture) {
      effect.setTexture("uHelmAtlasArray", helmAtlasArrayTexture);
    }
    effect.setInt("uSubmeshCount", submeshCount);
    effect.setInt("uInstanceCount", (mesh as BJS.Mesh).thinInstanceCount);
    effect.setInt("uShadoVisibleCount", visibleCount);

    if (vatTexture) {
      effect.setVector2(
        "bakedVertexAnimationTextureSizeInverted",
        metadata.vatTextureSizeInverted,
      );
      effect.setTexture("bakedVertexAnimationTexture", vatTexture);
      effect.setFloat("bakedVertexAnimationTime", tmgr ? tmgr.time : 0);
    }
  };

  shaderMat.onError = (effect, errors) => {
    if (errors) {
      console.log("Vertex Shader Source:", effect._vertexSourceCode);
      console.log("Fragment Shader Source:", effect._fragmentSourceCode);
      console.log("Shader compilation errors:", errors);
    }
  };

  // shaderMat.backFaceCulling = false;
  return shaderMat;
}

export function createVATPickingMaterial(
  scene: BJS.Scene,
  shadoPool: ShadoEntityPool,
  model: string,
): BJS.ShaderMaterial {
  shadoPool.commit();
  const useStorageWGSL =
    scene.getEngine().isWebGPU &&
    (RequiemEntityContainer as any).backingPreference === "storage";
  const shadoIo = RequiemEntityContainer.shaderIO(scene.getEngine());
  const material = new BABYLON.ShaderMaterial(
    `vatPickingShader_${model}`,
    scene,
    { vertex: "vatPicking", fragment: "vatPicking" },
    {
      attributes: [...VAT_ATTRIBUTES, "instanceMeshID"],
      uniforms: [
        "viewProjection",
        "bakedVertexAnimationTextureSizeInverted",
        "bakedVertexAnimationTime",
        ...(useStorageWGSL
          ? []
          : ["uShadoVisibleIndexTexWidth", ...shadoIo.uniforms]),
      ],
      samplers: [
        "bakedVertexAnimationTexture",
        "uShadoVisibilityFlags",
        ...(useStorageWGSL ? [] : shadoIo.samplers),
      ],
      defines: [
        "INSTANCES",
        "THIN_INSTANCES",
        "BAKED_VERTEX_ANIMATION_TEXTURE",
        ...((scene.getEngine() as BJS.ThinEngine).disableUniformBuffers
          ? ["DISABLE_UNIFORM_BUFFERS"]
          : []),
      ],
      shaderLanguage: useStorageWGSL
        ? BABYLON.ShaderLanguage.WGSL
        : BABYLON.ShaderLanguage.GLSL,
    },
    true,
  );
  shadoPool.shado.bindMaterial(material);
  material.onBind = (mesh) => {
    const metadata = mesh.metadata as EntityMeshMetadata;
    if (!metadata?.vatTexture) return;
    metadata.shadoPool.commit();
    const effect = material.getEffect();
    metadata.shadoPool.shado.bind(effect);
    (mesh as BJS.Mesh).forcedInstanceCount = (
      mesh as BJS.Mesh
    ).thinInstanceCount;
    effect.setVector2(
      "bakedVertexAnimationTextureSizeInverted",
      metadata.vatTextureSizeInverted,
    );
    effect.setTexture("bakedVertexAnimationTexture", metadata.vatTexture);
    effect.setFloat(
      "bakedVertexAnimationTime",
      mesh.bakedVertexAnimationManager?.time ?? 0,
    );
  };
  return material;
}
