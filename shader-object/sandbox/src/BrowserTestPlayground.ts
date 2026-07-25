import * as BABYLON from '@babylonjs/core';
import { ShadoInstanceSoA, VATBuilder } from '@knervous/shado';
import { deserializeShadoModel } from '@knervous/shado/preprocess/runtime';
import { ShadoEntityVisibilityWorker } from '@knervous/shado/world';

type BrowserTestState = {
  status: 'running' | 'passed' | 'failed';
  scenario: string;
  result?: Record<string, unknown>;
  error?: string;
};

declare global {
  interface Window {
    __shadoBrowserTest?: BrowserTestState;
  }
}

export class BrowserTestPlayground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    _canvas: HTMLCanvasElement
  ): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
    const camera = new BABYLON.FreeCamera('test-camera', new BABYLON.Vector3(0, 0, -5), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    const scenario = new URLSearchParams(location.search).get('scenario') ?? 'runtime-vat';
    window.__shadoBrowserTest = { status: 'running', scenario };

    queueMicrotask(async () => {
      try {
        const result =
          scenario === 'runtime-vat'
            ? runRuntimeVatBake(scene)
            : scenario === 'visibility-worker'
              ? await runVisibilityWorkerScale()
              : await runPreprocessedScale();
        window.__shadoBrowserTest = { status: 'passed', scenario, result };
      } catch (error) {
        window.__shadoBrowserTest = {
          status: 'failed',
          scenario,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        };
      }
    });
    return scene;
  }
}

async function runVisibilityWorkerScale(): Promise<Record<string, unknown>> {
  const count = Number(new URLSearchParams(location.search).get('count') ?? 100_000);
  const worker = await ShadoEntityVisibilityWorker.create(
    {
      tiles: {
        x: [],
        z: [],
        size: 1,
        originX: 0,
        originZ: 0,
      },
    },
    { capacity: count }
  );
  try {
    // This is the one-time projection population, outside the render hot loop.
    worker.projection.load({
      count,
      positionX: new Float32Array(count).fill(1),
      positionY: new Float32Array(count),
      positionZ: new Float32Array(count),
      radius: new Float32Array(count).fill(1),
    });
    const planes = new Float32Array([
      1, 0, 0, 100, -1, 0, 0, 100, 0, 1, 0, 100, 0, -1, 0, 100, 0, 0, 1, 100, 0, 0, -1, 100,
    ]);
    const requestStarted = performance.now();
    const requestedGeneration = worker.request(planes, [], {
      camera: [1, 0, 0],
      outsideWorldVisible: true,
      radiusScale: 2,
    });
    const requestMs = performance.now() - requestStarted;
    const result = await waitForVisibility(worker);
    return {
      count,
      visibleCount: result.visibleIndices.length,
      requestedGeneration,
      completedGeneration: result.generation,
      requestMs,
      workerDurationMs: result.workerDurationMs,
      crossOriginIsolated,
    };
  } finally {
    worker.dispose();
  }
}

async function waitForVisibility(
  worker: ShadoEntityVisibilityWorker
): Promise<NonNullable<ReturnType<ShadoEntityVisibilityWorker['acquireLatest']>>> {
  const deadline = performance.now() + 30_000;
  while (performance.now() < deadline) {
    const result = worker.acquireLatest();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for the visibility worker');
}

function runRuntimeVatBake(scene: BABYLON.Scene): Record<string, unknown> {
  const mesh = BABYLON.MeshBuilder.CreateBox('runtime-vat-box', { size: 1 }, scene);
  const skeleton = new BABYLON.Skeleton('runtime-vat-skeleton', 'runtime-vat-skeleton', scene);
  const root = new BABYLON.Bone('root', skeleton, null, BABYLON.Matrix.Identity());
  mesh.skeleton = skeleton;

  const animation = new BABYLON.Animation(
    'root-motion',
    'position',
    30,
    BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
    BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
  );
  animation.setKeys([
    { frame: 0, value: BABYLON.Vector3.Zero() },
    { frame: 2, value: new BABYLON.Vector3(0, 0.25, 0) },
  ]);
  const group = new BABYLON.AnimationGroup('runtime-clip', scene);
  group.addTargetedAnimation(animation, root);

  const started = performance.now();
  const vat = VATBuilder.buildFromScene(scene as any, mesh as any, skeleton as any, {
    animationGroups: [group as any],
    detectScale: false,
    useHalfDQ: false,
  });
  const packed = vat.toPacked();
  return {
    elapsedMs: performance.now() - started,
    frames: packed.framesTotal,
    bones: packed.bones,
    pixels: packed.pixels.length,
    componentType: packed.componentType,
  };
}

async function runPreprocessedScale(): Promise<Record<string, unknown>> {
  const count = Number(new URLSearchParams(location.search).get('count') ?? 10_000);
  const started = performance.now();
  const loaded = await deserializeShadoModel(
    { modelUrl: '/shado/preprocessed/models/barbarian.model.json.gz' },
    { vat: 'float16', gpu: { textureHalfFloat: true } }
  );

  const soa = new ShadoInstanceSoA();
  soa.beginVisibilityPass(count);
  for (let i = 0; i < count; i += 2) soa.appendVisible(i);
  soa.finishVisibilityPass(Math.ceil(count / 2));
  return {
    elapsedMs: performance.now() - started,
    count,
    visibleCount: soa.visibleCount,
    dirtyBytes: soa.dirtyFlags.byteLength,
    visibilityBytes: soa.visibilityFlags.byteLength,
    visibleIndexBytes: soa.visibleActorIndices.byteLength,
    modelKind: loaded.model?.kind,
    vatKind: loaded.vat?.kind,
    vatVariant: loaded.vatVariant,
    vatFrames: loaded.vat?.framesTotal,
  };
}
