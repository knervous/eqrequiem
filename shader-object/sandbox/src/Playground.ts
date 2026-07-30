import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import {
  createShadoVatShowcase,
  createShadoVatShowcaseUi,
  createShadoShowcaseEnvironment,
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
    const controller = createShadoVatShowcase(scene, camera, {
      babylon: BABYLON,
      assetRoot: '/shado/eq-demo/models/',
      weaponRoot: '/shado/eq-demo/weapons/',
      bakeWorkerUrl: '/shado/vat-bake-worker.js',
      bakeConcurrency: 3,
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
