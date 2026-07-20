import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import {
  createEqShowcase,
  createEqShowcaseUi,
  createShadoShowcaseEnvironment,
  type EqShowcaseStats,
} from '@knervous/shado';
import { createMsdfNameplateLayer } from '@knervous/shado/msdf';

const RAW_MODELS =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/eq-demo/models/';
const RAW_WEAPONS =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/eq-demo/weapons/';
const RAW_ARMOR =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/eq-demo/armor/';
const RAW_BAKE_WORKER =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/vat-bake-worker.js';

class Playground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): BABYLON.Scene {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#0d1522ff');

    const camera = new BABYLON.ArcRotateCamera(
      'eq-showcase-camera', -Math.PI / 2, 0.78, 54,
      new BABYLON.Vector3(0, 1.4, 0), scene
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

    void (async () => {
      const definition = await fetch('https://assets.babylonjs.com/fonts/roboto-regular.json').then(r => r.text());
      const font = new FontAsset(definition, 'https://assets.babylonjs.com/fonts/roboto-regular.png', scene);
      let ui: ReturnType<typeof createEqShowcaseUi> | undefined;
      const controller = createEqShowcase(scene, camera, {
        babylon: BABYLON,
        assetRoot: RAW_MODELS,
        weaponRoot: RAW_WEAPONS,
        armorRoot: RAW_ARMOR,
        bakeWorkerUrl: RAW_BAKE_WORKER,
        bakeConcurrency: 3,
        fontAsset: font,
        createNameplateLayer: (s, actors, names, fontAsset) =>
          createMsdfNameplateLayer(s, actors, names, fontAsset, { thickness: 0.02, depthTest: true }),
        onStats: (stats: EqShowcaseStats) => ui?.update(stats),
      });
      ui = createEqShowcaseUi(canvas, controller);
      scene.onDisposeObservable.add(() => ui?.dispose());
    })().catch(error => console.error('[Shado Showcase] startup failed', error));
    return scene;
  }
}

export { Playground };
