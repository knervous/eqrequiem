import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { EntityMeshMetadata } from './entity-types';

const VS_GL = `
    precision highp float;

    // Attributes
    attribute vec3 position;
    attribute vec2 uv;
    attribute vec2 submeshData;
    attribute vec2 thinInstanceIndex;

    // Varyings → fragment
    flat varying int vSlice;
    flat varying int vAtlasIndex;
    varying vec2 vUV;
    varying vec3 vTint;

    // Uniforms
    uniform mat4 worldViewProjection;
    uniform int  uSubmeshCount;
    uniform int  uInstanceCount;
    uniform highp sampler2D uTextureAttributeData;

    // Babylon.js includes (will be transpiled under the hood)
    #define INSTANCES
    #define THIN_INSTANCES
    #define BAKED_VERTEX_ANIMATION_TEXTURE
    #include<instancesDeclaration>
    #include<bonesDeclaration>
    #include<bakedVertexAnimationDeclaration>

    void main() {
        // Instancing
        #include<instancesVertex>

        // Baked VAT
        #include<bakedVertexAnimation>

        // Pass through to fragment
        vUV = uv;
        int subIdx  = int(submeshData.y + 0.5);
        int instIdx = int(thinInstanceIndex.x + 0.5);
        int flatIndex = subIdx + instIdx * uSubmeshCount;
        float fIndex  = float(flatIndex);
        float total   = float(uSubmeshCount * uInstanceCount);

        vec2 uvAttrib = vec2((fIndex + 0.5) / total, 0.5);
        vec4 textureAttributes = texture(uTextureAttributeData, uvAttrib);
        
        vTint = textureAttributes.yzw;
        vSlice = int(textureAttributes.x);
        vAtlasIndex = int(submeshData.x);

        if (vSlice == -1) {
            gl_Position = vec4(0.0, 0.0, 0.0, 0.0); // Degenerate position (not rendered)
        } else {
            vec4 worldPos = finalWorld * vec4(position, 1.0);
            gl_Position = worldViewProjection * worldPos;
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
      float m0 = float(vAtlasIndex == 0);
      float m1 = float(vAtlasIndex == 1);
      float m2 = float(vAtlasIndex == 2);

      vec4 base = c0 * m0 + c1 * m1 + c2 * m2;
      gl_FragColor = vec4(base.rgb * vTint, 1.0);
    }
`;

BABYLON.Effect.ShadersStore['vatVertexShader'] = VS_GL;
BABYLON.Effect.ShadersStore['vatFragmentShader'] = FS_GL;

export function createVATShaderMaterial(scene: BJS.Scene): BJS.ShaderMaterial {
  const shaderMat =
    (scene.getMaterialByName('vatShader') as BJS.ShaderMaterial) ||
    new BABYLON.ShaderMaterial(
      'vatShader',
      scene,
      {
        vertex  : 'vat',
        fragment: 'vat',
      },
      {
        attributes: [
          'position',
          'uv',
          'textureAttributes',
          'bakedVertexAnimationSettingsInstanced',
          'submeshData',
          'thinInstanceIndex',
        ],
        uniforms: [
          'world',
          'worldView',
          'worldViewProjection',
          'view',
          'projection',
          'viewProjection',
          'uSubmeshCount',
          'uInstanceCount',
          'bakedVertexAnimationTextureSizeInverted',
          'bakedVertexAnimationTime',
        ],
        samplers: [
          'uAtlasArray',
          'uCloakAtlasArray',
          'uHelmAtlasArray',
          'uTextureAttributeData',
          'bakedVertexAnimationTexture',
        ],
        defines: [
          'INSTANCES',
          'THIN_INSTANCES',
          'BAKED_VERTEX_ANIMATION_TEXTURE',
        ],
        needAlphaBlending: false,
        needAlphaTesting : false,
      },
      true,
    );

  shaderMat.onBind = (mesh) => {
    const effect = shaderMat.getEffect()!;
    const metadata = mesh.metadata as EntityMeshMetadata;

    if (!metadata) {
      console.warn('Entity mesh metadata is missing');
      return;
    }
    const {
      submeshCount,
      atlasArrayTexture,
      cloakAtlasArrayTexture,
      helmAtlasArrayTexture,
      vatTexture,
      textureAttributeArray,
    } = metadata;

    const tmgr = mesh.bakedVertexAnimationManager;
    if (atlasArrayTexture) {
      effect.setTexture('uAtlasArray', atlasArrayTexture);
    }
    if (cloakAtlasArrayTexture) {
      effect.setTexture('uCloakAtlasArray', cloakAtlasArrayTexture);
    }
    if (helmAtlasArrayTexture) {
      effect.setTexture('uHelmAtlasArray', helmAtlasArrayTexture);
    }
    if (textureAttributeArray) {
      effect.setTexture('uTextureAttributeData', textureAttributeArray);
    }
    effect.setInt('uSubmeshCount', submeshCount);
    effect.setInt('uInstanceCount', (mesh as BJS.Mesh).thinInstanceCount);

    if (vatTexture) {
      const sz = vatTexture.getSize();
      shaderMat.setVector2(
        'bakedVertexAnimationTextureSizeInverted',
        new BABYLON.Vector2(1.0 / sz.width, 1.0 / sz.height),
      );
      effect.setTexture('bakedVertexAnimationTexture', vatTexture);
      effect.setFloat('bakedVertexAnimationTime', tmgr ? tmgr.time : 0);
    }
  };

  shaderMat.onError = (effect, errors) => {
    if (errors) {
      console.log('Vertex Shader Source:', effect._vertexSourceCode);
      console.log('Fragment Shader Source:', effect._fragmentSourceCode);
      console.log('Shader compilation errors:', errors);
    }
  };

  // shaderMat.backFaceCulling = false;
  return shaderMat;
}
