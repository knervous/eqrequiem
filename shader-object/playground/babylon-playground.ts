import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import {
  createShadoVatShowcase,
  createShadoShowcaseEnvironment,
  type ShadoVatShowcaseController,
} from '@knervous/shado';
import { createMsdfNameplateLayer } from '@knervous/shado/msdf';
import { createPlaygroundShowcaseUi } from './playground-ui';

const RAW_ROOT =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/';

// A Shado showcase needs source models, optional equipment textures, and the
// prebuilt NullEngine worker. Use same-origin URLs in production; raw GitHub
// URLs keep this copy/paste Playground self-contained.
const SHADO_ASSETS = {
  models: `${RAW_ROOT}eq-demo/models/`,
  weapons: `${RAW_ROOT}eq-demo/weapons/`,
  armor: `${RAW_ROOT}eq-demo/armor/`,
  bakeWorker: `${RAW_ROOT}vat-bake-worker.js`,
} as const;

function createCamera(scene: BABYLON.Scene, canvas: HTMLCanvasElement): BABYLON.ArcRotateCamera {
  const camera = new BABYLON.ArcRotateCamera(
    'showcase-camera',
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
  return camera;
}

function addLighting(scene: BABYLON.Scene): void {
  const sky = new BABYLON.HemisphericLight('sky', new BABYLON.Vector3(0.25, 1, 0.1), scene);
  sky.intensity = 1.05;

  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.45, -1, 0.35), scene);
  sun.intensity = 0.65;
}

async function loadNameplateFont(scene: BABYLON.Scene): Promise<FontAsset> {
  const fontRoot = 'https://assets.babylonjs.com/fonts/';
  const definition = await fetch(`${fontRoot}roboto-regular.json`).then(response => {
    if (!response.ok) throw new Error(`Font metadata failed: HTTP ${response.status}`);
    return response.text();
  });
  return new FontAsset(definition, `${fontRoot}roboto-regular.png`, scene);
}

async function startShadoShowcase(
  scene: BABYLON.Scene,
  canvas: HTMLCanvasElement,
  camera: BABYLON.ArcRotateCamera
): Promise<void> {
  const font = await loadNameplateFont(scene);
  if (scene.isDisposed) return;

  const ui = createPlaygroundShowcaseUi(canvas);

  // This is the complete application-facing Shado integration. The controller
  // imports animated GLBs, bakes their skeleton clips to a DQ/VAT atlas in the
  // worker, creates GPU-instanced actors, performs WASM culling, and exposes
  // friendly selection/equipment/animation mutators to the UI.
  const controller: ShadoVatShowcaseController = createShadoVatShowcase(scene, camera, {
    // Required in Babylon Playground because its global BABYLON namespace is a
    // separate runtime from npm modules. Shado bridges their shader stores.
    babylon: BABYLON,
    assetRoot: SHADO_ASSETS.models,
    weaponRoot: SHADO_ASSETS.weapons,
    armorRoot: SHADO_ASSETS.armor,
    bakeWorkerUrl: SHADO_ASSETS.bakeWorker,
    bakeConcurrency: 3,
    autoLoad: true,
    fontAsset: font,
    createNameplateLayer: (hostScene, actors, names, fontAsset) =>
      createMsdfNameplateLayer(hostScene, actors, names, fontAsset, {
        thickness: 0.02,
        depthTest: true,
      }),
    onStats: ui.onStats,
  });

  ui.attach(controller);

  // Useful public API examples to try from the Playground console:
  //   await shadoShowcase.loadModel('bjs-dude')
  //   await shadoShowcase.addRandom(1000)
  //   shadoShowcase.setCullingRange(300)
  //   shadoShowcase.setSelectedPublished('armor', 'plate')
  (globalThis as any).shadoShowcase = controller;

  scene.onDisposeObservable.addOnce(() => {
    if ((globalThis as any).shadoShowcase === controller) {
      delete (globalThis as any).shadoShowcase;
    }
    ui.dispose();
  });
}

class Playground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): BABYLON.Scene {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#0d1522ff');

    const camera = createCamera(scene, canvas);
    addLighting(scene);

    // Terrain and sky remain ordinary Babylon meshes/materials. Shado only
    // owns the animated actor pools rendered on top of this scene.
    createShadoShowcaseEnvironment(BABYLON, scene);

    void startShadoShowcase(scene, canvas, camera).catch(error => {
      console.error('[Shado VAT Showcase] startup failed', error);
    });
    return scene;
  }
}

export { Playground };
