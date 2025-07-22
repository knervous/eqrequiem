import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';


const VS_GL = `
       precision highp float;

        // Attributes
        attribute vec3 position;
        attribute vec2 uv;
        attribute vec4 textureAttributes;

        // Varyings → fragment
        varying vec2 vUV;
        flat varying int vSlice;
        varying vec3 vTint;

        // Uniforms
        uniform mat4 worldViewProjection;

        // Babylon.js includes (will be transpiled under the hood)
        #define INSTANCES
        #define BAKED_VERTEX_ANIMATION_TEXTURE
        #include<instancesDeclaration>
        #include<bonesDeclaration>
        #include<bakedVertexAnimationDeclaration>

        void main() {
            // Instancing
            #include<instancesVertex>

            // Baked VAT
            #include<bakedVertexAnimation>

            vec4 worldPos = finalWorld * vec4(position, 1.0);
            gl_Position = worldViewProjection * worldPos;

            // Pass through to fragment
            vUV = uv;
            vTint = textureAttributes.yzw;
            vSlice = int(textureAttributes.x);
        }
    `;

const FS_GL = `
        precision highp float;

        // Varyings from vertex
        varying vec2 vUV;
        flat varying int vSlice;
        varying vec3 vTint;

        // On WebGPU, sampler2DArray is still bound as sampler2DArray in GLSL;
        // Babylon.js will transpile this to WGSL under the hood :contentReference[oaicite:2]{index=2}.
        uniform highp sampler2DArray uAtlasArray;

        void main() {
            int slice = vSlice;
            vec4 c = texture(uAtlasArray, vec3(vUV, float(slice)));
            gl_FragColor = vec4(c.rgb * vTint, 1.0);
        }
    `;

BABYLON.Effect.ShadersStore['vatVertexShader'] = VS_GL;
BABYLON.Effect.ShadersStore['vatFragmentShader'] = FS_GL;

export function createVATShaderMaterial(scene: BJS.Scene): BJS.ShaderMaterial {
  const shaderMat = scene.getMaterialByName('vatShader') as BJS.ShaderMaterial || new BABYLON.ShaderMaterial(
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
      ],
      uniforms         : ['worldViewProjection'],
      samplers         : ['uAtlasArray'],
      defines          : ['INSTANCES', 'BAKED_VERTEX_ANIMATION_TEXTURE'],
      needAlphaBlending: false,
      needAlphaTesting : false,
    },
    true,
  );

  shaderMat.onBind = (mesh) => {
    const effect = shaderMat.getEffect()!;
    const atlas = mesh.metadata?.atlasArrayTexture as BJS.BaseTexture;
    const vat = mesh.metadata?.vatTexture as BJS.BaseTexture;
    const tmgr = mesh.bakedVertexAnimationManager;
    if (atlas) {
      effect.setTexture('uAtlasArray', atlas);
    }
    if (vat) {
      const sz = vat.getSize();
      shaderMat.setVector2(
        'bakedVertexAnimationTextureSizeInverted',
        new BABYLON.Vector2(1.0 / sz.width, 1.0 / sz.height),
      );
      effect.setTexture('bakedVertexAnimationTexture', vat);
      effect.setFloat(
        'bakedVertexAnimationTime',
        tmgr ? tmgr.time : 0,
      );
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
