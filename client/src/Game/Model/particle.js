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
export const createVATParticleSystem = (name, scene, manager, capacity) => {
    const { Vector3, GPUParticleSystem, Texture, Color4, BoxParticleEmitter } = BABYLON;
    const particleSystem = new BABYLON.GPUParticleSystem(name, { capacity }, scene);
    particleSystem.particleTexture = new Texture('textures/flare.png', scene);
    const defines = [];
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
    const customEff = engine.createEffectForParticles('vatParticle', // picks vatParticleVertex/Fragment
    uniforms, samplers, defines.join('\n'), undefined, undefined, undefined, particleSystem);
    particleSystem.setCustomEffect(customEff, particleSystem.blendMode);
    const obs = scene.onBeforeRenderObservable.add(() => {
        if (!manager || !manager.texture) {
            return;
        }
        const eff = customEff;
        eff.setTexture('bakedVertexAnimationTexture', manager.texture);
        const sz = manager.texture.getSize();
        eff.setVector2('bakedVertexAnimationTextureSizeInverted', new BABYLON.Vector2(1 / sz.width, 1 / sz.height));
        eff.setFloat('bakedVertexAnimationTime', manager.time);
    });
    return [particleSystem, obs];
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFydGljbGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwYXJ0aWNsZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFDQSxPQUFPLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFFM0IsNENBQTRDO0FBQzVDLE9BQU8sQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFDLHlCQUF5QixDQUFDLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0EyQ3hELENBQUM7QUFFRixPQUFPLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQywyQkFBMkIsQ0FBQyxHQUFHOzs7Ozs7O0NBTzFELENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxDQUNyQyxJQUFZLEVBQ1osS0FBZ0IsRUFDaEIsT0FBd0MsRUFDeEMsUUFBZ0IsRUFDb0MsRUFBRTtJQUN0RCxNQUFNLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE9BQU8sRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFFcEYsTUFBTSxjQUFjLEdBQUcsSUFBSSxPQUFPLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEVBQUUsUUFBUSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDaEYsY0FBYyxDQUFDLGVBQWUsR0FBRyxJQUFJLE9BQU8sQ0FBQyxvQkFBb0IsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUUxRSxNQUFNLE9BQU8sR0FBYSxFQUFFLENBQUM7SUFDN0IsY0FBYyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRTlELHVEQUF1RDtJQUN2RCxNQUFNLFFBQVEsR0FBRztRQUNmLE1BQU07UUFDTixZQUFZO1FBQ1osNkJBQTZCO1FBQzdCLHlDQUF5QztRQUN6QywwQkFBMEI7S0FDM0IsQ0FBQztJQUNGLE1BQU0sUUFBUSxHQUFHLENBQUMsZ0JBQWdCLEVBQUUsNkJBQTZCLENBQUMsQ0FBQztJQUNuRSxNQUFNLE1BQU0sR0FBRyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7SUFDakMsTUFBTSxTQUFTLEdBQUcsTUFBTSxDQUFDLHdCQUF3QixDQUMvQyxhQUFhLEVBQUUsbUNBQW1DO0lBQ2xELFFBQVEsRUFDUixRQUFRLEVBQ1IsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFDbEIsU0FBUyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQy9CLGNBQWMsQ0FDZixDQUFDO0lBRUYsY0FBYyxDQUFDLGVBQWUsQ0FBQyxTQUFTLEVBQUUsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDO0lBRXBFLE1BQU0sR0FBRyxHQUFHLEtBQUssQ0FBQyx3QkFBd0IsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFO1FBQ2xELElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDakMsT0FBTztRQUNULENBQUM7UUFDRCxNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUM7UUFDdEIsR0FBRyxDQUFDLFVBQVUsQ0FBQyw2QkFBNkIsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDL0QsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNyQyxHQUFHLENBQUMsVUFBVSxDQUFDLHlDQUF5QyxFQUN0RCxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3BELEdBQUcsQ0FBQyxRQUFRLENBQUMsMEJBQTBCLEVBQUUsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pELENBQUMsQ0FBQyxDQUFDO0lBRUgsT0FBTyxDQUFDLGNBQWMsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUMvQixDQUFDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSAqIGFzIEJKUyBmcm9tICdAYmFieWxvbmpzL2NvcmUnO1xuaW1wb3J0IEJBQllMT04gZnJvbSAnQGJqcyc7XG5cbi8vIDEpIERlZmluZSB5b3VyIFZBVOKAkGF3YXJlIHBhcnRpY2xlIHNoYWRlcnNcbkJBQllMT04uRWZmZWN0LlNoYWRlcnNTdG9yZVsndmF0UGFydGljbGVWZXJ0ZXhTaGFkZXInXSA9IGBcbiAgICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG5cbiAgICAvLyBCdWlsdC1pbnMgZm9yIENQVSBQYXJ0aWNsZVN5c3RlbSBvciBmb3IgR1BVUGFydGljbGVTeXN0ZW0gZHJhdyBwYXNzOlxuICAgICNpZmRlZiBJTlNUQU5DRVNcbiAgICAgIGF0dHJpYnV0ZSB2ZWM0IG9mZnNldDsgICAgICAgIC8vIHBlci1wYXJ0aWNsZSBlbWl0dGVkIG9mZnNldFxuICAgICNlbHNlXG4gICAgICBhdHRyaWJ1dGUgdmVjMyBwb3NpdGlvbjsgICAgICAvLyBmb3IgQ1BVIFBTXG4gICAgICBhdHRyaWJ1dGUgdmVjMiBhbmdsZTsgICAgICAgICAvLyBmb3IgQ1BVIFBTXG4gICAgI2VuZGlmXG4gICAgYXR0cmlidXRlIHZlYzQgY29sb3I7ICAgICAgICAgICAvLyB0aW50XG4gICAgdmFyeWluZyB2ZWM0IHZDb2xvcjtcblxuICAgIC8vIFZBVCBtYWNyb3MgJiB1bmlmb3Jtc1xuICAgICNpbmNsdWRlPGJha2VkVmVydGV4QW5pbWF0aW9uRGVjbGFyYXRpb24+XG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgICBiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmU7XG4gICAgdW5pZm9ybSB2ZWMyICAgICAgICBiYWtlZFZlcnRleEFuaW1hdGlvblRleHR1cmVTaXplSW52ZXJ0ZWQ7XG4gICAgdW5pZm9ybSBmbG9hdCAgICAgICBiYWtlZFZlcnRleEFuaW1hdGlvblRpbWU7XG4gICAgYXR0cmlidXRlIHZlYzQgICAgICBwYXJ0aWNsZVZBVFNldHRpbmdzOyAvLyB4PWZyb20seT10byx6PW9mZnNldFRpbWUsdz1mcHNcblxuICAgIHVuaWZvcm0gbWF0NCB2aWV3O1xuICAgIHVuaWZvcm0gbWF0NCBwcm9qZWN0aW9uO1xuXG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgdkNvbG9yID0gY29sb3I7XG5cbiAgICAgIC8vIHNhbXBsZSBWQVQgb25jZSBmb3IgdGhpcyBwYXJ0aWNsZSBncm91cFxuICAgICAgdmVjMyB2YXRPZmYgPSBiYWtlZFZlcnRleEFuaW1hdGlvbihcbiAgICAgICAgcGFydGljbGVWQVRTZXR0aW5ncy54LFxuICAgICAgICBwYXJ0aWNsZVZBVFNldHRpbmdzLnksXG4gICAgICAgIGJha2VkVmVydGV4QW5pbWF0aW9uVGltZSAtIHBhcnRpY2xlVkFUU2V0dGluZ3MueixcbiAgICAgICAgYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlU2l6ZUludmVydGVkXG4gICAgICApLnh5ejtcblxuICAgICAgLy8gY29tcHV0ZSBiaWxsYm9hcmRpbmcgKyBiYXNlIG9mZnNldCArIFZBVCB0cmFuc2xhdGlvbjpcbiAgICAgICNpZmRlZiBJTlNUQU5DRVNcbiAgICAgICAgdmVjMyB3b3JsZFBvcyA9IHZlYzMob2Zmc2V0Lnh5eikgKyB2YXRPZmY7XG4gICAgICAgIGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbiAqIHZpZXcgKiB2ZWM0KHdvcmxkUG9zLCAxLjApO1xuICAgICAgI2Vsc2VcbiAgICAgICAgLy8gQ1BVIHBhdGggKG9wdGlvbmFsKVxuICAgICAgICBnbF9Qb3NpdGlvbiA9IHByb2plY3Rpb24gKiB2aWV3ICogKHZlYzQocG9zaXRpb24sMS4wKSArIHZlYzQodmF0T2ZmLDAuMCkpO1xuICAgICAgI2VuZGlmXG4gICAgfVxuYDtcblxuQkFCWUxPTi5FZmZlY3QuU2hhZGVyc1N0b3JlWyd2YXRQYXJ0aWNsZUZyYWdtZW50U2hhZGVyJ10gPSBgXG4gICAgcHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuICAgIHZhcnlpbmcgdmVjNCB2Q29sb3I7XG4gICAgdW5pZm9ybSBzYW1wbGVyMkQgdGV4dHVyZVNhbXBsZXI7XG4gICAgdm9pZCBtYWluKCkge1xuICAgICAgZ2xfRnJhZ0NvbG9yID0gdGV4dHVyZTJEKHRleHR1cmVTYW1wbGVyLCBnbF9Qb2ludENvb3JkKSAqIHZDb2xvcjtcbiAgICB9XG5gO1xuXG5leHBvcnQgY29uc3QgY3JlYXRlVkFUUGFydGljbGVTeXN0ZW0gPSAoXG4gIG5hbWU6IHN0cmluZyxcbiAgc2NlbmU6IEJKUy5TY2VuZSxcbiAgbWFuYWdlcjogQkpTLkJha2VkVmVydGV4QW5pbWF0aW9uTWFuYWdlcixcbiAgY2FwYWNpdHk6IG51bWJlcixcbik6IChbQkpTLkdQVVBhcnRpY2xlU3lzdGVtLCBCSlMuT2JzZXJ2ZXI8QkpTLlNjZW5lPl0pID0+IHtcbiAgY29uc3QgeyBWZWN0b3IzLCBHUFVQYXJ0aWNsZVN5c3RlbSwgVGV4dHVyZSwgQ29sb3I0LCBCb3hQYXJ0aWNsZUVtaXR0ZXIgfSA9IEJBQllMT047XG5cbiAgY29uc3QgcGFydGljbGVTeXN0ZW0gPSBuZXcgQkFCWUxPTi5HUFVQYXJ0aWNsZVN5c3RlbShuYW1lLCB7IGNhcGFjaXR5IH0sIHNjZW5lKTtcbiAgcGFydGljbGVTeXN0ZW0ucGFydGljbGVUZXh0dXJlID0gbmV3IFRleHR1cmUoJ3RleHR1cmVzL2ZsYXJlLnBuZycsIHNjZW5lKTtcblxuICBjb25zdCBkZWZpbmVzOiBzdHJpbmdbXSA9IFtdO1xuICBwYXJ0aWNsZVN5c3RlbS5maWxsRGVmaW5lcyhkZWZpbmVzLCBwYXJ0aWNsZVN5c3RlbS5ibGVuZE1vZGUpO1xuXG4gIC8vIDIpIEJ1aWxkIGFuIEVmZmVjdCBmb3IgeW91ciBQYXJ0aWNsZVN5c3RlbSBpbnN0YW5jZTpcbiAgY29uc3QgdW5pZm9ybXMgPSBbXG4gICAgJ3ZpZXcnLFxuICAgICdwcm9qZWN0aW9uJyxcbiAgICAnYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlJyxcbiAgICAnYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlU2l6ZUludmVydGVkJyxcbiAgICAnYmFrZWRWZXJ0ZXhBbmltYXRpb25UaW1lJyxcbiAgXTtcbiAgY29uc3Qgc2FtcGxlcnMgPSBbJ3RleHR1cmVTYW1wbGVyJywgJ2Jha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZSddO1xuICBjb25zdCBlbmdpbmUgPSBzY2VuZS5nZXRFbmdpbmUoKTtcbiAgY29uc3QgY3VzdG9tRWZmID0gZW5naW5lLmNyZWF0ZUVmZmVjdEZvclBhcnRpY2xlcyhcbiAgICAndmF0UGFydGljbGUnLCAvLyBwaWNrcyB2YXRQYXJ0aWNsZVZlcnRleC9GcmFnbWVudFxuICAgIHVuaWZvcm1zLFxuICAgIHNhbXBsZXJzLFxuICAgIGRlZmluZXMuam9pbignXFxuJyksXG4gICAgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCxcbiAgICBwYXJ0aWNsZVN5c3RlbSwgLy8gd2lyZXMgaW4gSU5TVEFOQ0VTIGFuZCBjb2xvci9vZmZzZXQgYXR0cnNcbiAgKTtcblxuICBwYXJ0aWNsZVN5c3RlbS5zZXRDdXN0b21FZmZlY3QoY3VzdG9tRWZmLCBwYXJ0aWNsZVN5c3RlbS5ibGVuZE1vZGUpO1xuXG4gIGNvbnN0IG9icyA9IHNjZW5lLm9uQmVmb3JlUmVuZGVyT2JzZXJ2YWJsZS5hZGQoKCkgPT4ge1xuICAgIGlmICghbWFuYWdlciB8fCAhbWFuYWdlci50ZXh0dXJlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGVmZiA9IGN1c3RvbUVmZjtcbiAgICBlZmYuc2V0VGV4dHVyZSgnYmFrZWRWZXJ0ZXhBbmltYXRpb25UZXh0dXJlJywgbWFuYWdlci50ZXh0dXJlKTtcbiAgICBjb25zdCBzeiA9IG1hbmFnZXIudGV4dHVyZS5nZXRTaXplKCk7XG4gICAgZWZmLnNldFZlY3RvcjIoJ2Jha2VkVmVydGV4QW5pbWF0aW9uVGV4dHVyZVNpemVJbnZlcnRlZCcsXG4gICAgICBuZXcgQkFCWUxPTi5WZWN0b3IyKDEgLyBzei53aWR0aCwgMSAvIHN6LmhlaWdodCkpO1xuICAgIGVmZi5zZXRGbG9hdCgnYmFrZWRWZXJ0ZXhBbmltYXRpb25UaW1lJywgbWFuYWdlci50aW1lKTtcbiAgfSk7XG4gIFxuICByZXR1cm4gW3BhcnRpY2xlU3lzdGVtLCBvYnNdO1xufTtcbiJdfQ==