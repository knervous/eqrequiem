import { NullEngine } from '@babylonjs/core';
import { ShadoActor, ShadoLightingMode } from '../src/extensions/ShadoActor';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer/ShadoInstanceContainer';

describe('base instance lighting', () => {
  it('keeps actors unlit until they opt into Lambert lighting', async () => {
    const engine = new NullEngine();
    await ShadoInstanceContainer.initialize(engine, { wasm: false, extra: ShadoActor });
    const container = new ShadoInstanceContainer<ShadoActor>(engine);
    const actor = container.addInstance();

    expect(actor.lightingMode).toBe(ShadoLightingMode.Unlit);
    expect(actor.padding1).toBe(0);

    actor.lightingMode = ShadoLightingMode.Lambert;
    expect(actor.lightingMode).toBe(ShadoLightingMode.Lambert);
    expect(actor.padding1).toBe(1);

    container.dispose();
    engine.dispose();
  });

  it('emits inherited Lambert lighting for GLSL and WGSL, including VAT normals', async () => {
    const engine = new NullEngine();
    await ShadoInstanceContainer.initialize(engine, { wasm: false, extra: ShadoActor });
    const container = new ShadoInstanceContainer<ShadoActor>(engine);
    const glsl = container.generateGLSLPair();
    const wgsl = container.generateWGSLPair();

    expect(glsl.vs).toContain('vShadoLighting = inst.padding1 > 0.5');
    expect(glsl.vs).toContain('cross(r.xyz, cross(r.xyz, localNormal)');
    expect(glsl.fs).toContain('surface.rgb *= vShadoLighting;');
    expect(wgsl.vs).toContain('inst.padding1 > 0.5');
    expect(wgsl.vs).toContain('Shado_rotatePoint(blendedDQ.real, localNormal)');
    expect(wgsl.fs).toContain('surface.rgb = surface.rgb * fragmentInputs.vShadoLighting;');

    container.dispose();
    engine.dispose();
  });
});
