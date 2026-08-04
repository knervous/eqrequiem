import { beforeAll, describe, expect, it } from '@jest/globals';
import { NullEngine, ShaderLanguage, ShaderStore } from '@babylonjs/core';
import {
  Finalize,
  Initialize,
  Process,
} from '@babylonjs/core/Engines/Processors/shaderProcessor.js';
import { WebGPUShaderProcessingContext } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js';
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js';

import { TestClass } from '../src/extensions/ShadoActor';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer';
import { NameplateData, makeMSDFTextShaders } from '../src/msdf';
import { ShadoDynamicEntityContainer } from '../src/render/ShadoDynamicEntityContainer';
import { EqShowcaseActor, EqShowcaseContainer } from '../src/showcase/EqShowcaseActors';

async function preprocessWGSL(
  engine: NullEngine,
  pair: { vs: string; fs: string },
  defines: string[] = []
): Promise<{ vertexCode: string; fragmentCode: string }> {
  const processor = new WebGPUShaderProcessorWGSL();
  const processingContext = new WebGPUShaderProcessingContext(ShaderLanguage.WGSL);
  const common = {
    defines,
    indexParameters: {},
    shouldUseHighPrecisionShader: true,
    supportsUniformBuffers: true,
    shadersRepository: '',
    includesShadersStore: ShaderStore.IncludesShadersStoreWGSL,
    processor,
    version: '',
    platformName: 'WEBGPU',
    processingContext,
    isNDCHalfZRange: true,
    useReverseDepthBuffer: false,
  };
  Initialize({ ...common, isFragment: false });

  const process = (source: string, isFragment: boolean) =>
    new Promise<string>((resolve, reject) => {
      try {
        Process(source, { ...common, isFragment }, code => resolve(code), engine);
      } catch (error) {
        reject(error);
      }
    });

  const vertex = await process(pair.vs, false);
  const fragment = await process(pair.fs, true);
  return Finalize(vertex, fragment, { ...common, isFragment: false });
}

