import { describe, expect, it } from '@jest/globals';

import { TestClass } from '../src/extensions/ShadoActor';
import { ShadoLiteInstanceContainer } from '../src/lite/ShadoLiteInstanceContainer';
import {
  buildBabylonLiteShadoShaderSources,
  buildBabylonLiteProjectedShaderSources,
  emitBabylonLiteStorageSource,
} from '../src/lite/ShadoLiteMaterial';

describe('Babylon Lite native Shado shader', () => {
  it('uses Lite public ShaderMaterial names without embedded bind-group declarations', () => {
    delete (ShadoLiteInstanceContainer as any).__cachedSchema;
    const schema = ShadoLiteInstanceContainer.getSchema([
      { name: 'instances', type: { arrayOf: { structOf: TestClass } } },
    ]);
    const storage = emitBabylonLiteStorageSource(schema);
    const sources = buildBabylonLiteShadoShaderSources(schema);

    expect(storage).toContain('struct TestClassHeader');
    expect(storage).toContain('ShadoLiteInstanceContainer_instances_get');
    expect(storage).not.toContain('var<storage, read> shadoLiteInstanceContainerBuf');
    expect(storage).not.toContain('var<storage, read> shadoLiteInstanceContainerParams');
    expect(sources.vertexSource).toContain('@builtin(instance_index) drawIndex');
    expect(sources.vertexSource).toContain('shaderSystem.worldViewProjection');
    expect(sources.vertexSource).toContain('shadoVisibleIndices[drawIndex]');
    expect(sources.fragmentSource).toContain('@fragment');
  });

  it('emits pass-specific packed actor reads without the legacy arena getter', () => {
    const sources = buildBabylonLiteProjectedShaderSources({
      encoding: 'packed',
      domain: {
        origin: [-64, -64, -64],
        extent: [128, 128, 128],
        scaleRange: [0, 8],
      },
    });

    expect(sources.vertexSource).toContain('unpack2x16unorm');
    expect(sources.vertexSource).toContain('unpack2x16snorm');
    expect(sources.vertexSource).toContain('unpack4x8unorm');
    expect(sources.vertexSource).toContain('shadoActorTransform');
    expect(sources.vertexSource).toContain('shadoActorAppearance');
    expect(sources.vertexSource).toContain('shadoVisibleIndices[drawIndex]');
    expect(sources.vertexSource).not.toContain('ShadoLiteInstanceContainer_instances_get');
  });

  it('emits exact split-f32 bitcasts as the lossless control path', () => {
    const sources = buildBabylonLiteProjectedShaderSources({
      encoding: 'split-f32',
    });

    expect(sources.vertexSource).toContain('sourceIndex * 8u');
    expect(sources.vertexSource).toContain('bitcast<f32>(shadoActorTransform');
    expect(sources.vertexSource).not.toContain('unpack2x16unorm');
  });
});
