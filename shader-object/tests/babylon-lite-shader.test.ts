import { describe, expect, it } from '@jest/globals';

import { TestClass } from '../src/extensions/ShadoActor';
import { ShadoLiteInstanceContainer } from '../src/lite/ShadoLiteInstanceContainer';
import {
  buildBabylonLiteShadoShaderSources,
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
    expect(storage).not.toContain(
      'var<storage, read> shadoLiteInstanceContainerBuf'
    );
    expect(storage).not.toContain(
      'var<storage, read> shadoLiteInstanceContainerParams'
    );
    expect(sources.vertexSource).toContain('@builtin(instance_index) drawIndex');
    expect(sources.vertexSource).toContain('shaderSystem.worldViewProjection');
    expect(sources.vertexSource).toContain('shadoVisibleIndices[drawIndex]');
    expect(sources.fragmentSource).toContain('@fragment');
  });
});

