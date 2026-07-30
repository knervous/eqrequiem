import { chromium, expect, test, type Page } from '@playwright/test';
import { NullEngine, ShaderLanguage, ShaderStore } from '@babylonjs/core';
import {
  Finalize,
  Initialize,
  Process,
} from '@babylonjs/core/Engines/Processors/shaderProcessor.js';
import { WebGPUShaderProcessingContext } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js';
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js';
import path from 'node:path';
import { ShadoInstanceContainer, TestClass } from '../../dist/index.js';
import {
  ShadoLiteInstanceContainer,
  buildBabylonLiteProjectedShaderSources,
  buildBabylonLiteShadoShaderSources,
} from '../../dist/lite/index.js';
import { emitComputeScatterWGSL } from '../../dist/render-data/index.js';

type BrowserResult = {
  status: 'running' | 'passed' | 'failed';
  result?: Record<string, unknown>;
  error?: string;
};

async function waitForResult(page: Page): Promise<BrowserResult> {
  await expect
    .poll(() => page.evaluate(() => window.__shadoBrowserTest?.status), { timeout: 45_000 })
    .toMatch(/^(passed|failed)$/);
  const state = await page.evaluate(() => window.__shadoBrowserTest as BrowserResult);
  expect(state.error).toBeUndefined();
  expect(state.status).toBe('passed');
  return state;
}

async function buildStorageWGSL(useVat: boolean) {
  const engine = new NullEngine();
  (engine as any)._isWebGPU = true;
  const initialized = await ShadoInstanceContainer.initialize(engine, {
    extra: TestClass,
    wasm: false,
    backend: 'storage',
  });
  if (!initialized) throw new Error('ShadoInstanceContainer initialization failed');

  const container = new ShadoInstanceContainer<TestClass>(engine);
  (container as any)._useVatMaterial = useVat;
  const pair = container.generateWGSLPair();
  const processor = new WebGPUShaderProcessorWGSL();
  const processingContext = new WebGPUShaderProcessingContext(ShaderLanguage.WGSL);
  const common = {
    defines: [],
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
  container.dispose();
  engine.dispose();
  return Finalize(vertex, fragment, { ...common, isFragment: false });
}

function buildLiteWGSL() {
  delete (ShadoLiteInstanceContainer as any).__cachedSchema;
  const schema = ShadoLiteInstanceContainer.getSchema([
    { name: 'instances', type: { arrayOf: { structOf: TestClass } } },
  ]);
  const pair = buildBabylonLiteShadoShaderSources(schema);
  const lname = schema.name.charAt(0).toLowerCase() + schema.name.slice(1);
  const prelude = `
struct SceneUniforms { pad: vec4<f32> }
@group(0) @binding(0) var<uniform> sceneUniforms: SceneUniforms;
struct ShaderSystemUniforms { worldViewProjection: mat4x4<f32> }
@group(1) @binding(0) var<uniform> shaderSystem: ShaderSystemUniforms;
@group(1) @binding(1) var<storage, read> ${lname}Buf: array<u32>;
@group(1) @binding(2) var<storage, read> ${lname}Params: array<i32>;
@group(1) @binding(3) var<storage, read> shadoVisibleIndices: array<u32>;
struct VertexInput { @location(0) position: vec3<f32> };
`;
  return {
    vertexCode: `${prelude}\n${pair.vertexSource}`,
    fragmentCode: `${prelude}\n${pair.fragmentSource}`,
  };
}

function buildProjectedLiteWGSL(encoding: 'split-f32' | 'packed') {
  const pair = buildBabylonLiteProjectedShaderSources({
    encoding,
    domain: {
      origin: [-64, -64, -64],
      extent: [128, 128, 128],
      scaleRange: [0, 8],
    },
  });
  const prelude = `
struct SceneUniforms { pad: vec4<f32> }
@group(0) @binding(0) var<uniform> sceneUniforms: SceneUniforms;
struct ShaderSystemUniforms { worldViewProjection: mat4x4<f32> }
@group(1) @binding(0) var<uniform> shaderSystem: ShaderSystemUniforms;
@group(1) @binding(1) var<storage, read> shadoActorTransform: array<u32>;
@group(1) @binding(2) var<storage, read> shadoActorAppearance: array<u32>;
@group(1) @binding(3) var<storage, read> shadoVisibleIndices: array<u32>;
struct VertexInput { @location(0) position: vec3<f32> };
`;
  return {
    vertexCode: `${prelude}\n${pair.vertexSource}`,
    fragmentCode: `${prelude}\n${pair.fragmentSource}`,
  };
}

test('compiles storage-backed WGSL with and without VAT on a WebGPU device', async () => {
  const plain = await buildStorageWGSL(false);
  const vat = await buildStorageWGSL(true);
  const lite = buildLiteWGSL();
  const projectedSplit = buildProjectedLiteWGSL('split-f32');
  const projectedPacked = buildProjectedLiteWGSL('packed');
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:4177/vite.svg');
    const result = await page.evaluate(
      async sources => {
        const gpu = (navigator as any).gpu;
        if (!gpu) throw new Error('WebGPU is unavailable in this browser');
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter is available');
        const device = await adapter.requestDevice();
        const compiled: Array<{ name: string; errors: string[] }> = [];
        for (const [name, code] of Object.entries(sources)) {
          const module = device.createShaderModule({ code });
          const info = await module.getCompilationInfo();
          compiled.push({
            name,
            errors: info.messages
              .filter((message: any) => message.type === 'error')
              .map((message: any) => `${message.lineNum}:${message.linePos} ${message.message}`),
          });
        }
        return compiled;
      },
      {
        plainVertex: plain.vertexCode,
        plainFragment: plain.fragmentCode,
        vatVertex: vat.vertexCode,
        vatFragment: vat.fragmentCode,
        liteVertex: lite.vertexCode,
        liteFragment: lite.fragmentCode,
        projectedSplitVertex: projectedSplit.vertexCode,
        projectedSplitFragment: projectedSplit.fragmentCode,
        projectedPackedVertex: projectedPacked.vertexCode,
        projectedPackedFragment: projectedPacked.fragmentCode,
      }
    );

    expect(result).toEqual([
      { name: 'plainVertex', errors: [] },
      { name: 'plainFragment', errors: [] },
      { name: 'vatVertex', errors: [] },
      { name: 'vatFragment', errors: [] },
      { name: 'liteVertex', errors: [] },
      { name: 'liteFragment', errors: [] },
      { name: 'projectedSplitVertex', errors: [] },
      { name: 'projectedSplitFragment', errors: [] },
      { name: 'projectedPackedVertex', errors: [] },
      { name: 'projectedPackedFragment', errors: [] },
    ]);
  } finally {
    await browser.close();
  }
});

