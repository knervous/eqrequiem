import { beforeAll, describe, expect, it } from '@jest/globals';
import { NullEngine } from '@babylonjs/core';

import { TestClass } from '../src/extensions/ShadoActor';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer';

describe('WebGPU shader safety', () => {
  let engine: NullEngine;

  beforeAll(async () => {
    engine = new NullEngine();
    const initialized = await ShadoInstanceContainer.initialize(engine, {
      extra: TestClass,
      wasm: false,
    });
    if (!initialized) throw new Error('ShadoInstanceContainer initialization failed');
  });

  it('samples the atlas with explicit LOD for WebGPU non-uniform control flow', () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    const fragment = container.generateGLSLPair().fs;

    expect(fragment).toContain('textureLod(uAtlasArray, vec3(uvA, page), 0.0)');
    expect(fragment).toContain('vec4 atlasColor = sampleAtlas');
    expect(fragment).toContain('mix(vec4(1.0), atlasColor, hasAtlasRect)');
    expect(fragment).not.toContain('texture(uAtlasArray');
    expect(fragment).not.toMatch(/\?\s*sampleAtlas\s*\(/);
  });
});