describe('WebGPU shader safety', () => {
  let engine: NullEngine;

  beforeAll(async () => {
    engine = new NullEngine();
    // The NullEngine has no GPU device, but marking its capability lets these
    // tests exercise the exact storage/WGSL selection and generation path.
    (engine as any)._isWebGPU = true;
    const initialized = await ShadoInstanceContainer.initialize(engine, {
      extra: TestClass,
      wasm: false,
      backend: 'storage',
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

  it('generates the non-VAT storage vertex path with compact visibility indirection', async () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    (container as any)._useVatMaterial = false;
    const pair = container.generateWGSLPair();

    expect(pair.vs).not.toContain('moduleSource');
    expect(pair.fs).not.toContain('moduleSource');
    expect(pair.vs).toContain('var<storage, read> uShadoVisibleIndices: array<u32>');
    expect(pair.vs).toContain('Shado_visibleActorIndex(drawIndex)');
    expect(pair.vs).toContain('ShadoInstanceContainer_instances_get(sourceIndex)');

    const processed = await preprocessWGSL(engine, pair);
    expect(processed.vertexCode).toContain('@builtin(instance_index) instanceIndex');
    expect(processed.vertexCode).toContain('@group(');
    expect(processed.vertexCode).toContain('var<storage, read> shadoInstanceContainerBuf');
    expect(processed.vertexCode).not.toMatch(
      /#include|\\battribute\\b|\\bvarying\\b|\\buniform\\b/
    );
    expect(processed.fragmentCode).toContain('textureSampleLevel');
    expect(processed.fragmentCode).not.toMatch(/#include|\\bvarying\\b|\\buniform\\b/);
  });

  it('generates and preprocesses the DQ/VAT storage vertex path', async () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    const pair = container.generateWGSLPair();

    expect(pair.vs).toContain('struct ShadoDQScale');
    expect(pair.vs).toContain('Shado_fetchBoneDQScale');
    expect(pair.vs).toContain('Shado_transformDQ');
    expect(pair.vs).toContain('uniform uDQHasScale: i32');
    expect(pair.fs).toContain('texture_2d_array<f32>');
    expect(pair.fs).toContain(
      'textureSampleLevel(uAtlasArray, uAtlasArraySampler, uvA, page, 0.0)'
    );

    const processed = await preprocessWGSL(engine, pair);
    expect(processed.vertexCode).toContain('textureLoad(uDQAtlas');
    expect(processed.vertexCode).toContain('uniforms.uDQHasScale');
    expect(processed.vertexCode).not.toContain('moduleSource');
    expect(processed.fragmentCode).not.toContain('moduleSource');
  });

  it('preprocesses the medium and low VAT quality tiers into smaller vertex paths', async () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    const pair = container.generateWGSLPair();

    const medium = await preprocessWGSL(engine, pair, ['#define SHADO_VAT_SINGLE_FRAME']);
    expect(medium.vertexCode).not.toContain('dq1 = Shado_accumulateDQ');
    expect(medium.vertexCode).not.toContain('mix(dq0.real, dq1.real');
    expect(medium.vertexCode).toContain('var blendedDQ = dq0');

    const low = await preprocessWGSL(engine, pair, [
      '#define SHADO_VAT_SINGLE_FRAME',
      '#define SHADO_VAT_DOMINANT_BONE',
    ]);
    expect(low.vertexCode).toContain('dominantBoneIndex');
    expect(low.vertexCode).toContain('dq0 = Shado_fetchBoneDQScale(dominantBoneIndex, frame0)');
    expect(low.vertexCode).not.toContain('for (var lane = 0');
    expect(low.vertexCode).not.toContain('dq1');
  });

  it('preprocesses a synchronized cohort with a shared animation uniform', async () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    const pair = container.generateWGSLPair();
    const processed = await preprocessWGSL(engine, pair, [
      '#define SHADO_VAT_SHARED_POSE',
    ]);

    expect(processed.vertexCode).toContain('uShadoSharedAnimation');
    expect(processed.vertexCode).toContain('uniforms.uShadoSharedAnimation');
    expect(processed.vertexCode).not.toContain('inst.animationBuffer');
  });

  it('registers storage shaders in Babylon’s WGSL shader store', () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    const names = container.getShaderNames();

    const vertex = ShaderStore.ShadersStoreWGSL[`${names.vertex}VertexShader`];
    const fragment = ShaderStore.ShadersStoreWGSL[`${names.fragment}FragmentShader`];
    expect(vertex).toContain('@vertex');
    expect(fragment).toContain('@fragment');
    expect(vertex).not.toContain('moduleSource');
    expect(fragment).not.toContain('moduleSource');
  });

  it('shares identical generated shaders across container instances', () => {
    const first = new ShadoInstanceContainer<TestClass>(engine);
    const second = new ShadoInstanceContainer<TestClass>(engine);
    expect(first.getShaderNames()).toEqual(second.getShaderNames());
  });

  it('dispatches frame-owned synchronization through container sidecars once', () => {
    const container = new ShadoInstanceContainer<TestClass>(engine);
    let commits = 0;
    (container as any).commit = () => {
      commits++;
      return { uploadCalls: 0, uploadedBytes: 0, encodedBytes: 0 };
    };
    container.syncGpu(101);
    container.syncGpu(101);
    expect(commits).toBe(1);
    container.syncGpu(102);
    expect(commits).toBe(2);
  });

  it('generates and preprocesses dynamic-entity storage shaders', async () => {
    const initialized = await ShadoDynamicEntityContainer.initialize(engine, {
      backend: 'storage',
      wasm: false,
    });
    expect(initialized).toBe(true);
    const container = new ShadoDynamicEntityContainer(engine);
    const pair = container.generateWGSLPair();

    expect(pair.vs).toContain('#include<ShadoDynamicEntityContainerStorage>');
    expect(pair.vs).toContain('ShadoDynamicEntityContainer_drawIds_get');
    expect(pair.fs).toContain('texture_2d_array<f32>');

    const processed = await preprocessWGSL(engine, pair);
    expect(processed.vertexCode).toContain('var<storage, read> shadoDynamicEntityContainerBuf');
    expect(processed.vertexCode).not.toMatch(/#include|\battribute\b|\bvarying\b/);
    expect(processed.fragmentCode).toContain('textureSampleLevel');

    const peer = new ShadoDynamicEntityContainer(engine);
    expect(container.getShaderNamesForRenderMode()).toEqual(peer.getShaderNamesForRenderMode());

    for (const mode of [
      { geometry: 'plane' as const, billboard: true },
      { geometry: 'spriteSlab' as const, billboard: false },
      { geometry: 'mesh' as const, billboard: false },
    ]) {
      container.configureRenderMode(mode);
      const variant = await preprocessWGSL(engine, container.generateWGSLPair());
      expect(variant.vertexCode).toContain('var<storage, read> shadoDynamicEntityContainerBuf');
      expect(variant.fragmentCode).toContain('textureSampleLevel');
    }
  });

  it('preprocesses MSDF storage shaders with real sidecar visibility', async () => {
    const initialized = await NameplateData.initialize(engine, {
      backend: 'storage',
      wasm: false,
    });
    expect(initialized).toBe(true);
    const pair = makeMSDFTextShaders({
      actorStructName: 'TestClass',
      useVisibilityTexture: true,
    });

    expect(pair.vertexWGSL).toContain('var uShadoVisibilityFlags : texture_2d<f32>');
    expect(pair.vertexWGSL).toContain('textureLoad');
    expect(pair.vertexWGSL).not.toContain('keep the template structurally valid');
    const includeNames = [...pair.vertexWGSL.matchAll(/#include<([^>]+)>/g)].map(match => match[1]);
    expect(includeNames.filter(name => !ShaderStore.IncludesShadersStoreWGSL[name])).toEqual([]);

    const processed = await preprocessWGSL(engine, {
      vs: pair.vertexWGSL,
      fs: pair.fragmentWGSL,
    });
    expect(processed.vertexCode).toContain('var<storage, read> shadoInstanceContainerBuf');
    expect(processed.vertexCode).toMatch(/textureLoad\(\s*uShadoVisibilityFlags/);
    expect(processed.fragmentCode).toContain('textureSample');
  });

  it('preprocesses MSDF storage shaders with typed inline actor visibility', async () => {
    const pair = makeMSDFTextShaders({
      actorStructName: 'TestClass',
      useVisibilityTexture: false,
    });

    expect(pair.vertexWGSL).toContain(
      'ShadoInstanceContainer_fetchI32(ownerBase + TestClass_visibleFlag_OFF) != 0'
    );
    const processed = await preprocessWGSL(engine, {
      vs: pair.vertexWGSL,
      fs: pair.fragmentWGSL,
    });
    expect(processed.vertexCode).toContain(
      'ShadoInstanceContainer_fetchI32(ownerBase + TestClass_visibleFlag_OFF) != 0'
    );
    expect(processed.vertexCode).not.toMatch(/#include|\battribute\b|\bvarying\b/);
  });

  it('preprocesses native WGSL equipment texture-array hooks', async () => {
    const initialized = await EqShowcaseContainer.initialize(engine, {
      extra: EqShowcaseActor,
      backend: 'storage',
      wasm: false,
    });
    expect(initialized).toBe(true);
    const container = new EqShowcaseContainer(engine);
    const pair = container.generateWGSLPair();

    expect(pair.vs).toContain('vertexOutputs.vEqLayer = eqLayers[armorSet]');
    expect(pair.vs).toContain('inst.weaponClass');
    expect(pair.fs).toContain('var uEqArmorAtlas: texture_2d_array<f32>');
    expect(pair.fs).toContain('textureSampleLevel');

    const processed = await preprocessWGSL(engine, pair, ['#define EQ_ARMOR_VARIANTS']);
    expect(processed.vertexCode).toContain('vEqLayer');
    expect(processed.fragmentCode).toContain('uEqArmorAtlas');
    expect(processed.fragmentCode).not.toMatch(/#ifdef|#endif|\bvarying\b/);
  });
});