test('compute scatter writes only the requested projected actor slots', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:4177/vite.svg');
    const result = await page.evaluate(
      async source => {
        const gpu = navigator.gpu;
        if (!gpu) throw new Error('WebGPU is unavailable');
        const adapter = await gpu.requestAdapter();
        if (!adapter) throw new Error('No WebGPU adapter is available');
        const device = await adapter.requestDevice();
        const strideWords = 4;
        const actorCount = 128;
        const records = [
          { slot: 7, words: [73, 74] },
          { slot: 2, words: [23, 24] },
          { slot: 99, words: [993, 994] },
        ];
        const recordWords = 3;
        const delta = new Uint32Array(records.length * recordWords);
        records.forEach((record, recordIndex) => {
          const offset = recordIndex * recordWords;
          delta[offset] = record.slot;
          delta.set(record.words, offset + 1);
        });
        const params = new Uint32Array([records.length, 0, 0, 0]);
        const destination = device.createBuffer({
          size: actorCount * strideWords * 4,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        const deltaBuffer = device.createBuffer({
          size: delta.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const paramsBuffer = device.createBuffer({
          size: params.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const readback = device.createBuffer({
          size: actorCount * strideWords * 4,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        device.queue.writeBuffer(deltaBuffer, 0, delta);
        device.queue.writeBuffer(paramsBuffer, 0, params);
        const module = device.createShaderModule({ code: source });
        const pipeline = device.createComputePipeline({
          layout: 'auto',
          compute: { module, entryPoint: 'main' },
        });
        const bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: deltaBuffer } },
            { binding: 1, resource: { buffer: destination } },
            { binding: 2, resource: { buffer: paramsBuffer } },
          ],
        });
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(1);
        pass.end();
        encoder.copyBufferToBuffer(destination, 0, readback, 0, actorCount * strideWords * 4);
        device.queue.submit([encoder.finish()]);
        await readback.mapAsync(GPUMapMode.READ);
        const output = new Uint32Array(readback.getMappedRange()).slice();
        readback.unmap();
        return {
          row2: Array.from(output.slice(2 * strideWords, 3 * strideWords)),
          row7: Array.from(output.slice(7 * strideWords, 8 * strideWords)),
          row99: Array.from(output.slice(99 * strideWords, 100 * strideWords)),
          untouched: Array.from(output.slice(8 * strideWords, 9 * strideWords)),
        };
      },
      emitComputeScatterWGSL({
        destinationStrideWords: 4,
        destinationOffsetWords: 2,
        copyWords: 2,
      })
    );

    expect(result).toEqual({
      row2: [0, 0, 23, 24],
      row7: [0, 0, 73, 74],
      row99: [0, 0, 993, 994],
      untouched: [0, 0, 0, 0],
    });
  } finally {
    await browser.close();
  }
});

test('Babylon Lite dispatches the shared shaped scatter ABI', async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:4177/vite.svg');
    const result = await page.evaluate(async () => {
      const lite = await import('/@id/@babylonjs/lite');
      const { BabylonLiteComputeScatterExecutor, canUseBabylonLiteComputeScatter } =
        await import('/@id/@knervous/shado/lite');
      const canvas = new OffscreenCanvas(16, 16);
      const engine = await lite.createEngine(canvas);
      const actorCount = 128;
      const strideWords = 4;
      const destination = lite.createStorageBuffer(
        engine,
        new Uint32Array(actorCount * strideWords),
        'Lite shaped scatter test'
      );
      const batch = {
        shapeName: 'rotation',
        destinationStrideWords: strideWords,
        destinationOffsetWords: 2,
        copyWords: 2,
        changedRows: 3,
        data: new Uint32Array([7, 73, 74, 2, 23, 24, 99, 993, 994]),
      };
      const executor = new BabylonLiteComputeScatterExecutor(
        engine,
        {
          destinationStrideWords: strideWords,
          destinationOffsetWords: 2,
          copyWords: 2,
        },
        'LiteShapedScatterTest',
        true
      );
      const runtime = engine as any;
      const storage = destination as any;
      runtime._device.pushErrorScope('validation');
      const dispatched = executor.dispatch(batch, destination);
      await runtime._device.queue.onSubmittedWorkDone();

      const verificationSource = `
@group(0) @binding(0) var<storage, read> source: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < ${actorCount * strideWords}u) {
    output[id.x] = source[id.x];
  }
}`;
      const output = runtime._device.createBuffer({
        size: actorCount * strideWords * 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      const readback = runtime._device.createBuffer({
        size: actorCount * strideWords * 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      const pipeline = runtime._device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: runtime._device.createShaderModule({ code: verificationSource }),
          entryPoint: 'main',
        },
      });
      const bindGroup = runtime._device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: storage._buffer } },
          { binding: 1, resource: { buffer: output } },
        ],
      });
      const encoder = runtime._device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.dispatchWorkgroups(Math.ceil((actorCount * strideWords) / 64));
      pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, actorCount * strideWords * 4);
      runtime._device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const words = new Uint32Array(readback.getMappedRange()).slice();
      readback.unmap();
      const validationError = await runtime._device.popErrorScope();
      const recovery = new Uint32Array(
        storage._data.buffer,
        storage._data.byteOffset,
        storage._data.byteLength / 4
      );
      const response = {
        supported: canUseBabylonLiteComputeScatter(engine, destination),
        dispatched,
        validationError: validationError?.message,
        row2: Array.from(words.slice(2 * strideWords, 3 * strideWords)),
        row7: Array.from(words.slice(7 * strideWords, 8 * strideWords)),
        row99: Array.from(words.slice(99 * strideWords, 100 * strideWords)),
        untouched: Array.from(words.slice(8 * strideWords, 9 * strideWords)),
        recoveryRow7: Array.from(recovery.slice(7 * strideWords, 8 * strideWords)),
        gpuTimeMs: executor.gpuTimeMs,
      };
      executor.dispose();
      output.destroy();
      readback.destroy();
      lite.disposeStorageBuffer(destination);
      lite.disposeEngine(engine);
      return response;
    });

    expect(result).toMatchObject({
      supported: true,
      dispatched: true,
      validationError: undefined,
      row2: [0, 0, 23, 24],
      row7: [0, 0, 73, 74],
      row99: [0, 0, 993, 994],
      untouched: [0, 0, 0, 0],
      recoveryRow7: [0, 0, 73, 74],
    });
    expect(result.gpuTimeMs).toBeGreaterThanOrEqual(0);
  } finally {
    await browser.close();
  }
});

