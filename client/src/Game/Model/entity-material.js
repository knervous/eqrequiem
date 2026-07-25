import BABYLON from "@bjs";
import { RequiemEntityContainer } from "./shado-entity-pool";
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
export function createVATShaderMaterial(scene, shadoPool, model) {
    shadoPool.commit();
    const useStorageWGSL = scene.getEngine().isWebGPU &&
        RequiemEntityContainer.backingPreference === "storage";
    const shadoIo = RequiemEntityContainer.shaderIO(scene.getEngine());
    const shaderMat = new BABYLON.ShaderMaterial(`vatShader_${model}`, scene, {
        vertex: "vat",
        fragment: "vat",
    }, {
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
            ...(scene.getEngine().disableUniformBuffers
                ? ["DISABLE_UNIFORM_BUFFERS"]
                : []),
        ],
        needAlphaBlending: false,
        needAlphaTesting: false,
        shaderLanguage: useStorageWGSL
            ? BABYLON.ShaderLanguage.WGSL
            : BABYLON.ShaderLanguage.GLSL,
    }, true);
    // WebGPU establishes the bind group before onBind. Seed this pool's Shado
    // resource once; subsequent draws only update the already-created effect.
    shadoPool.shado.bindMaterial(shaderMat);
    shaderMat.onBind = (mesh) => {
        const effect = shaderMat.getEffect();
        const metadata = mesh.metadata;
        if (!metadata) {
            console.warn("Entity mesh metadata is missing");
            return;
        }
        const { submeshCount, atlasArrayTexture, cloakAtlasArrayTexture, helmAtlasArrayTexture, vatTexture, } = metadata;
        metadata.shadoPool.commit();
        metadata.shadoPool.shado.bind(effect);
        const visibleCount = metadata.shadoPool.shado.getVisibleCount();
        mesh.forcedInstanceCount = visibleCount;
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
        effect.setInt("uInstanceCount", mesh.thinInstanceCount);
        effect.setInt("uShadoVisibleCount", visibleCount);
        if (vatTexture) {
            effect.setVector2("bakedVertexAnimationTextureSizeInverted", metadata.vatTextureSizeInverted);
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
export function createVATPickingMaterial(scene, shadoPool, model) {
    shadoPool.commit();
    const useStorageWGSL = scene.getEngine().isWebGPU &&
        RequiemEntityContainer.backingPreference === "storage";
    const shadoIo = RequiemEntityContainer.shaderIO(scene.getEngine());
    const material = new BABYLON.ShaderMaterial(`vatPickingShader_${model}`, scene, { vertex: "vatPicking", fragment: "vatPicking" }, {
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
            ...(scene.getEngine().disableUniformBuffers
                ? ["DISABLE_UNIFORM_BUFFERS"]
                : []),
        ],
        shaderLanguage: useStorageWGSL
            ? BABYLON.ShaderLanguage.WGSL
            : BABYLON.ShaderLanguage.GLSL,
    }, true);
    shadoPool.shado.bindMaterial(material);
    material.onBind = (mesh) => {
        const metadata = mesh.metadata;
        if (!metadata?.vatTexture)
            return;
        metadata.shadoPool.commit();
        const effect = material.getEffect();
        metadata.shadoPool.shado.bind(effect);
        mesh.forcedInstanceCount = mesh.thinInstanceCount;
        effect.setVector2("bakedVertexAnimationTextureSizeInverted", metadata.vatTextureSizeInverted);
        effect.setTexture("bakedVertexAnimationTexture", metadata.vatTexture);
        effect.setFloat("bakedVertexAnimationTime", mesh.bakedVertexAnimationManager?.time ?? 0);
    };
    return material;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LW1hdGVyaWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW50aXR5LW1hdGVyaWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUUzQixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUk3RCxNQUFNLEtBQUssR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBK0diLENBQUM7QUFFRixNQUFNLEtBQUssR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQStCYixDQUFDO0FBRUYsNkVBQTZFO0FBQzdFLCtFQUErRTtBQUMvRSx3RUFBd0U7QUFDeEUsTUFBTSxVQUFVLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTJFbEIsQ0FBQztBQUVGLE1BQU0sVUFBVSxHQUFHOzs7Ozs7Ozs7Ozs7O0NBYWxCLENBQUM7QUFFRixNQUFNLHFCQUFxQixHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBMEQ3QixDQUFDO0FBRUYsTUFBTSxPQUFPLEdBQUc7Ozs7Ozs7Ozs7Ozs7OztFQWVkLHFCQUFxQjs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBOEJ0QixDQUFDO0FBRUYsTUFBTSxPQUFPLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQW9DZixDQUFDO0FBRUYsTUFBTSxZQUFZLEdBQUc7Ozs7Ozs7OztFQVNuQixxQkFBcUI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztDQTJCdEIsQ0FB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QVMsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLEVBQUUsRUFBRTtRQUN6QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBOEIsQ0FBQztRQUNyRCxJQUFJLENBQUMsUUFBUSxFQUFFLFVBQVU7WUFBRSxPQUFPO1FBQ2xDLFFBQVEsQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDNUIsTUFBTSxNQUFNLEdBQUcsUUFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3BDLFFBQVEsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxJQUFpQixDQUFDLG1CQUFtQixHQUNwQyxJQUNELENBQUMsaUJBQWlCLENBQUM7UUFDcEIsTUFBTSxDQUFDLFVBQVUsQ0FDZix5Q0FBeUMsRUFDekMsUUFBUSxDQUFDLHNCQUFzQixDQUNoQyxDQUFDO1FBQ0YsTUFBTSxDQUFDLFVBQVUsQ0FBQyw2QkFBNkIsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdEUsTUFBTSxDQUFDLFFBQVEsQ0FDYiwwQkFBMEIsRUFDMUIsSUFBSSxDQUFDLDJCQUEyQixFQUFFLElBQUksSUFBSSxDQUFDLENBQzVDLENBQUM7SUFDSixDQUFDLENBQUM7SUFDRixPQUFPLFFBQVEsQ0FBQztBQUNsQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEJBQllMT04gZnJvbSBcIkBianNcIjtcbmltcG9ydCB0eXBlICogYXMgQkpTIGZyb20gXCJAYmFieWxvbmpzL2NvcmVcIjtcbmltcG9ydCB7IFJlcXVpZW1FbnRpdHlDb250YWluZXIgfSBmcm9tIFwiLi9zaGFkby1lbnRpdHktcG9vbFwiO1xuaW1wb3J0IHR5cGUgeyBFbnRpdHlNZXNoTWV0YWRhdGEgfSBmcm9tIFwiLi9lbnRpdHktdHlwZXNcIjtcbmltcG9ydCB0eXBlIHsgU2hhZG9FbnRpdHlQb29sIH0gZnJvbSBcIi4vc2hhZG8tZW50aXR5LXBvb2xcIjtcblxuY29uc3QgVlNfR0wgPSBgXG4gICAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuXG4gICAgLy8gQXR0cmlidXRlc1xuICAgIGF0dHJpYnV0ZSB2ZWMzIHBvc2l0aW9uO1xuICAgIGF0dHJpYnV0ZSB2ZWMyIHV2O1xuICAgIGF0dHJpYnV0ZSB2ZWMyIHN1Ym1lc2hEYXRhO1xuXG4gICAgLy8gVmFyeWluZ3Mg4oaSIGZyYWdtZW50XG4gICAgZmxhdCB2YXJ5aW5nIGludCB2U2xpY2U7XG4gICAgZmxhdCB2YXJ5aW5nIGludCB2QXRsYXNJbmRleDtcbiAgICB2YXJ5aW5nIHZlYzIgdlVWO1xuICAgIHZhcnlpbmcgdmVjMyB2VGludDtcblxuICAgIC8vIFVuaWZvcm1zXG4gICAgdW5pZm9ybSBtYXQ0IHdvcmxkVmlld1Byb2plY3Rpb247XG4gICAgdW5pZm9ybSBpbnQgIHVTdWJtZXNoQ291bnQ7XG4gICAgdW5pZm9ybSBpbnQgIHVJbnN0YW5jZUNvdW50O1xuICAgIHVuaWZvcm0gaGlnaHAgc2FtcGxlcjJEIHVTaGFkb1Zpc2libGVJbmRpY2VzO1xuICAgIHVuaWZvcm0gaW50IHVTaGFkb1Zpc2libGVJbmRleFRleFdpZHRoO1xuICAgIHVuaWZvcm0gaW50IHVTaGFkb1Zpc2libGVDb3VudDtcblxuICAgIC8vIEJhYnlsb24uanMgaW5jbHVkZXMgKHdpbGwgYmUgdHJhbnNwaWxlZCB1bmRlciB0aGUgaG9vZClcbiAgICAjZGVmaW5lIFRISU5fSU5TVEFOQ0VTXG4gICAgI2RlZmluZSBJTlNUQU5DRVNcbiAgICAjZGVmaW5lIEJBS0VEX1ZFUlRFWF9BTklNQVRJT05fVEVYVFVSRVxuICAgICNpbmNsdWRlPGJvbmVzRGVjbGFyYXRpb24+XG4gICAgI3VuZGVmIElOU1RBTkNFU1xuICAgICNpbmNsdWRlPGJha2VkVmVydGV4QW5pbWF0aW9uRGVjbGFyYXRpb24+XG4gICAgI2RlZmluZSBJTlNUQU5DRVNcbiAgICAjaW5jbHVkZTxSZXF1aWVtRW50aXR5QWN0b3I+XG4gICAgI2luY2x1ZGU8UmVxdWllbUVudGl0eUFjdG9yT2Zmc2V0cz5cbiAgICAjaW5jbHVkZTxSZXF1aWVtRW50aXR5Q29udGFpbmVyU3RvcmFnZT5cblxuICAgIGludCByZXF1aWVtVmlzaWJsZUFjdG9ySW5kZXgoaW50IGRyYXdJbmRleCkge1xuICAgICAgaW50IHRleGVsSW5kZXggPSBkcmF3SW5kZXggLyA0O1xuICAgICAgdmVjNCBwYWNrZWQgPSB0ZXhlbEZldGNoKFxuICAgICAgICB1U2hhZG9WaXNpYmxlSW5kaWNlcyxcbiAgICAgICAgaXZlYzIodGV4ZWxJbmRleCAlIHVTaGFkb1Zpc2libGVJbmRleFRleFdpZHRoLCB0ZXhlbEluZGV4IC8gdVNoYWRvVmlzaWJsZUluZGV4VGV4V2lkdGgpLFxuICAgICAgICAwXG4gICAgICApO1xuICAgICAgaW50IGxhbmUgPSBkcmF3SW5kZXggLSB0ZXhlbEluZGV4ICogNDtcbiAgICAgIGZsb2F0IHZhbHVlID0gbGFuZSA9PSAwID8gcGFja2VkLnggOiBsYW5lID09IDEgPyBwYWNrZWQueSA6IGxhbmUgPT0gMiA/IHBhY2tlZC56IDogcGFja2VkLnc7XG4gICAgICByZXR1cm4gaW50KHZhbHVlICsgMC41KTtcbiAgICB9XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICAgIGludCBkcmF3SW5kZXggPSBnbF9JbnN0YW5jZUlEO1xuICAgICAgICBpZiAoZHJhd0luZGV4ID49IHVTaGFkb1Zpc2libGVDb3VudCkge1xuICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCgyLjAsIDIuMCwgMi4wLCAxLjApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpbnQgc291cmNlSW5kZXggPSByZXF1aWVtVmlzaWJsZUFjdG9ySW5kZXgoZHJhd0luZGV4KTtcbiAgICAgICAgUmVxdWllbUVudGl0eUFjdG9ySGVhZGVyIGFjdG9yID0gUmVxdWllbUVudGl0eUNvbnRhaW5lcl9pbnN0YW5jZXNfZ2V0KHNvdXJjZUluZGV4KTtcbiAgICAgICAgLy8gU2hhZG8gaXMgdGhlIGF1dGhvcml0YXRpdmUgaW5zdGFuY2UgdHJhbnNmb3JtLiBCYWJ5bG9uJ3MgdGhpblxuICAgICAgICAvLyBpbnN0YW5jZSBpcyByZXRhaW5lZCBvbmx5IGFzIHRoZSBkcmF3LWNvdW50IGFkYXB0ZXIuXG4gICAgICAgIG1hdDQgZmluYWxXb3JsZCA9IG1hdDQoMS4wKTtcbiAgICAgICAgdmVjNCBhbmltID0gYWN0b3IuYW5pbWF0aW9uQnVmZmVyO1xuICAgICAgICBmbG9hdCB0b3RhbEZyYW1lcyA9IGFuaW0ueSAtIGFuaW0ueCArIDEuMDtcbiAgICAgICAgZmxvYXQgdmF0VGltZSA9IGJha2VkVmVydGV4QW5pbWF0aW9uVGltZSAqIGFuaW0udyAvIHRvdGFsRnJhbWVzO1xuICAgICAgICBmbG9hdCBmcmFtZUNvcnJlY3Rpb24gPSB2YXRUaW1lIDwgMS4wID8gMC4wIDogMS4wO1xuICAgICAgICBmbG9hdCBmcmFtZUNvdW50ID0gdG90YWxGcmFtZXMgLSBmcmFtZUNvcnJlY3Rpb247XG4gICAgICAgIGZsb2F0IGZyYW1lID0gZmxvb3IobW9kKGZyYWN0KHZhdFRpbWUpICogZnJhbWVDb3VudCArIGFuaW0ueiwgZnJhbWVDb3VudCkpO1xuICAgICAgICBmcmFtZSArPSBhbmltLnggKyBmcmFtZUNvcnJlY3Rpb247XG4gICAgICAgIG1hdDQgVkFUSW5mbHVlbmNlID0gcmVhZE1hdHJpeEZyb21SYXdTYW1wbGVyVkFUKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgbWF0cmljZXNJbmRpY2VzWzBdLCBmcmFtZSkgKiBtYXRyaWNlc1dlaWdodHNbMF07XG4gICAgICAgICNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDFcbiAgICAgICAgICBWQVRJbmZsdWVuY2UgKz0gcmVhZE1hdHJpeEZyb21SYXdTYW1wbGVyVkFUKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgbWF0cmljZXNJbmRpY2VzWzFdLCBmcmFtZSkgKiBtYXRyaWNlc1dlaWdodHNbMV07XG4gICAgICAgICNlbmRpZlxuICAgICAgICAjaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiAyXG4gICAgICAgICAgVkFUSW5mbHVlbmNlICs9IHJlYWRNYXRyaXhGcm9tUmF3U2FtcGxlclZBVChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIG1hdHJpY2VzSW5kaWNlc1syXSwgZnJhbWUpICogbWF0cmljZXNXZWlnaHRzWzJdO1xuICAgICAgICAjZW5kaWZcbiAgICAgICAgI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gM1xuICAgICAgICAgIFZBVEluZmx1ZW5jZSArPSByZWFkTWF0cml4RnJvbVJhd1NhbXBsZXJWQVQoYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlLCBtYXRyaWNlc0luZGljZXNbM10sIGZyYW1lKSAqIG1hdHJpY2VzV2VpZ2h0c1szXTtcbiAgICAgICAgI2VuZGlmXG4gICAgICAgICNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDRcbiAgICAgICAgICBWQVRJbmZsdWVuY2UgKz0gcmVhZE1hdHJpeEZyb21SYXdTYW1wbGVyVkFUKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgbWF0cmljZXNJbmRpY2VzRXh0cmFbMF0sIGZyYW1lKSAqIG1hdHJpY2VzV2VpZ2h0c0V4dHJhWzBdO1xuICAgICAgICAjZW5kaWZcbiAgICAgICAgI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gNVxuICAgICAgICAgIFZBVEluZmx1ZW5jZSArPSByZWFkTWF0cml4RnJvbVJhd1NhbXBsZXJWQVQoYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlLCBtYXRyaWNlc0luZGljZXNFeHRyYVsxXSwgZnJhbWUpICogbWF0cmljZXNXZWlnaHRzRXh0cmFbMV07XG4gICAgICAgICNlbmRpZlxuICAgICAgICAjaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiA2XG4gICAgICAgICAgVkFUSW5mbHVlbmNlICs9IHJlYWRNYXRyaXhGcm9tUmF3U2FtcGxlclZBVChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIG1hdHJpY2VzSW5kaWNlc0V4dHJhWzJdLCBmcmFtZSkgKiBtYXRyaWNlc1dlaWdodHNFeHRyYVsyXTtcbiAgICAgICAgI2VuZGlmXG4gICAgICAgICNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDdcbiAgICAgICAgICBWQVRJbmZsdWVuY2UgKz0gcmVhZE1hdHJpeEZyb21SYXdTYW1wbGVyVkFUKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgbWF0cmljZXNJbmRpY2VzRXh0cmFbM10sIGZyYW1lKSAqIG1hdHJpY2VzV2VpZ2h0c0V4dHJhWzNdO1xuICAgICAgICAjZW5kaWZcbiAgICAgICAgZmluYWxXb3JsZCAqPSBWQVRJbmZsdWVuY2U7XG5cbiAgICAgICAgLy8gUGFzcyB0aHJvdWdoIHRvIGZyYWdtZW50XG4gICAgICAgIHZVViA9IHV2O1xuICAgICAgICBpbnQgc3ViSWR4ICA9IGludChzdWJtZXNoRGF0YS55ICsgMC41KTtcbiAgICAgICAgaW50IGZsYXRJbmRleCA9IHN1YklkeCArIHNvdXJjZUluZGV4ICogdVN1Ym1lc2hDb3VudDtcbiAgICAgICAgdmVjNCB0ZXh0dXJlQXR0cmlidXRlcyA9IFJlcXVpZW1FbnRpdHlDb250YWluZXJfYXBwZWFyYW5jZV9nZXQoZmxhdEluZGV4KTtcbiAgICAgICAgXG4gICAgICAgIHZUaW50ID0gdGV4dHVyZUF0dHJpYnV0ZXMueXp3O1xuICAgICAgICB2U2xpY2UgPSBpbnQodGV4dHVyZUF0dHJpYnV0ZXMueCk7XG4gICAgICAgIHZBdGxhc0luZGV4ID0gaW50KHN1Ym1lc2hEYXRhLngpO1xuXG4gICAgICAgIGlmICh2U2xpY2UgPT0gLTEpIHtcbiAgICAgICAgICAgIGdsX1Bvc2l0aW9uID0gdmVjNCgwLjAsIDAuMCwgMC4wLCAwLjApOyAvLyBEZWdlbmVyYXRlIHBvc2l0aW9uIChub3QgcmVuZGVyZWQpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2ZWMzIHNraW5uZWQgPSAoZmluYWxXb3JsZCAqIHZlYzQocG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgICAgICAgICAgIHZlYzMgcXYgPSBhY3Rvci5yb3RhdGlvbi54eXo7XG4gICAgICAgICAgICB2ZWMzIHNjYWxlZCA9IHNraW5uZWQgKiBhY3Rvci50cmFuc2xhdGlvbi53O1xuICAgICAgICAgICAgdmVjMyByb3RhdGVkID0gc2NhbGVkICsgMi4wICogY3Jvc3MoXG4gICAgICAgICAgICAgIHF2LFxuICAgICAgICAgICAgICBjcm9zcyhxdiwgc2NhbGVkKSArIGFjdG9yLnJvdGF0aW9uLncgKiBzY2FsZWRcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBnbF9Qb3NpdGlvbiA9IHdvcmxkVmlld1Byb2plY3Rpb24gKiB2ZWM0KHJvdGF0ZWQgKyBhY3Rvci50cmFuc2xhdGlvbi54eXosIDEuMCk7XG4gICAgICAgIH1cbiAgICB9XG5gO1xuXG5jb25zdCBGU19HTCA9IGBcbiAgICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG5cbiAgICAvLyBWYXJ5aW5ncyBmcm9tIHZlcnRleFxuICAgIHZhcnlpbmcgdmVjMiB2VVY7XG5cbiAgICAvLyBGcm9tIHRleHR1cmUgYXR0cmlidXRlc1xuICAgIGZsYXQgdmFyeWluZyBpbnQgdlNsaWNlO1xuICAgIGZsYXQgdmFyeWluZyBpbnQgdkF0bGFzSW5kZXg7XG4gICAgdmFyeWluZyB2ZWMzIHZUaW50O1xuXG4gICAgLy8gQXRsYXMgdGV4dHVyZXNcbiAgICB1bmlmb3JtIGhpZ2hwIHNhbXBsZXIyREFycmF5IHVBdGxhc0FycmF5O1xuICAgIHVuaWZvcm0gaGlnaHAgc2FtcGxlcjJEQXJyYXkgdUNsb2FrQXRsYXNBcnJheTtcbiAgICB1bmlmb3JtIGhpZ2hwIHNhbXBsZXIyREFycmF5IHVIZWxtQXRsYXNBcnJheTtcblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgIC8vIG5ldmVyIGJyYW5jaCBvbiB2QXRsYXNJbmRleFxuICAgICAgdmVjMyBjb29yZHMgPSB2ZWMzKHZVViwgZmxvYXQodlNsaWNlKSk7XG4gICAgICB2ZWM0IGMwID0gdGV4dHVyZSh1QXRsYXNBcnJheSwgICAgICAgY29vcmRzKTtcbiAgICAgIHZlYzQgYzEgPSB0ZXh0dXJlKHVDbG9ha0F0bGFzQXJyYXksICAgY29vcmRzKTtcbiAgICAgIHZlYzQgYzIgPSB0ZXh0dXJlKHVIZWxtQXRsYXNBcnJheSwgICAgY29vcmRzKTtcblxuICAgICAgLy8gbWFrZSB0aHJlZSBtYXNrczogZWFjaCBpcyAxLjAgaWYgdGhlIGluZGV4IG1hdGNoZXMsIGVsc2UgMC4wXG4gICAgICBmbG9hdCBtMCA9IHZBdGxhc0luZGV4ID09IDAgPyAxLjAgOiAwLjA7XG4gICAgICBmbG9hdCBtMSA9IHZBdGxhc0luZGV4ID09IDEgPyAxLjAgOiAwLjA7XG4gICAgICBmbG9hdCBtMiA9IHZBdGxhc0luZGV4ID09IDIgPyAxLjAgOiAwLjA7XG5cbiAgICAgIHZlYzQgYmFzZSA9IGMwICogbTAgKyBjMSAqIG0xICsgYzIgKiBtMjtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoYmFzZS5yZ2IgKiB2VGludCwgMS4wKTtcbiAgICB9XG5gO1xuXG4vLyBHUFVQaWNrZXIncyBzdG9jayBtYXRlcmlhbCBkZXJpdmVzIGl0cyBWQVQgYXR0cmlidXRlcyBmcm9tIGEgbGl2ZSBza2VsZXRvblxuLy8gYW5kIGFwcGxpZXMgQmFieWxvbidzIHRoaW4taW5zdGFuY2UgbWF0cml4LiBFbnRpdHkgdHJhbnNmb3JtcyBsaXZlIGluIFNoYWRvLFxuLy8gc28gcGlja2luZyBuZWVkcyB0aGUgc2FtZSB2ZXJ0ZXggcGF0aCBhcyB0aGUgdmlzaWJsZSBlbnRpdHkgbWF0ZXJpYWwuXG5jb25zdCBQSUNLX1ZTX0dMID0gYFxuICAgIHByZWNpc2lvbiBoaWdocCBmbG9hdDtcblxuICAgIGF0dHJpYnV0ZSB2ZWMzIHBvc2l0aW9uO1xuICAgIGF0dHJpYnV0ZSBmbG9hdCBpbnN0YW5jZU1lc2hJRDtcbiAgICBmbGF0IHZhcnlpbmcgZmxvYXQgdk1lc2hJRDtcblxuICAgIHVuaWZvcm0gbWF0NCB2aWV3UHJvamVjdGlvbjtcbiAgICB1bmlmb3JtIGhpZ2hwIHNhbXBsZXIyRCB1U2hhZG9WaXNpYmlsaXR5RmxhZ3M7XG4gICAgdW5pZm9ybSBpbnQgdVNoYWRvVmlzaWJsZUluZGV4VGV4V2lkdGg7XG5cbiAgICAjZGVmaW5lIFRISU5fSU5TVEFOQ0VTXG4gICAgI2RlZmluZSBJTlNUQU5DRVNcbiAgICAjZGVmaW5lIEJBS0VEX1ZFUlRFWF9BTklNQVRJT05fVEVYVFVSRVxuICAgICNpbmNsdWRlPGJvbmVzRGVjbGFyYXRpb24+XG4gICAgI3VuZGVmIElOU1RBTkNFU1xuICAgICNpbmNsdWRlPGJha2VkVmVydGV4QW5pbWF0aW9uRGVjbGFyYXRpb24+XG4gICAgI2RlZmluZSBJTlNUQU5DRVNcbiAgICAjaW5jbHVkZTxSZXF1aWVtRW50aXR5QWN0b3I+XG4gICAgI2luY2x1ZGU8UmVxdWllbUVudGl0eUFjdG9yT2Zmc2V0cz5cbiAgICAjaW5jbHVkZTxSZXF1aWVtRW50aXR5Q29udGFpbmVyU3RvcmFnZT5cblxuICAgIHZvaWQgbWFpbigpIHtcbiAgICAgICAgaW50IHNvdXJjZUluZGV4ID0gZ2xfSW5zdGFuY2VJRDtcbiAgICAgICAgYm9vbCBhY3RvclZpc2libGUgPSB0ZXhlbEZldGNoKFxuICAgICAgICAgIHVTaGFkb1Zpc2liaWxpdHlGbGFncyxcbiAgICAgICAgICBpdmVjMihzb3VyY2VJbmRleCAlIHVTaGFkb1Zpc2libGVJbmRleFRleFdpZHRoLCBzb3VyY2VJbmRleCAvIHVTaGFkb1Zpc2libGVJbmRleFRleFdpZHRoKSxcbiAgICAgICAgICAwXG4gICAgICAgICkuciA+IDAuNTtcbiAgICAgICAgaWYgKCFhY3RvclZpc2libGUpIHtcbiAgICAgICAgICBnbF9Qb3NpdGlvbiA9IHZlYzQoMi4wLCAyLjAsIDIuMCwgMS4wKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgUmVxdWllbUVudGl0eUFjdG9ySGVhZGVyIGFjdG9yID0gUmVxdWllbUVudGl0eUNvbnRhaW5lcl9pbnN0YW5jZXNfZ2V0KHNvdXJjZUluZGV4KTtcbiAgICAgICAgdk1lc2hJRCA9IGluc3RhbmNlTWVzaElEO1xuXG4gICAgICAgIHZlYzQgYW5pbSA9IGFjdG9yLmFuaW1hdGlvbkJ1ZmZlcjtcbiAgICAgICAgZmxvYXQgdG90YWxGcmFtZXMgPSBhbmltLnkgLSBhbmltLnggKyAxLjA7XG4gICAgICAgIGZsb2F0IHZhdFRpbWUgPSBiYWtlZFZlcnRleEFuaW1hdGlvblRpbWUgKiBhbmltLncgLyB0b3RhbEZyYW1lcztcbiAgICAgICAgZmxvYXQgZnJhbWVDb3JyZWN0aW9uID0gdmF0VGltZSA8IDEuMCA/IDAuMCA6IDEuMDtcbiAgICAgICAgZmxvYXQgZnJhbWVDb3VudCA9IHRvdGFsRnJhbWVzIC0gZnJhbWVDb3JyZWN0aW9uO1xuICAgICAgICBmbG9hdCBmcmFtZSA9IGZsb29yKG1vZChmcmFjdCh2YXRUaW1lKSAqIGZyYW1lQ291bnQgKyBhbmltLnosIGZyYW1lQ291bnQpKTtcbiAgICAgICAgZnJhbWUgKz0gYW5pbS54ICsgZnJhbWVDb3JyZWN0aW9uO1xuICAgICAgICBtYXQ0IFZBVEluZmx1ZW5jZSA9IHJlYWRNYXRyaXhGcm9tUmF3U2FtcGxlclZBVChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIG1hdHJpY2VzSW5kaWNlc1swXSwgZnJhbWUpICogbWF0cmljZXNXZWlnaHRzWzBdO1xuICAgICAgICAjaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiAxXG4gICAgICAgICAgVkFUSW5mbHVlbmNlICs9IHJlYWRNYXRyaXhGcm9tUmF3U2FtcGxlclZBVChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIG1hdHJpY2VzSW5kaWNlc1sxXSwgZnJhbWUpICogbWF0cmljZXNXZWlnaHRzWzFdO1xuICAgICAgICAjZW5kaWZcbiAgICAgICAgI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gMlxuICAgICAgICAgIFZBVEluZmx1ZW5jZSArPSByZWFkTWF0cml4RnJvbVJhd1NhbXBsZXJWQVQoYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlLCBtYXRyaWNlc0luZGljZXNbMl0sIGZyYW1lKSAqIG1hdHJpY2VzV2VpZ2h0c1syXTtcbiAgICAgICAgI2VuZGlmXG4gICAgICAgICNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDNcbiAgICAgICAgICBWQVRJbmZsdWVuY2UgKz0gcmVhZE1hdHJpeEZyb21SYXdTYW1wbGVyVkFUKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgbWF0cmljZXNJbmRpY2VzWzNdLCBmcmFtZSkgKiBtYXRyaWNlc1dlaWdodHNbM107XG4gICAgICAgICNlbmRpZlxuICAgICAgICAjaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiA0XG4gICAgICAgICAgVkFUSW5mbHVlbmNlICs9IHJlYWRNYXRyaXhGcm9tUmF3U2FtcGxlclZBVChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIG1hdHJpY2VzSW5kaWNlc0V4dHJhWzBdLCBmcmFtZSkgKiBtYXRyaWNlc1dlaWdodHNFeHRyYVswXTtcbiAgICAgICAgI2VuZGlmXG4gICAgICAgICNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDVcbiAgICAgICAgICBWQVRJbmZsdWVuY2UgKz0gcmVhZE1hdHJpeEZyb21SYXdTYW1wbGVyVkFUKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgbWF0cmljZXNJbmRpY2VzRXh0cmFbMV0sIGZyYW1lKSAqIG1hdHJpY2VzV2VpZ2h0c0V4dHJhWzFdO1xuICAgICAgICAjZW5kaWZcbiAgICAgICAgI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gNlxuICAgICAgICAgIFZBVEluZmx1ZW5jZSArPSByZWFkTWF0cml4RnJvbVJhd1NhbXBsZXJWQVQoYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlLCBtYXRyaWNlc0luZGljZXNFeHRyYVsyXSwgZnJhbWUpICogbWF0cmljZXNXZWlnaHRzRXh0cmFbMl07XG4gICAgICAgICNlbmRpZlxuICAgICAgICAjaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiA3XG4gICAgICAgICAgVkFUSW5mbHVlbmNlICs9IHJlYWRNYXRyaXhGcm9tUmF3U2FtcGxlclZBVChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIG1hdHJpY2VzSW5kaWNlc0V4dHJhWzNdLCBmcmFtZSkgKiBtYXRyaWNlc1dlaWdodHNFeHRyYVszXTtcbiAgICAgICAgI2VuZGlmXG5cbiAgICAgICAgdmVjMyBza2lubmVkID0gKFZBVEluZmx1ZW5jZSAqIHZlYzQocG9zaXRpb24sIDEuMCkpLnh5ejtcbiAgICAgICAgdmVjMyBxdiA9IGFjdG9yLnJvdGF0aW9uLnh5ejtcbiAgICAgICAgdmVjMyBzY2FsZWQgPSBza2lubmVkICogYWN0b3IudHJhbnNsYXRpb24udztcbiAgICAgICAgdmVjMyByb3RhdGVkID0gc2NhbGVkICsgMi4wICogY3Jvc3MoXG4gICAgICAgICAgcXYsXG4gICAgICAgICAgY3Jvc3MocXYsIHNjYWxlZCkgKyBhY3Rvci5yb3RhdGlvbi53ICogc2NhbGVkXG4gICAgICAgICk7XG4gICAgICAgIGdsX1Bvc2l0aW9uID0gdmlld1Byb2plY3Rpb24gKiB2ZWM0KHJvdGF0ZWQgKyBhY3Rvci50cmFuc2xhdGlvbi54eXosIDEuMCk7XG4gICAgfVxuYDtcblxuY29uc3QgUElDS19GU19HTCA9IGBcbiAgICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG4gICAgZmxhdCB2YXJ5aW5nIGZsb2F0IHZNZXNoSUQ7XG5cbiAgICB2b2lkIG1haW4oKSB7XG4gICAgICBmbG9hdCBpZCA9IGZsb29yKHZNZXNoSUQgKyAwLjUpO1xuICAgICAgdmVjMyBjb2xvciA9IHZlYzMoXG4gICAgICAgIGZsb29yKG1vZChpZCwgMTY3NzcyMTYuMCkgLyA2NTUzNi4wKSxcbiAgICAgICAgZmxvb3IobW9kKGlkLCA2NTUzNi4wKSAvIDI1Ni4wKSxcbiAgICAgICAgbW9kKGlkLCAyNTYuMClcbiAgICAgICkgLyAyNTUuMDtcbiAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuMCk7XG4gICAgfVxuYDtcblxuY29uc3QgV0dTTF9WQVRfREVDTEFSQVRJT05TID0gYFxuYXR0cmlidXRlIG1hdHJpY2VzSW5kaWNlczogdmVjNGY7XG5hdHRyaWJ1dGUgbWF0cmljZXNXZWlnaHRzOiB2ZWM0ZjtcbiNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDRcbmF0dHJpYnV0ZSBtYXRyaWNlc0luZGljZXNFeHRyYTogdmVjNGY7XG5hdHRyaWJ1dGUgbWF0cmljZXNXZWlnaHRzRXh0cmE6IHZlYzRmO1xuI2VuZGlmXG51bmlmb3JtIGJha2VkVmVydGV4QW5pbWF0aW9uVGltZTogZjMyO1xudmFyIGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZTogdGV4dHVyZV8yZDxmMzI+O1xuXG5mbiByZXF1aWVtUmVhZFZhdE1hdHJpeChpbmRleDogZjMyLCBmcmFtZTogZjMyKSAtPiBtYXQ0eDRmIHtcbiAgbGV0IG9mZnNldCA9IGkzMihpbmRleCkgKiA0O1xuICBsZXQgcm93ID0gaTMyKGZyYW1lKTtcbiAgcmV0dXJuIG1hdDR4NGYoXG4gICAgdGV4dHVyZUxvYWQoYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlLCB2ZWMyaShvZmZzZXQgKyAwLCByb3cpLCAwKSxcbiAgICB0ZXh0dXJlTG9hZChiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmUsIHZlYzJpKG9mZnNldCArIDEsIHJvdyksIDApLFxuICAgIHRleHR1cmVMb2FkKGJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSwgdmVjMmkob2Zmc2V0ICsgMiwgcm93KSwgMCksXG4gICAgdGV4dHVyZUxvYWQoYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlLCB2ZWMyaShvZmZzZXQgKyAzLCByb3cpLCAwKVxuICApO1xufVxuXG5mbiByZXF1aWVtVmF0SW5mbHVlbmNlKGFuaW06IHZlYzRmLCBpbnB1dDogVmVydGV4SW5wdXRzKSAtPiBtYXQ0eDRmIHtcbiAgbGV0IHRvdGFsRnJhbWVzID0gYW5pbS55IC0gYW5pbS54ICsgMS4wO1xuICBsZXQgdmF0VGltZSA9IHVuaWZvcm1zLmJha2VkVmVydGV4QW5pbWF0aW9uVGltZSAqIGFuaW0udyAvIHRvdGFsRnJhbWVzO1xuICBsZXQgZnJhbWVDb3JyZWN0aW9uID0gc2VsZWN0KDEuMCwgMC4wLCB2YXRUaW1lIDwgMS4wKTtcbiAgbGV0IGZyYW1lQ291bnQgPSB0b3RhbEZyYW1lcyAtIGZyYW1lQ29ycmVjdGlvbjtcbiAgdmFyIGZyYW1lID0gZmxvb3IoKGZyYWN0KHZhdFRpbWUpICogZnJhbWVDb3VudCArIGFuaW0ueikgJSBmcmFtZUNvdW50KTtcbiAgZnJhbWUgKz0gYW5pbS54ICsgZnJhbWVDb3JyZWN0aW9uO1xuICB2YXIgaW5mbHVlbmNlID1cbiAgICByZXF1aWVtUmVhZFZhdE1hdHJpeChpbnB1dC5tYXRyaWNlc0luZGljZXNbMF0sIGZyYW1lKSAqXG4gICAgaW5wdXQubWF0cmljZXNXZWlnaHRzWzBdO1xuI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gMVxuICBpbmZsdWVuY2UgKz0gcmVxdWllbVJlYWRWYXRNYXRyaXgoaW5wdXQubWF0cmljZXNJbmRpY2VzWzFdLCBmcmFtZSkgKiBpbnB1dC5tYXRyaWNlc1dlaWdodHNbMV07XG4jZW5kaWZcbiNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDJcbiAgaW5mbHVlbmNlICs9IHJlcXVpZW1SZWFkVmF0TWF0cml4KGlucHV0Lm1hdHJpY2VzSW5kaWNlc1syXSwgZnJhbWUpICogaW5wdXQubWF0cmljZXNXZWlnaHRzWzJdO1xuI2VuZGlmXG4jaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiAzXG4gIGluZmx1ZW5jZSArPSByZXF1aWVtUmVhZFZhdE1hdHJpeChpbnB1dC5tYXRyaWNlc0luZGljZXNbM10sIGZyYW1lKSAqIGlucHV0Lm1hdHJpY2VzV2VpZ2h0c1szXTtcbiNlbmRpZlxuI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gNFxuICBpbmZsdWVuY2UgKz0gcmVxdWllbVJlYWRWYXRNYXRyaXgoaW5wdXQubWF0cmljZXNJbmRpY2VzRXh0cmFbMF0sIGZyYW1lKSAqIGlucHV0Lm1hdHJpY2VzV2VpZ2h0c0V4dHJhWzBdO1xuI2VuZGlmXG4jaWYgTlVNX0JPTkVfSU5GTFVFTkNFUlMgPiA1XG4gIGluZmx1ZW5jZSArPSByZXF1aWVtUmVhZFZhdE1hdHJpeChpbnB1dC5tYXRyaWNlc0luZGljZXNFeHRyYVsxXSwgZnJhbWUpICogaW5wdXQubWF0cmljZXNXZWlnaHRzRXh0cmFbMV07XG4jZW5kaWZcbiNpZiBOVU1fQk9ORV9JTkZMVUVOQ0VSUyA+IDZcbiAgaW5mbHVlbmNlICs9IHJlcXVpZW1SZWFkVmF0TWF0cml4KGlucHV0Lm1hdHJpY2VzSW5kaWNlc0V4dHJhWzJdLCBmcmFtZSkgKiBpbnB1dC5tYXRyaWNlc1dlaWdodHNFeHRyYVsyXTtcbiNlbmRpZlxuI2lmIE5VTV9CT05FX0lORkxVRU5DRVJTID4gN1xuICBpbmZsdWVuY2UgKz0gcmVxdWllbVJlYWRWYXRNYXRyaXgoaW5wdXQubWF0cmljZXNJbmRpY2VzRXh0cmFbM10sIGZyYW1lKSAqIGlucHV0Lm1hdHJpY2VzV2VpZ2h0c0V4dHJhWzNdO1xuI2VuZGlmXG4gIHJldHVybiBpbmZsdWVuY2U7XG59XG5cbmZuIHJlcXVpZW1Sb3RhdGUocTogdmVjNGYsIHBvaW50OiB2ZWMzZikgLT4gdmVjM2Yge1xuICByZXR1cm4gcG9pbnQgKyAyLjAgKiBjcm9zcyhxLnh5eiwgY3Jvc3MocS54eXosIHBvaW50KSArIHEudyAqIHBvaW50KTtcbn1cbmA7XG5cbmNvbnN0IFZTX1dHU0wgPSBgXG5hdHRyaWJ1dGUgcG9zaXRpb246IHZlYzNmO1xuYXR0cmlidXRlIHV2OiB2ZWMyZjtcbmF0dHJpYnV0ZSBzdWJtZXNoRGF0YTogdmVjMmY7XG5mbGF0IHZhcnlpbmcgdlNsaWNlOiBpMzI7XG5mbGF0IHZhcnlpbmcgdkF0bGFzSW5kZXg6IGkzMjtcbnZhcnlpbmcgdlVWOiB2ZWMyZjtcbnZhcnlpbmcgdlRpbnQ6IHZlYzNmO1xudW5pZm9ybSB3b3JsZFZpZXdQcm9qZWN0aW9uOiBtYXQ0eDRmO1xudW5pZm9ybSB1U3VibWVzaENvdW50OiBpMzI7XG51bmlmb3JtIHVTaGFkb1Zpc2libGVDb3VudDogaTMyO1xudmFyPHN0b3JhZ2UsIHJlYWQ+IHVTaGFkb1Zpc2libGVJbmRpY2VzOiBhcnJheTx1MzI+O1xuXG4jaW5jbHVkZTxSZXF1aWVtRW50aXR5QWN0b3I+XG4jaW5jbHVkZTxSZXF1aWVtRW50aXR5Q29udGFpbmVyU3RvcmFnZT5cbiR7V0dTTF9WQVRfREVDTEFSQVRJT05TfVxuXG5AdmVydGV4XG5mbiBtYWluKGlucHV0OiBWZXJ0ZXhJbnB1dHMpIC0+IEZyYWdtZW50SW5wdXRzIHtcbiAgbGV0IGRyYXdJbmRleCA9IGkzMih2ZXJ0ZXhJbnB1dHMuaW5zdGFuY2VJbmRleCk7XG4gIGlmIChkcmF3SW5kZXggPj0gdW5pZm9ybXMudVNoYWRvVmlzaWJsZUNvdW50KSB7XG4gICAgdmVydGV4T3V0cHV0cy5wb3NpdGlvbiA9IHZlYzRmKDIuMCwgMi4wLCAyLjAsIDEuMCk7XG4gICAgcmV0dXJuIHZlcnRleE91dHB1dHM7XG4gIH1cblxuICBsZXQgc291cmNlSW5kZXggPSBpMzIodVNoYWRvVmlzaWJsZUluZGljZXNbZHJhd0luZGV4XSk7XG4gIGxldCBhY3RvciA9IFJlcXVpZW1FbnRpdHlDb250YWluZXJfaW5zdGFuY2VzX2dldChzb3VyY2VJbmRleCk7XG4gIGxldCBpbmZsdWVuY2UgPSByZXF1aWVtVmF0SW5mbHVlbmNlKGFjdG9yLmFuaW1hdGlvbkJ1ZmZlciwgaW5wdXQpO1xuICB2ZXJ0ZXhPdXRwdXRzLnZVViA9IHZlcnRleElucHV0cy51djtcbiAgbGV0IHN1Ym1lc2hJbmRleCA9IGkzMih2ZXJ0ZXhJbnB1dHMuc3VibWVzaERhdGEueSArIDAuNSk7XG4gIGxldCBmbGF0SW5kZXggPSBzdWJtZXNoSW5kZXggKyBzb3VyY2VJbmRleCAqIHVuaWZvcm1zLnVTdWJtZXNoQ291bnQ7XG4gIGxldCB0ZXh0dXJlQXR0cmlidXRlcyA9IFJlcXVpZW1FbnRpdHlDb250YWluZXJfYXBwZWFyYW5jZV9nZXQoZmxhdEluZGV4KTtcbiAgdmVydGV4T3V0cHV0cy52VGludCA9IHRleHR1cmVBdHRyaWJ1dGVzLnl6dztcbiAgdmVydGV4T3V0cHV0cy52U2xpY2UgPSBpMzIodGV4dHVyZUF0dHJpYnV0ZXMueCk7XG4gIHZlcnRleE91dHB1dHMudkF0bGFzSW5kZXggPSBpMzIodmVydGV4SW5wdXRzLnN1Ym1lc2hEYXRhLngpO1xuXG4gIGlmICh2ZXJ0ZXhPdXRwdXRzLnZTbGljZSA9PSAtMSkge1xuICAgIHZlcnRleE91dHB1dHMucG9zaXRpb24gPSB2ZWM0ZigwLjApO1xuICAgIHJldHVybiB2ZXJ0ZXhPdXRwdXRzO1xuICB9XG4gIGxldCBza2lubmVkID0gKGluZmx1ZW5jZSAqIHZlYzRmKHZlcnRleElucHV0cy5wb3NpdGlvbiwgMS4wKSkueHl6O1xuICBsZXQgc2NhbGVkID0gc2tpbm5lZCAqIGFjdG9yLnRyYW5zbGF0aW9uLnc7XG4gIGxldCB3b3JsZFBvc2l0aW9uID0gcmVxdWllbVJvdGF0ZShhY3Rvci5yb3RhdGlvbiwgc2NhbGVkKSArIGFjdG9yLnRyYW5zbGF0aW9uLnh5ejtcbiAgdmVydGV4T3V0cHV0cy5wb3NpdGlvbiA9IHVuaWZvcm1zLndvcmxkVmlld1Byb2plY3Rpb24gKiB2ZWM0Zih3b3JsZFBvc2l0aW9uLCAxLjApO1xufVxuYDtcblxuY29uc3QgRlNfV0dTTCA9IGBcbmZsYXQgdmFyeWluZyB2U2xpY2U6IGkzMjtcbmZsYXQgdmFyeWluZyB2QXRsYXNJbmRleDogaTMyO1xudmFyeWluZyB2VVY6IHZlYzJmO1xudmFyeWluZyB2VGludDogdmVjM2Y7XG52YXIgdUF0bGFzQXJyYXlTYW1wbGVyOiBzYW1wbGVyO1xudmFyIHVBdGxhc0FycmF5OiB0ZXh0dXJlXzJkX2FycmF5PGYzMj47XG52YXIgdUNsb2FrQXRsYXNBcnJheVNhbXBsZXI6IHNhbXBsZXI7XG52YXIgdUNsb2FrQXRsYXNBcnJheTogdGV4dHVyZV8yZF9hcnJheTxmMzI+O1xudmFyIHVIZWxtQXRsYXNBcnJheVNhbXBsZXI6IHNhbXBsZXI7XG52YXIgdUhlbG1BdGxhc0FycmF5OiB0ZXh0dXJlXzJkX2FycmF5PGYzMj47XG5cbkBmcmFnbWVudFxuZm4gbWFpbihpbnB1dDogRnJhZ21lbnRJbnB1dHMpIC0+IEZyYWdtZW50T3V0cHV0cyB7XG4gIGxldCBzbGljZSA9IGZyYWdtZW50SW5wdXRzLnZTbGljZTtcbiAgbGV0IGMwID0gdGV4dHVyZVNhbXBsZUxldmVsKHVBdGxhc0FycmF5LCB1QXRsYXNBcnJheVNhbXBsZXIsIGZyYWdtZW50SW5wdXRzLnZVViwgc2xpY2UsIDAuMCk7XG4gIGxldCBjMSA9IHRleHR1cmVTYW1wbGVMZXZlbChcbiAgICB1Q2xvYWtBdGxhc0FycmF5LFxuICAgIHVDbG9ha0F0bGFzQXJyYXlTYW1wbGVyLFxuICAgIGZyYWdtZW50SW5wdXRzLnZVVixcbiAgICBzbGljZSxcbiAgICAwLjBcbiAgKTtcbiAgbGV0IGMyID0gdGV4dHVyZVNhbXBsZUxldmVsKFxuICAgIHVIZWxtQXRsYXNBcnJheSxcbiAgICB1SGVsbUF0bGFzQXJyYXlTYW1wbGVyLFxuICAgIGZyYWdtZW50SW5wdXRzLnZVVixcbiAgICBzbGljZSxcbiAgICAwLjBcbiAgKTtcbiAgbGV0IG0wID0gc2VsZWN0KDAuMCwgMS4wLCBmcmFnbWVudElucHV0cy52QXRsYXNJbmRleCA9PSAwKTtcbiAgbGV0IG0xID0gc2VsZWN0KDAuMCwgMS4wLCBmcmFnbWVudElucHV0cy52QXRsYXNJbmRleCA9PSAxKTtcbiAgbGV0IG0yID0gc2VsZWN0KDAuMCwgMS4wLCBmcmFnbWVudElucHV0cy52QXRsYXNJbmRleCA9PSAyKTtcbiAgbGV0IGJhc2UgPSBjMCAqIG0wICsgYzEgKiBtMSArIGMyICogbTI7XG4gIGZyYWdtZW50T3V0cHV0cy5jb2xvciA9IHZlYzRmKGJhc2UucmdiICogZnJhZ21lbnRJbnB1dHMudlRpbnQsIDEuMCk7XG59XG5gO1xuXG5jb25zdCBQSUNLX1ZTX1dHU0wgPSBgXG5hdHRyaWJ1dGUgcG9zaXRpb246IHZlYzNmO1xuYXR0cmlidXRlIGluc3RhbmNlTWVzaElEOiBmMzI7XG5mbGF0IHZhcnlpbmcgdk1lc2hJRDogZjMyO1xudW5pZm9ybSB2aWV3UHJvamVjdGlvbjogbWF0NHg0ZjtcbnZhciB1U2hhZG9WaXNpYmlsaXR5RmxhZ3M6IHRleHR1cmVfMmQ8ZjMyPjtcblxuI2luY2x1ZGU8UmVxdWllbUVudGl0eUFjdG9yPlxuI2luY2x1ZGU8UmVxdWllbUVudGl0eUNvbnRhaW5lclN0b3JhZ2U+XG4ke1dHU0xfVkFUX0RFQ0xBUkFUSU9OU31cblxuZm4gcmVxdWllbVBpY2tpbmdBY3RvclZpc2libGUoaW5kZXg6IGkzMikgLT4gYm9vbCB7XG4gIGxldCBzaXplID0gdGV4dHVyZURpbWVuc2lvbnModVNoYWRvVmlzaWJpbGl0eUZsYWdzLCAwKTtcbiAgcmV0dXJuIHRleHR1cmVMb2FkKFxuICAgIHVTaGFkb1Zpc2liaWxpdHlGbGFncyxcbiAgICB2ZWMyaShpbmRleCAlIGkzMihzaXplLngpLCBpbmRleCAvIGkzMihzaXplLngpKSxcbiAgICAwXG4gICkuciA+IDAuNTtcbn1cblxuQHZlcnRleFxuZm4gbWFpbihpbnB1dDogVmVydGV4SW5wdXRzKSAtPiBGcmFnbWVudElucHV0cyB7XG4gIGxldCBzb3VyY2VJbmRleCA9IGkzMih2ZXJ0ZXhJbnB1dHMuaW5zdGFuY2VJbmRleCk7XG4gIGlmICghcmVxdWllbVBpY2tpbmdBY3RvclZpc2libGUoc291cmNlSW5kZXgpKSB7XG4gICAgdmVydGV4T3V0cHV0cy5wb3NpdGlvbiA9IHZlYzRmKDIuMCwgMi4wLCAyLjAsIDEuMCk7XG4gICAgcmV0dXJuIHZlcnRleE91dHB1dHM7XG4gIH1cbiAgbGV0IGFjdG9yID0gUmVxdWllbUVudGl0eUNvbnRhaW5lcl9pbnN0YW5jZXNfZ2V0KHNvdXJjZUluZGV4KTtcbiAgdmVydGV4T3V0cHV0cy52TWVzaElEID0gdmVydGV4SW5wdXRzLmluc3RhbmNlTWVzaElEO1xuICBsZXQgaW5mbHVlbmNlID0gcmVxdWllbVZhdEluZmx1ZW5jZShhY3Rvci5hbmltYXRpb25CdWZmZXIsIGlucHV0KTtcbiAgbGV0IHNraW5uZWQgPSAoaW5mbHVlbmNlICogdmVjNGYodmVydGV4SW5wdXRzLnBvc2l0aW9uLCAxLjApKS54eXo7XG4gIGxldCB3b3JsZFBvc2l0aW9uID1cbiAgICByZXF1aWVtUm90YXRlKGFjdG9yLnJvdGF0aW9uLCBza2lubmVkICogYWN0b3IudHJhbnNsYXRpb24udykgK1xuICAgIGFjdG9yLnRyYW5zbGF0aW9uLnh5ejtcbiAgdmVydGV4T3V0cHV0cy5wb3NpdGlvbiA9IHVuaWZvcm1zLnZpZXdQcm9qZWN0aW9uICogdmVjNGYod29ybGRQb3NpdGlvbiwgMS4wKTtcbn1cbmA7XG5cbmNvbnN0IFBJQ0tfRlNfV0dTTCA9IGBcbmZsYXQgdmFyeWluZyB2TWVzaElEOiBmMzI7XG5cbkBmcmFnbWVudFxuZm4gbWFpbihpbnB1dDogRnJhZ21lbnRJbnB1dHMpIC0+IEZyYWdtZW50T3V0cHV0cyB7XG4gIGxldCBpZCA9IGZsb29yKGZyYWdtZW50SW5wdXRzLnZNZXNoSUQgKyAwLjUpO1xuICBsZXQgZW5jb2RlZCA9IHZlYzNmKFxuICAgIGZsb29yKChpZCAlIDE2Nzc3MjE2LjApIC8gNjU1MzYuMCksXG4gICAgZmxvb3IoKGlkICUgNjU1MzYuMCkgLyAyNTYuMCksXG4gICAgaWQgJSAyNTYuMFxuICApIC8gMjU1LjA7XG4gIGZyYWdtZW50T3V0cHV0cy5jb2xvciA9IHZlYzRmKGVuY29kZWQsIDEuMCk7XG59XG5gO1xuXG5CQUJZTE9OLkVmZmVjdC5TaGFkZXJzU3RvcmVbXCJ2YXRWZXJ0ZXhTaGFkZXJcIl0gPSBWU19HTDtcbkJBQllMT04uRWZmZWN0LlNoYWRlcnNTdG9yZVtcInZhdEZyYWdtZW50U2hhZGVyXCJdID0gRlNfR0w7XG5CQUJZTE9OLkVmZmVjdC5TaGFkZXJzU3RvcmVbXCJ2YXRQaWNraW5nVmVydGV4U2hhZGVyXCJdID0gUElDS19WU19HTDtcbkJBQllMT04uRWZmZWN0LlNoYWRlcnNTdG9yZVtcInZhdFBpY2tpbmdGcmFnbWVudFNoYWRlclwiXSA9IFBJQ0tfRlNfR0w7XG5CQUJZTE9OLlNoYWRlclN0b3JlLlNoYWRlcnNTdG9yZVdHU0xbXCJ2YXRWZXJ0ZXhTaGFkZXJcIl0gPSBWU19XR1NMO1xuQkFCWUxPTi5TaGFkZXJTdG9yZS5TaGFkZXJzU3RvcmVXR1NMW1widmF0RnJhZ21lbnRTaGFkZXJcIl0gPSBGU19XR1NMO1xuQkFCWUxPTi5TaGFkZXJTdG9yZS5TaGFkZXJzU3RvcmVXR1NMW1widmF0UGlja2luZ1ZlcnRleFNoYWRlclwiXSA9IFBJQ0tfVlNfV0dTTDtcbkJBQllMT04uU2hhZGVyU3RvcmUuU2hhZGVyc1N0b3JlV0dTTFtcInZhdFBpY2tpbmdGcmFnbWVudFNoYWRlclwiXSA9IFBJQ0tfRlNfV0dTTDtcblxuLy8gU2hhZGVyTWF0ZXJpYWwgYXBwZW5kcyB0aGUgYWN0aXZlIHNrZWxldG9uJ3MgbWF0cmljZXNJbmRpY2VzL1dlaWdodHMgc3RyZWFtc1xuLy8gaW4gaXNSZWFkeSgpLiBMaXN0aW5nIHRoZW0gaGVyZSBhcyB3ZWxsIHByb2R1Y2VzIGR1cGxpY2F0ZSBXZWJHUFUgdmVydGV4XG4vLyBkZXNjcmlwdG9ycyBmb3IgdGhlIHNhbWUgZ2VuZXJhdGVkIHNoYWRlciBsb2NhdGlvbnMuXG5jb25zdCBWQVRfQVRUUklCVVRFUyA9IFtcInBvc2l0aW9uXCIsIFwidXZcIiwgXCJzdWJtZXNoRGF0YVwiXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZBVFNoYWRlck1hdGVyaWFsKFxuICBzY2VuZTogQkpTLlNjZW5lLFxuICBzaGFkb1Bvb2w6IFNoYWRvRW50aXR5UG9vbCxcbiAgbW9kZWw6IHN0cmluZyxcbik6IEJKUy5TaGFkZXJNYXRlcmlhbCB7XG4gIHNoYWRvUG9vbC5jb21taXQoKTtcbiAgY29uc3QgdXNlU3RvcmFnZVdHU0wgPVxuICAgIHNjZW5lLmdldEVuZ2luZSgpLmlzV2ViR1BVICYmXG4gICAgKFJlcXVpZW1FbnRpdHlDb250YWluZXIgYXMgYW55KS5iYWNraW5nUHJlZmVyZW5jZSA9PT0gXCJzdG9yYWdlXCI7XG4gIGNvbnN0IHNoYWRvSW8gPSBSZXF1aWVtRW50aXR5Q29udGFpbmVyLnNoYWRlcklPKHNjZW5lLmdldEVuZ2luZSgpKTtcbiAgY29uc3Qgc2hhZGVyTWF0ID0gbmV3IEJBQllMT04uU2hhZGVyTWF0ZXJpYWwoXG4gICAgYHZhdFNoYWRlcl8ke21vZGVsfWAsXG4gICAgc2NlbmUsXG4gICAge1xuICAgICAgdmVydGV4OiBcInZhdFwiLFxuICAgICAgZnJhZ21lbnQ6IFwidmF0XCIsXG4gICAgfSxcbiAgICB7XG4gICAgICBhdHRyaWJ1dGVzOiBWQVRfQVRUUklCVVRFUyxcbiAgICAgIHVuaWZvcm1zOiBbXG4gICAgICAgIFwid29ybGRWaWV3UHJvamVjdGlvblwiLFxuICAgICAgICBcInVTdWJtZXNoQ291bnRcIixcbiAgICAgICAgXCJ1SW5zdGFuY2VDb3VudFwiLFxuICAgICAgICBcInVTaGFkb1Zpc2libGVDb3VudFwiLFxuICAgICAgICBcImJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZVNpemVJbnZlcnRlZFwiLFxuICAgICAgICBcImJha2VkVmVydGV4QW5pbWF0aW9uVGltZVwiLFxuICAgICAgICAuLi4odXNlU3RvcmFnZVdHU0xcbiAgICAgICAgICA/IFtdXG4gICAgICAgICAgOiBbXCJ1U2hhZG9WaXNpYmxlSW5kZXhUZXhXaWR0aFwiLCAuLi5zaGFkb0lvLnVuaWZvcm1zXSksXG4gICAgICBdLFxuICAgICAgLy8gdW5pZm9ybUJ1ZmZlcnM6IFsnVGVzdFN0cnVjdEJsb2NrJ10sXG4gICAgICBzYW1wbGVyczogW1xuICAgICAgICBcInVBdGxhc0FycmF5XCIsXG4gICAgICAgIFwidUNsb2FrQXRsYXNBcnJheVwiLFxuICAgICAgICBcInVIZWxtQXRsYXNBcnJheVwiLFxuICAgICAgICBcImJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZVwiLFxuICAgICAgICAuLi4odXNlU3RvcmFnZVdHU0xcbiAgICAgICAgICA/IFtdXG4gICAgICAgICAgOiBbXCJ1U2hhZG9WaXNpYmxlSW5kaWNlc1wiLCAuLi5zaGFkb0lvLnNhbXBsZXJzXSksXG4gICAgICBdLFxuICAgICAgZGVmaW5lczogW1xuICAgICAgICBcIklOU1RBTkNFU1wiLFxuICAgICAgICBcIlRISU5fSU5TVEFOQ0VTXCIsXG4gICAgICAgIFwiQkFLRURfVkVSVEVYX0FOSU1BVElPTl9URVhUVVJFXCIsXG4gICAgICAgIC4uLigoc2NlbmUuZ2V0RW5naW5lKCkgYXMgQkpTLlRoaW5FbmdpbmUpLmRpc2FibGVVbmlmb3JtQnVmZmVyc1xuICAgICAgICAgID8gW1wiRElTQUJMRV9VTklGT1JNX0JVRkZFUlNcIl1cbiAgICAgICAgICA6IFtdKSxcbiAgICAgIF0sXG4gICAgICBuZWVkQWxwaGFCbGVuZGluZzogZmFsc2UsXG4gICAgICBuZWVkQWxwaGFUZXN0aW5nOiBmYWxzZSxcbiAgICAgIHNoYWRlckxhbmd1YWdlOiB1c2VTdG9yYWdlV0dTTFxuICAgICAgICA/IEJBQllMT04uU2hhZGVyTGFuZ3VhZ2UuV0dTTFxuICAgICAgICA6IEJBQllMT04uU2hhZGVyTGFuZ3VhZ2UuR0xTTCxcbiAgICB9LFxuICAgIHRydWUsXG4gICk7XG4gIC8vIFdlYkdQVSBlc3RhYmxpc2hlcyB0aGUgYmluZCBncm91cCBiZWZvcmUgb25CaW5kLiBTZWVkIHRoaXMgcG9vbCdzIFNoYWRvXG4gIC8vIHJlc291cmNlIG9uY2U7IHN1YnNlcXVlbnQgZHJhd3Mgb25seSB1cGRhdGUgdGhlIGFscmVhZHktY3JlYXRlZCBlZmZlY3QuXG4gIHNoYWRvUG9vbC5zaGFkby5iaW5kTWF0ZXJpYWwoc2hhZGVyTWF0KTtcbiAgc2hhZGVyTWF0Lm9uQmluZCA9IChtZXNoKSA9PiB7XG4gICAgY29uc3QgZWZmZWN0ID0gc2hhZGVyTWF0LmdldEVmZmVjdCgpITtcbiAgICBjb25zdCBtZXRhZGF0YSA9IG1lc2gubWV0YWRhdGEgYXMgRW50aXR5TWVzaE1ldGFkYXRhO1xuXG4gICAgaWYgKCFtZXRhZGF0YSkge1xuICAgICAgY29uc29sZS53YXJuKFwiRW50aXR5IG1lc2ggbWV0YWRhdGEgaXMgbWlzc2luZ1wiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCB7XG4gICAgICBzdWJtZXNoQ291bnQsXG4gICAgICBhdGxhc0FycmF5VGV4dHVyZSxcbiAgICAgIGNsb2FrQXRsYXNBcnJheVRleHR1cmUsXG4gICAgICBoZWxtQXRsYXNBcnJheVRleHR1cmUsXG4gICAgICB2YXRUZXh0dXJlLFxuICAgIH0gPSBtZXRhZGF0YTtcbiAgICBtZXRhZGF0YS5zaGFkb1Bvb2wuY29tbWl0KCk7XG4gICAgbWV0YWRhdGEuc2hhZG9Qb29sLnNoYWRvLmJpbmQoZWZmZWN0KTtcbiAgICBjb25zdCB2aXNpYmxlQ291bnQgPSBtZXRhZGF0YS5zaGFkb1Bvb2wuc2hhZG8uZ2V0VmlzaWJsZUNvdW50KCk7XG4gICAgKG1lc2ggYXMgQkpTLk1lc2gpLmZvcmNlZEluc3RhbmNlQ291bnQgPSB2aXNpYmxlQ291bnQ7XG5cbiAgICBjb25zdCB0bWdyID0gbWVzaC5iYWtlZFZlcnRleEFuaW1hdGlvbk1hbmFnZXI7XG4gICAgaWYgKGF0bGFzQXJyYXlUZXh0dXJlKSB7XG4gICAgICBlZmZlY3Quc2V0VGV4dHVyZShcInVBdGxhc0FycmF5XCIsIGF0bGFzQXJyYXlUZXh0dXJlKTtcbiAgICB9XG4gICAgaWYgKGNsb2FrQXRsYXNBcnJheVRleHR1cmUpIHtcbiAgICAgIGVmZmVjdC5zZXRUZXh0dXJlKFwidUNsb2FrQXRsYXNBcnJheVwiLCBjbG9ha0F0bGFzQXJyYXlUZXh0dXJlKTtcbiAgICB9XG4gICAgaWYgKGhlbG1BdGxhc0FycmF5VGV4dHVyZSkge1xuICAgICAgZWZmZWN0LnNldFRleHR1cmUoXCJ1SGVsbUF0bGFzQXJyYXlcIiwgaGVsbUF0bGFzQXJyYXlUZXh0dXJlKTtcbiAgICB9XG4gICAgZWZmZWN0LnNldEludChcInVTdWJtZXNoQ291bnRcIiwgc3VibWVzaENvdW50KTtcbiAgICBlZmZlY3Quc2V0SW50KFwidUluc3RhbmNlQ291bnRcIiwgKG1lc2ggYXMgQkpTLk1lc2gpLnRoaW5JbnN0YW5jZUNvdW50KTtcbiAgICBlZmZlY3Quc2V0SW50KFwidVNoYWRvVmlzaWJsZUNvdW50XCIsIHZpc2libGVDb3VudCk7XG5cbiAgICBpZiAodmF0VGV4dHVyZSkge1xuICAgICAgZWZmZWN0LnNldFZlY3RvcjIoXG4gICAgICAgIFwiYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlU2l6ZUludmVydGVkXCIsXG4gICAgICAgIG1ldGFkYXRhLnZhdFRleHR1cmVTaXplSW52ZXJ0ZWQsXG4gICAgICApO1xuICAgICAgZWZmZWN0LnNldFRleHR1cmUoXCJiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmVcIiwgdmF0VGV4dHVyZSk7XG4gICAgICBlZmZlY3Quc2V0RmxvYXQoXCJiYWtlZFZlcnRleEFuaW1hdGlvblRpbWVcIiwgdG1nciA/IHRtZ3IudGltZSA6IDApO1xuICAgIH1cbiAgfTtcblxuICBzaGFkZXJNYXQub25FcnJvciA9IChlZmZlY3QsIGVycm9ycykgPT4ge1xuICAgIGlmIChlcnJvcnMpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiVmVydGV4IFNoYWRlciBTb3VyY2U6XCIsIGVmZmVjdC5fdmVydGV4U291cmNlQ29kZSk7XG4gICAgICBjb25zb2xlLmxvZyhcIkZyYWdtZW50IFNoYWRlciBTb3VyY2U6XCIsIGVmZmVjdC5fZnJhZ21lbnRTb3VyY2VDb2RlKTtcbiAgICAgIGNvbnNvbGUubG9nKFwiU2hhZGVyIGNvbXBpbGF0aW9uIGVycm9yczpcIiwgZXJyb3JzKTtcbiAgICB9XG4gIH07XG5cbiAgLy8gc2hhZGVyTWF0LmJhY2tGYWNlQ3VsbGluZyA9IGZhbHNlO1xuICByZXR1cm4gc2hhZGVyTWF0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVkFUUGlja2luZ01hdGVyaWFsKFxuICBzY2VuZTogQkpTLlNjZW5lLFxuICBzaGFkb1Bvb2w6IFNoYWRvRW50aXR5UG9vbCxcbiAgbW9kZWw6IHN0cmluZyxcbik6IEJKUy5TaGFkZXJNYXRlcmlhbCB7XG4gIHNoYWRvUG9vbC5jb21taXQoKTtcbiAgY29uc3QgdXNlU3RvcmFnZVdHU0wgPVxuICAgIHNjZW5lLmdldEVuZ2luZSgpLmlzV2ViR1BVICYmXG4gICAgKFJlcXVpZW1FbnRpdHlDb250YWluZXIgYXMgYW55KS5iYWNraW5nUHJlZmVyZW5jZSA9PT0gXCJzdG9yYWdlXCI7XG4gIGNvbnN0IHNoYWRvSW8gPSBSZXF1aWVtRW50aXR5Q29udGFpbmVyLnNoYWRlcklPKHNjZW5lLmdldEVuZ2luZSgpKTtcbiAgY29uc3QgbWF0ZXJpYWwgPSBuZXcgQkFCWUxPTi5TaGFkZXJNYXRlcmlhbChcbiAgICBgdmF0UGlja2luZ1NoYWRlcl8ke21vZGVsfWAsXG4gICAgc2NlbmUsXG4gICAgeyB2ZXJ0ZXg6IFwidmF0UGlja2luZ1wiLCBmcmFnbWVudDogXCJ2YXRQaWNraW5nXCIgfSxcbiAgICB7XG4gICAgICBhdHRyaWJ1dGVzOiBbLi4uVkFUX0FUVFJJQlVURVMsIFwiaW5zdGFuY2VNZXNoSURcIl0sXG4gICAgICB1bmlmb3JtczogW1xuICAgICAgICBcInZpZXdQcm9qZWN0aW9uXCIsXG4gICAgICAgIFwiYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlU2l6ZUludmVydGVkXCIsXG4gICAgICAgIFwiYmFrZWRWZXJ0ZXhBbmltYXRpb25UaW1lXCIsXG4gICAgICAgIC4uLih1c2VTdG9yYWdlV0dTTFxuICAgICAgICAgID8gW11cbiAgICAgICAgICA6IFtcInVTaGFkb1Zpc2libGVJbmRleFRleFdpZHRoXCIsIC4uLnNoYWRvSW8udW5pZm9ybXNdKSxcbiAgICAgIF0sXG4gICAgICBzYW1wbGVyczogW1xuICAgICAgICBcImJha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZVwiLFxuICAgICAgICBcInVTaGFkb1Zpc2liaWxpdHlGbGFnc1wiLFxuICAgICAgICAuLi4odXNlU3RvcmFnZVdHU0wgPyBbXSA6IHNoYWRvSW8uc2FtcGxlcnMpLFxuICAgICAgXSxcbiAgICAgIGRlZmluZXM6IFtcbiAgICAgICAgXCJJTlNUQU5DRVNcIixcbiAgICAgICAgXCJUSElOX0lOU1RBTkNFU1wiLFxuICAgICAgICBcIkJBS0VEX1ZFUlRFWF9BTklNQVRJT05fVEVYVFVSRVwiLFxuICAgICAgICAuLi4oKHNjZW5lLmdldEVuZ2luZSgpIGFzIEJKUy5UaGluRW5naW5lKS5kaXNhYmxlVW5pZm9ybUJ1ZmZlcnNcbiAgICAgICAgICA/IFtcIkRJU0FCTEVfVU5JRk9STV9CVUZGRVJTXCJdXG4gICAgICAgICAgOiBbXSksXG4gICAgICBdLFxuICAgICAgc2hhZGVyTGFuZ3VhZ2U6IHVzZVN0b3JhZ2VXR1NMXG4gICAgICAgID8gQkFCWUxPTi5TaGFkZXJMYW5ndWFnZS5XR1NMXG4gICAgICAgIDogQkFCWUxPTi5TaGFkZXJMYW5ndWFnZS5HTFNMLFxuICAgIH0sXG4gICAgdHJ1ZSxcbiAgKTtcbiAgc2hhZG9Qb29sLnNoYWRvLmJpbmRNYXRlcmlhbChtYXRlcmlhbCk7XG4gIG1hdGVyaWFsLm9uQmluZCA9IChtZXNoKSA9PiB7XG4gICAgY29uc3QgbWV0YWRhdGEgPSBtZXNoLm1ldGFkYXRhIGFzIEVudGl0eU1lc2hNZXRhZGF0YTtcbiAgICBpZiAoIW1ldGFkYXRhPy52YXRUZXh0dXJlKSByZXR1cm47XG4gICAgbWV0YWRhdGEuc2hhZG9Qb29sLmNvbW1pdCgpO1xuICAgIGNvbnN0IGVmZmVjdCA9IG1hdGVyaWFsLmdldEVmZmVjdCgpO1xuICAgIG1ldGFkYXRhLnNoYWRvUG9vbC5zaGFkby5iaW5kKGVmZmVjdCk7XG4gICAgKG1lc2ggYXMgQkpTLk1lc2gpLmZvcmNlZEluc3RhbmNlQ291bnQgPSAoXG4gICAgICBtZXNoIGFzIEJKUy5NZXNoXG4gICAgKS50aGluSW5zdGFuY2VDb3VudDtcbiAgICBlZmZlY3Quc2V0VmVjdG9yMihcbiAgICAgIFwiYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlU2l6ZUludmVydGVkXCIsXG4gICAgICBtZXRhZGF0YS52YXRUZXh0dXJlU2l6ZUludmVydGVkLFxuICAgICk7XG4gICAgZWZmZWN0LnNldFRleHR1cmUoXCJiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmVcIiwgbWV0YWRhdGEudmF0VGV4dHVyZSk7XG4gICAgZWZmZWN0LnNldEZsb2F0KFxuICAgICAgXCJiYWtlZFZlcnRleEFuaW1hdGlvblRpbWVcIixcbiAgICAgIG1lc2guYmFrZWRWZXJ0ZXhBbmltYXRpb25NYW5hZ2VyPy50aW1lID8/IDAsXG4gICAgKTtcbiAgfTtcbiAgcmV0dXJuIG1hdGVyaWFsO1xufVxuIl19