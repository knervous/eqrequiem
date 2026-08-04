import { describe, expect, it } from '@jest/globals';
import { NullEngine } from '@babylonjs/core';
import { ShadoInstanceDrawSelection } from '../src/extensions/ShadoInstanceContainer/ShadoInstanceDrawSelection';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import { emitShadoPreSkinComputeWGSL } from '../src/extensions/ShadoInstanceContainer/ShadoHybridPreSkinCache';

describe('hybrid module draw path', () => {
  it('publishes an independent compact actor list for one module draw', () => {
    const engine = new NullEngine();
    const selection = new ShadoInstanceDrawSelection(engine);
    selection.setActorIndices([7, 2, 19]);

    const first = selection.commit();
    const target = {
      texture: undefined as unknown,
      width: 0,
      setTexture(_name: string, texture: unknown) { this.texture = texture; },
      setInt(_name: string, value: number) { this.width = value; },
    };
    selection.bind(target);

    expect(selection.visibleCount).toBe(3);
    expect([...selection.actorIndices]).toEqual([7, 2, 19]);
    expect(first.uploadCalls).toBe(1);
    expect(target.texture).toBeDefined();
    expect(target.width).toBe(2048);
    expect(selection.commit().uploadCalls).toBe(0);

    selection.dispose();
    engine.dispose();
  });

  it('generates shared-pose branches for both shader backends', () => {
    const engine = new NullEngine();
    const container = Object.create(ShadoInstanceContainer.prototype) as ShadoInstanceContainer<any>;
    (container as any)._useVatMaterial = true;
    (container as any)._includeName = 'ShadoInstanceContainer';

    const glsl = container.generateGLSLPair().vs;
    const wgsl = container.generateWGSLPair().vs;
    expect(glsl).toContain('#ifdef SHADO_VAT_SHARED_POSE');
    expect(glsl).toContain('vec4 anim = uShadoSharedAnimation');
    expect(wgsl).toContain('let animation = uniforms.uShadoSharedAnimation');

    engine.dispose();
  });

  it('generates the compute-to-vertex cache shader for synchronized cohorts', () => {
    const full = emitShadoPreSkinComputeWGSL('full');
    const low = emitShadoPreSkinComputeWGSL('low');

    expect(full).toContain('@compute @workgroup_size(128)');
    expect(full).toContain('var<storage, read_write> outputVertices');
    expect(full).toContain('bitcast<f32>(params[2])');
    expect(full).toContain('outputVertices[output + 1u]');
    expect(low).toContain('var dominantIndex = boneIndices0.x');
    expect(low).toContain('let frameLerp = 0.0');
  });
});