test('Babylon Lite material publishes sparse projected actors through compute scatter', async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto('http://127.0.0.1:4177/vite.svg');
    const result = await page.evaluate(async () => {
      const lite = await import('/@id/@babylonjs/lite');
      const { ShadoActor, ShadoLiteInstanceContainer, createShadoLiteMaterial } =
        await import('/@id/@knervous/shado/lite');
      const canvas = new OffscreenCanvas(32, 32);
      const engine = await lite.createEngine(canvas);
      const scene = lite.createSceneContext(engine);
      lite.createDefaultCamera(scene);
      await ShadoLiteInstanceContainer.initialize(engine, {
        extra: ShadoActor,
        backend: 'storage',
        wasm: false,
      });
      const actors = new ShadoLiteInstanceContainer(engine);
      actors.reserveInstances(1_000);
      const children = actors.addInstances(1_000);
      for (const actor of children) {
        actor.translation = new Float32Array([12.25, -8.5, 31.75, 1.25]);
        actor.rotation = new Float32Array([0, 0, 0, 1]);
        actor.color = new Float32Array([0.2, 0.4, 0.6, 1]);
      }
      const mesh = lite.createBox(engine, 1);
      const handle = createShadoLiteMaterial(engine, scene, mesh, actors, {
        projection: {
          encoding: 'packed',
          domain: {
            origin: [-64, -64, -64],
            extent: [128, 128, 128],
            scaleRange: [0, 8],
          },
          uploadPolicy: { maxDirectRanges: 8 },
        },
        computeScatterGPUTiming: true,
      });
      lite.addToScene(scene, mesh);
      await lite.registerScene(scene);
      lite.renderFrame(engine, 16);

      const dirty = Array.from({ length: 100 }, (_, index) => index * 9);
      for (const index of dirty) {
        children[index].translation = new Float32Array([13.25, -8.5, 31.75, 1.25]);
      }
      lite.renderFrame(engine, 16);
      await (engine as any)._device.queue.onSubmittedWorkDone();
      await new Promise(resolve => setTimeout(resolve, 0));
      const publication = handle.getLastProjectionPublication();
      const response = {
        mode: publication?.projection.transform.mode,
        batch: publication?.projection.transform.scatterBatches?.[0],
        dispatches: publication?.scatterDispatches,
        fallbacks: publication?.fallbackFullWrites,
        calls: publication?.actualUploadCalls,
        bytes: publication?.actualUploadedBytes,
        timing: handle.getLastProjectionGPUTiming(),
      };
      handle.dispose();
      lite.disposeScene(scene);
      lite.disposeEngine(engine);
      return response;
    });

    expect(result).toMatchObject({
      mode: 'scatter',
      batch: {
        shapeName: 'positionScale',
        destinationStrideWords: 4,
        destinationOffsetWords: 0,
        copyWords: 2,
        changedRows: 100,
      },
      dispatches: 1,
      fallbacks: 0,
      calls: 2,
      bytes: 1_216,
      timing: {
        transformScatterMs: expect.any(Number),
        appearanceScatterMs: 0,
      },
    });
    expect(result.timing.transformScatterMs).toBeGreaterThanOrEqual(0);
  } finally {
    await browser.close();
  }
});

