import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import {
  createShadoVatShowcase,
  createShadoVatShowcaseUi,
  createShadoShowcaseEnvironment,
  EQ_SHOWCASE_MODELS,
  BABYLON_SHOWCASE_MODELS,
  type ShadoVatShowcaseStats,
} from '@knervous/shado';
import { createMsdfNameplateLayer } from '@knervous/shado/msdf';
import { createShowcaseOpfsBacking } from './ShowcaseOpfsBacking';

export class Playground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    canvas: HTMLCanvasElement
  ): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#0d1522ff');
    (globalThis as any).__shadoScene = scene;
    delete (globalThis as any).__shadoWorld;
    const engineInstrumentation = new EngineInstrumentation(engine);
    engineInstrumentation.captureGPUFrameTime = true;

    const camera = new BABYLON.ArcRotateCamera(
      'eq-showcase-camera',
      -Math.PI / 2,
      0.78,
      54,
      new BABYLON.Vector3(0, 1.4, 0),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 130;
    camera.wheelPrecision = 40;
    camera.panningSensibility = 55;

    const sky = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0.25, 1, 0.1), scene);
    sky.intensity = 1.05;
    const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.45, -1, 0.35), scene);
    sun.intensity = 0.65;

    createShadoShowcaseEnvironment(BABYLON, scene);

    const fontDefinition = await fetch(
      'https://assets.babylonjs.com/fonts/roboto-regular.json'
    ).then(r => r.text());
    const fontAsset = new FontAsset(
      fontDefinition,
      'https://assets.babylonjs.com/fonts/roboto-regular.png',
      scene
    );
    let ui: ReturnType<typeof createShadoVatShowcaseUi> | undefined;
    // `?models=hum,ogm` pins the catalog. The auto-loader otherwise races and a
    // run ends up with a random three of thirty-three loaded, which makes two
    // runs of the same scene incomparable — waiting for all of them instead
    // costs many minutes of VAT baking.
    const requestedModels = new URLSearchParams(location.search).get('models');
    const modelCatalog = requestedModels
      ? [...EQ_SHOWCASE_MODELS, ...BABYLON_SHOWCASE_MODELS].filter(model =>
          requestedModels.split(',').includes(model.code))
      : undefined;
    const controller = createShadoVatShowcase(scene, camera, {
      models: modelCatalog,
      babylon: BABYLON,
      assetRoot: '/shado/eq-demo/models/',
      weaponRoot: '/shado/eq-demo/weapons/',
      bakeWorkerUrl: '/shado/vat-bake-worker.js',
      bakeConcurrency: 3,
      // Phase 3 on the common instanced VAT path: opt in from the URL so the
      // baseline can be compared against itself on the same assets.
      vatPosePalette: new URLSearchParams(location.search).get('palette') === '1',
      // Slots cover peak *visible* actors, not population — this sandbox culls
      // to a 600 m range, so "Add 100,000" still draws far fewer. 20k slots is
      // ~43 MB; `stats.posePalette.overflowed` says when a view outgrew it.
      vatPosePaletteCapacity: Math.max(
        1,
        Number(new URLSearchParams(location.search).get('paletteCapacity')) || 20_000,
      ),
      fontAsset,
      createNameplateLayer: (s, actors, names, font) =>
        createMsdfNameplateLayer(s, actors, names, font, {
          thickness: 0.02,
          depthTest: true,
        }),
      onStats: (stats: ShadoVatShowcaseStats) => ui?.update(stats),
    });
    // Deliberately expose the live scene/controller in the local sandbox. It
    // keeps animation/VAT diagnostics inspectable without affecting the shared
    // online Playground module or the production library API.
    (globalThis as any).__shadoShowcase = controller;
    // The comment above says scene *and* controller; the scene handle is what
    // lets a driven browser read compiled shaders and engine timings back out.
    (globalThis as any).__shadoShowcaseScene = scene;
    const opfsBacking = createShowcaseOpfsBacking(controller);
    ui = createShadoVatShowcaseUi(
      canvas,
      controller,
      {
        renderBackend: engine.isWebGPU ? 'WebGPU' : 'WebGL2',
        storageBackend: engine.isWebGPU ? 'StorageBuffer' : 'DataTexture',
        sample: () => {
          const gpuNanoseconds = engineInstrumentation.gpuFrameTimeCounter.current;
          return {
            fps: engine.getFps(),
            frameMs: engine.getDeltaTime(),
            gpuMs: gpuNanoseconds > 0 ? gpuNanoseconds / 1_000_000 : undefined,
          };
        },
      },
      {
        deferredStorage: opfsBacking,
      }
    );
    scene.onDisposeObservable.add(() => {
      ui?.dispose();
      void opfsBacking.dispose();
      engineInstrumentation.dispose();
    });
    return scene;
  }
}
