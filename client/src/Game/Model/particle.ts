import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';

// 1) Define your VAT‐aware particle shaders
BABYLON.Effect.ShadersStore['vatParticleVertexShader'] = `
    precision highp float;

    // Built-ins for CPU ParticleSystem or for GPUParticleSystem draw pass:
    #ifdef INSTANCES
      attribute vec4 offset;        // per-particle emitted offset
    #else
      attribute vec3 position;      // for CPU PS
      attribute vec2 angle;         // for CPU PS
    #endif
    attribute vec4 color;           // tint
    varying vec4 vColor;

    // VAT macros & uniforms
    #include<bakedVertexAnimationDeclaration>
    uniform sampler2D   bakedVertexAnimationTexture;
    uniform vec2        bakedVertexAnimationTextureSizeInverted;
    uniform float       bakedVertexAnimationTime;
    attribute vec4      particleVATSettings; // x=from,y=to,z=offsetTime,w=fps

    uniform mat4 view;
    uniform mat4 projection;

    void main() {
      vColor = color;

      // sample VAT once for this particle group
      vec3 vatOff = bakedVertexAnimation(
        particleVATSettings.x,
        particleVATSettings.y,
        bakedVertexAnimationTime - particleVATSettings.z,
        bakedVertexAnimationTextureSizeInverted
      ).xyz;

      // compute billboarding + base offset + VAT translation:
      #ifdef INSTANCES
        vec3 worldPos = vec3(offset.xyz) + vatOff;
        gl_Position = projection * view * vec4(worldPos, 1.0);
      #else
        // CPU path (optional)
        gl_Position = projection * view * (vec4(position,1.0) + vec4(vatOff,0.0));
      #endif
    }
`;

BABYLON.Effect.ShadersStore['vatParticleFragmentShader'] = `
    precision highp float;
    varying vec4 vColor;
    uniform sampler2D textureSampler;
    void main() {
      gl_FragColor = texture2D(textureSampler, gl_PointCoord) * vColor;
    }
`;

export const createVATParticleSystem = (
  name: string,
  scene: BJS.Scene,
  manager: BJS.BakedVertexAnimationManager,
  capacity: number,
): ([BJS.GPUParticleSystem, BJS.Observer<BJS.Scene>]) => {
  const { Vector3, GPUParticleSystem, Texture, Color4, BoxParticleEmitter } = BABYLON;

  const particleSystem = new BABYLON.GPUParticleSystem(name, { capacity }, scene);
  particleSystem.particleTexture = new Texture('textures/flare.png', scene);

  const defines: string[] = [];
  particleSystem.fillDefines(defines, particleSystem.blendMode);

  // 2) Build an Effect for your ParticleSystem instance:
  const uniforms = [
    'view',
    'projection',
    'bakedVertexAnimationTexture',
    'bakedVertexAnimationTextureSizeInverted',
    'bakedVertexAnimationTime',
  ];
  const samplers = ['textureSampler', 'bakedVertexAnimationTexture'];
  const engine = scene.getEngine();
  const customEff = engine.createEffectForParticles(
    'vatParticle', // picks vatParticleVertex/Fragment
    uniforms,
    samplers,
    defines.join('\n'),
    undefined, undefined, undefined,
    particleSystem, // wires in INSTANCES and color/offset attrs
  );

  particleSystem.setCustomEffect(customEff, particleSystem.blendMode);

  const obs = scene.onBeforeRenderObservable.add(() => {
    if (!manager || !manager.texture) {
      return;
    }
    const eff = customEff;
    eff.setTexture('bakedVertexAnimationTexture', manager.texture);
    const sz = manager.texture.getSize();
    eff.setVector2('bakedVertexAnimationTextureSizeInverted',
      new BABYLON.Vector2(1 / sz.width, 1 / sz.height));
    eff.setFloat('bakedVertexAnimationTime', manager.time);
  });
  
  return [particleSystem, obs];
};