test('full Babylon projection pipeline dispatches sparse actor scatter', async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(
      'http://127.0.0.1:4177/test?renderer=babylonjs&backend=webgl2&scenario=runtime-vat'
    );
    const result = await page.evaluate(async () => {
      const { BabylonActorProjectionPipeline, WebGPUEngine } =
        await import('/@id/@knervous/shado/babylon');
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      document.body.append(canvas);
      const engine = new WebGPUEngine(canvas);
      await engine.initAsync();
      const base = {
        translation: new Float32Array([12.25, -8.5, 31.75, 1.25]),
        rotation: new Float32Array([0, 0, 0, 1]),
        color: new Float32Array([0.2, 0.4, 0.6, 1]),
      };
      const changed = {
        ...base,
        translation: new Float32Array([13.25, -8.5, 31.75, 1.25]),
      };
      const actors = Array.from({ length: 1_000 }, () => base);
      const pipeline = new BabylonActorProjectionPipeline(engine, {
        encoding: 'packed',
        domain: {
          origin: [-64, -64, -64],
          extent: [128, 128, 128],
          scaleRange: [0, 8],
        },
        uploadPolicy: { maxDirectRanges: 8 },
      });
      try {
        await pipeline.publishWhenReady(actors);
        const dirty = Array.from({ length: 100 }, (_, index) => index * 9);
        for (const index of dirty) actors[index] = changed;
        const publication = await pipeline.publishWhenReady(actors, {
          dirtyIndices: dirty,
        });
        return {
          mode: publication.projection.transform.mode,
          dispatches: publication.scatterDispatches,
          fallbacks: publication.fallbackFullWrites,
          uploadCalls: publication.actualUploadCalls,
          uploadedBytes: publication.actualUploadedBytes,
          batch: publication.projection.transform.scatterBatches?.[0],
        };
      } finally {
        pipeline.dispose();
        engine.dispose();
        canvas.remove();
      }
    });

    expect(result).toEqual({
      mode: 'scatter',
      dispatches: 1,
      fallbacks: 0,
      uploadCalls: 2,
      uploadedBytes: 1_216,
      batch: expect.objectContaining({
        shapeName: 'positionScale',
        destinationOffsetWords: 0,
        copyWords: 2,
        changedRows: 100,
      }),
    });
  } finally {
    await browser.close();
  }
});

