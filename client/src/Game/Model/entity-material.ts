import * as BABYLON from "@babylonjs/core";
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

    void main() {
        int instIdx = gl_InstanceID;
        RequiemEntityActorHeader actor = RequiemEntityContainer_instances_get(instIdx);
        if (actor.visibleFlag == 0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
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
        int flatIndex = subIdx + instIdx * uSubmeshCount;
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
        int instIdx = gl_InstanceID;
        RequiemEntityActorHeader actor = RequiemEntityContainer_instances_get(instIdx);
        vMeshID = instanceMeshID;
        if (actor.visibleFlag == 0) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }

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

BABYLON.Effect.ShadersStore["vatVertexShader"] = VS_GL;
BABYLON.Effect.ShadersStore["vatFragmentShader"] = FS_GL;
BABYLON.Effect.ShadersStore["vatPickingVertexShader"] = PICK_VS_GL;
BABYLON.Effect.ShadersStore["vatPickingFragmentShader"] = PICK_FS_GL;

const VAT_ATTRIBUTES = ["position", "uv", "submeshData"];

export function createVATShaderMaterial(
  scene: BJS.Scene,
  shadoPool: ShadoEntityPool,
  model: string,
): BJS.ShaderMaterial {
  shadoPool.commit();
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
        "bakedVertexAnimationTextureSizeInverted",
        "bakedVertexAnimationTime",
        ...shadoIo.uniforms,
      ],
      // uniformBuffers: ['TestStructBlock'],
      samplers: [
        "uAtlasArray",
        "uCloakAtlasArray",
        "uHelmAtlasArray",
        "bakedVertexAnimationTexture",
        ...shadoIo.samplers,
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
      // This material is currently authored in GLSL. Babylon translates it
      // through glslang when running on WebGPU.
      shaderLanguage: BABYLON.ShaderLanguage.GLSL,
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
        ...shadoIo.uniforms,
      ],
      samplers: ["bakedVertexAnimationTexture", ...shadoIo.samplers],
      defines: [
        "INSTANCES",
        "THIN_INSTANCES",
        "BAKED_VERTEX_ANIMATION_TEXTURE",
        ...((scene.getEngine() as BJS.ThinEngine).disableUniformBuffers
          ? ["DISABLE_UNIFORM_BUFFERS"]
          : []),
      ],
      shaderLanguage: BABYLON.ShaderLanguage.GLSL,
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
