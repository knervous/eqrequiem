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
  buildBabylonLiteShadoShaderSources,
} from '../../dist/lite/index.js';

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

test('compiles storage-backed WGSL with and without VAT on a WebGPU device', async () => {
  const plain = await buildStorageWGSL(false);
  const vat = await buildStorageWGSL(true);
  const lite = buildLiteWGSL();
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  try {
    await page.goto(
      'http://127.0.0.1:4177/test?renderer=babylonjs&backend=webgl2&scenario=runtime-vat'
    );
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
      }
    );

    expect(result).toEqual([
      { name: 'plainVertex', errors: [] },
      { name: 'plainFragment', errors: [] },
      { name: 'vatVertex', errors: [] },
      { name: 'vatFragment', errors: [] },
      { name: 'liteVertex', errors: [] },
      { name: 'liteFragment', errors: [] },
    ]);
  } finally {
    await browser.close();
  }
});

test('runs the primary Babylon Lite + Shado storage path', async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-unsafe-webgpu'],
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
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
    const state = await page.evaluate(() => {
      const runtime = (globalThis as any).__shadoLite;
      return {
        instances: runtime.actors.instanceCount,
        visible: runtime.actors.getVisibleCount(),
        drawCalls: runtime.engine.drawCallCount,
      };
    });
    expect(state).toMatchObject({ instances: 324, visible: 324 });
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
    () => window.__shadoWorldRegions?.document.regions[0]?.center[0]
  );
  await page.getByRole('button', { name: 'Move X positive' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__shadoWorldRegions?.document.regions[0]?.center[0]))
    .toBe((beforeX ?? 0) + 1);
  await page.getByText('Phase and metadata').click();
  await page.getByLabel('Metadata JSON').fill('{"event":"browser-test"}');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByRole('option', { name: 'Test volume · trigger' })).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.__shadoWorldRegions?.document.regions[0]?.metadata))
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
    crossOriginIsolated: true,
  });
  expect(result?.requestMs).toBeLessThan(10);
  expect(result?.workerDurationMs).toBeGreaterThan(0);
});