test('runs the primary Babylon Lite + Shado storage path', async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.goto('http://127.0.0.1:4177/?renderer=lite');
    await expect
      .poll(
        () => page.evaluate(() => (globalThis as any).__shadoLite?.renderer as string | undefined),
        { timeout: 45_000 }
      )
      .toBe('babylon-lite');
    await expect
      .poll(
        () =>
          page.evaluate(
            () => ((globalThis as any).__shadoLite?.engine.drawCallCount as number) ?? 0
          ),
        { timeout: 15_000 }
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate(
            () => ((globalThis as any).__shadoLite?.controller.stats.instances as number) ?? 0
          ),
        { timeout: 45_000 }
      )
      .toBe(3);
    const state = await page.evaluate(() => {
      const runtime = (globalThis as any).__shadoLite;
      return {
        instances: runtime.controller.stats.instances,
        visible: runtime.controller.stats.visible,
        drawCalls: runtime.engine.drawCallCount,
      };
    });
    expect(state).toMatchObject({ instances: 3, visible: 3 });
    expect(state.drawCalls).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});

test('bakes a VAT from a live Babylon skeleton', async ({ page }) => {
  await page.goto('/test?renderer=babylonjs&backend=webgl2&scenario=runtime-vat');
  const { result } = await waitForResult(page);
  expect(result).toMatchObject({ bones: 1, frames: 3, componentType: 'float32' });
  expect(result?.pixels).toBeGreaterThan(0);
});

test('loads a processed world and exposes the world editor diagnostics', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/world-editor?renderer=babylonjs&backend=webgl2');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as typeof window & { __shadoWorldDev?: { status?: string } }).__shadoWorldDev
              ?.status
        ),
      { timeout: 45_000 }
    )
    .toBe('ready');

  const state = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __shadoWorldDev?: {
            name?: string;
            triangles?: number;
            clusters?: number;
            visibleClusters?: number;
            tiles?: number;
            packets?: number;
            renderChunks?: number;
            bvhNodes?: number;
          };
        }
      ).__shadoWorldDev
  );
  expect(state).toMatchObject({
    name: 'qey2hh1',
    triangles: 12_652,
    clusters: 127,
    tiles: 112,
    packets: 122,
    renderChunks: 45,
    bvhNodes: 85,
  });
  expect(state?.visibleClusters).toBeGreaterThan(0);
  expect(state?.visibleClusters).toBeLessThanOrEqual(state?.clusters ?? 0);

  await expect(page.getByRole('heading', { name: 'World development' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add region' })).toBeVisible();
  await page.getByRole('button', { name: 'Add region' }).click();
  await expect(page.getByLabel('Stable ID')).toHaveValue('semantic');
  await page.getByLabel('Name').fill('Test volume');
  await page.getByLabel('Region kind').selectOption('trigger');
  await page.getByRole('button', { name: 'Scale region' }).click();
  await expect(page.getByRole('button', { name: 'Scale region' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.getByRole('button', { name: 'Move region' }).click();
  const beforeX = await page.evaluate(
    () =>
      window.__shadoWorldRegions?.document.regions.find(region => region.id === 'semantic')
        ?.center[0]
  );
  await page.getByRole('button', { name: 'Move X positive' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__shadoWorldRegions?.document.regions.find(region => region.id === 'semantic')
            ?.center[0]
      )
    )
    .toBe((beforeX ?? 0) + 1);
  await page.getByText('Phase and metadata').click();
  await page.getByLabel('Metadata JSON').fill('{"event":"browser-test"}');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('option', { name: 'Test volume · trigger' })).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__shadoWorldRegions?.document.regions.find(region => region.id === 'semantic')
            ?.metadata
      )
    )
    .toEqual({ event: 'browser-test' });
  await page.getByText('Display and runtime diagnostics').click();
  await expect(page.getByRole('checkbox', { name: 'Cluster bounds' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Streaming tiles' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Pan camera' }).click();
  await expect(page.getByRole('button', { name: 'Pan camera' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page
    .locator('label.world-editor-import', { hasText: 'Import GLB' })
    .locator('input')
    .setInputFiles(path.resolve('tests/barbarian_1.glb'));
  await expect(page.getByText('Previewing barbarian_1.glb')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Freeze culling' }).check();
  await expect(page.getByRole('checkbox', { name: 'Freeze culling' })).toBeChecked();
  expect(errors).toEqual([]);
});

test('keeps the main VAT sandbox as a plane-only baseline', async ({ page }) => {
  await page.goto('/?renderer=babylonjs&backend=webgl2');
  await expect
    .poll(() => page.evaluate(() => !!(globalThis as any).__shadoScene), { timeout: 45_000 })
    .toBe(true);
  const state = await page.evaluate(() => {
    const scene = (globalThis as any).__shadoScene;
    return {
      hasWorld: !!(globalThis as any).__shadoWorld,
      hasPlane: !!scene?.getMeshByName?.('shado-showcase-plane'),
      hasChunkMesh: !!scene?.getMeshByName?.('world-chunk-0'),
    };
  });
  expect(state).toEqual({ hasWorld: false, hasPlane: true, hasChunkMesh: false });
  const diagnostics = page.locator('[data-role="showcase-diagnostics"]');
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics).toContainText('SHADO DIAGNOSTICS');
  await expect(diagnostics).toContainText('WASM SIMD · 600m');
  await expect(diagnostics).toContainText('Reducer');
  await expect(diagnostics).toContainText('GPU frame');
});

test('opens the processed Shado world from its dedicated route', async ({ page }) => {
  await page.goto('/world?backend=webgl2');
  await expect
    .poll(() => page.evaluate(() => !!(globalThis as any).__shadoWorld), { timeout: 45_000 })
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as any).__shadoWorld?.coordinator?.worldObjectVisibilityWorkerStats
            ?.requestedGeneration ?? 0
      )
    )
    .toBeGreaterThan(0);
  const state = await page.evaluate(() => {
    const layer = (globalThis as any).__shadoWorld;
    const scene = (globalThis as any).__shadoScene;
    return {
      world: layer?.world?.name,
      clusters: layer?.world?.clusters?.radius?.length,
      hasChunkMesh: !!scene?.getMeshByName?.('world-chunk-0'),
      visibilityMode: layer?.coordinator?.worldObjectVisibilityMode,
      requestedGeneration:
        layer?.coordinator?.worldObjectVisibilityWorkerStats?.requestedGeneration,
    };
  });
  expect(state).toEqual({
    world: 'qey2hh1',
    clusters: 127,
    hasChunkMesh: true,
    visibilityMode: 'worker',
    requestedGeneration: expect.any(Number),
  });
  expect(state.requestedGeneration).toBeGreaterThan(0);
});

for (const count of [10_000, 20_000]) {
  test(`loads preprocessed VAT and creates ${count.toLocaleString()} SoA actors`, async ({
    page,
  }) => {
    await page.goto(
      `/test?renderer=babylonjs&backend=webgl2&scenario=preprocessed-scale&count=${count}`
    );
    const { result } = await waitForResult(page);
    expect(result).toMatchObject({
      count,
      visibleCount: count / 2,
      dirtyBytes: count,
      visibilityBytes: count,
      visibleIndexBytes: (count / 2) * 4,
      modelKind: 'shado.model',
      vatKind: 'shado.dq-vat',
      vatVariant: 'float16',
    });
    expect(result?.vatFrames).toBeGreaterThan(1);
  });
}

test('offloads a 100k entity visibility pass without a main-thread entity walk', async ({
  page,
}) => {
  await page.goto(
    '/test?renderer=babylonjs&backend=webgl2&scenario=visibility-worker&count=100000'
  );
  const { result } = await waitForResult(page);
  expect(result).toMatchObject({
    count: 100_000,
    visibleCount: 100_000,
    requestedGeneration: 1,
    completedGeneration: 1,
    flagsLength: 100_000,
    firstFlag: 0xfd,
    lastFlag: 0xfd,
    crossOriginIsolated: true,
  });
  expect(result?.requestMs).toBeLessThan(10);
  expect(result?.workerDurationMs).toBeGreaterThan(0);
});

test('integrates 1M packed resident actors, WASM visibility, and a real VAT draw', async () => {
  test.slow();
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(
      'http://127.0.0.1:4177/test?renderer=babylonjs&backend=webgl2&scenario=million-actor-integration&count=1000000&visible=64&frames=8&warmup=2&cullHz=15'
    );
    const { result } = await waitForResult(page);
    expect(result).toMatchObject({
      actorCount: 1_000_000,
      visibleCount: 64,
      packedResidentBytes: 16_000_000,
      packedBytesPerActor: 16,
      compactVisibleBytes: 256,
      meshVertices: 1614,
      meshIndices: 1614,
      vatVertexInvocationsPerFrame: 103_296,
      vatKind: 'shado.dq-vat',
      vatVariant: 'float16',
      vatBones: 27,
      targetFps: 60,
      crossOriginIsolated: true,
      frameMs: {
        p50: expect.any(Number),
        p95: expect.any(Number),
      },
      gpuVatPassMs: {
        p50: expect.any(Number),
        p95: expect.any(Number),
      },
      visibility: {
        initialGeneration: 1,
        requestedGeneration: expect.any(Number),
        completedGeneration: expect.any(Number),
        candidateCount: 64,
        candidatePercent: expect.any(Number),
        copiedInputBytes: 1024,
        publishedFlagBytes: 0,
        bootstrap: {
          candidateCount: 64,
          copiedInputBytes: 1024,
          publishedFlagBytes: 0,
        },
        workerMs: { p50: expect.any(Number) },
        requestMs: { p50: expect.any(Number) },
      },
      uploads: {
        residentBytes: 16_000_000,
        residentCalls: 1,
      },
    });
    expect(result?.vatFrames).toBeGreaterThan(1);
    expect(result?.visibility.candidatePercent).toBeCloseTo(0.0064);
    expect(result?.visibility.requestedGeneration).toBeGreaterThan(1);
    expect(result?.visibility.scheduledSkips).toBeGreaterThan(0);
    expect(result?.visibility.bootstrap.hierarchyRebuildMs).toBeGreaterThan(0);
    expect(result?.renderChecksum).toBeGreaterThan(0);
  } finally {
    await browser.close();
  }
});

test('keeps 5M actors cold-backed while the bounded hot set remains live', async () => {
  test.slow();
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(
      'http://127.0.0.1:4177/test?renderer=babylonjs&backend=webgl2&scenario=five-million-opfs-integration&count=5000000&hot=100000&visible=64&frames=8&warmup=2&cullHz=15'
    );
    const { result } = await waitForResult(page);
    expect(result).toMatchObject({
      coldActorCount: 5_000_000,
      hotActorCount: 100_000,
      visibleCount: 64,
      packedBytesPerActor: 16,
      coldLogicalBytes: 80_000_000,
      hotPackedBytes: 1_600_000,
      allActorRowsInitialized: true,
      coldSentinelPersisted: true,
      framePathOpfsOperations: 0,
      sustained60Fps: true,
      crossOriginIsolated: true,
      opfsInitialize: {
        syncs: 1,
      },
      live: {
        actorCount: 100_000,
        visibleCount: 64,
        packedResidentBytes: 1_600_000,
        uploads: {
          residentBytes: 1_600_000,
          residentCalls: 1,
        },
      },
    });
    expect(result?.coldResidentBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    expect(result?.opfsInitialize.writebackBatches).toBeLessThan(20);
  } finally {
    await browser.close();
  }
});
