import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import { createShadoVatShowcase, type ShadoVatShowcaseController } from '@knervous/shado';
import { createMsdfNameplateLayer } from '@knervous/shado/msdf';
import { PlaygroundShowcaseActor, PlaygroundShowcaseContainer } from './showcase-actor';
import { createPlaygroundShowcaseUi } from './playground-ui';

const RAW_ROOT =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/';

const ASSETS = {
  models: `${RAW_ROOT}eq-demo/models/`,
  weapons: `${RAW_ROOT}eq-demo/weapons/`,
  armor: `${RAW_ROOT}eq-demo/armor/`,
  bakeWorker: `${RAW_ROOT}vat-bake-worker.js`,
} as const;

async function loadNameplateFont(scene: BABYLON.Scene): Promise<FontAsset> {
  const root = 'https://assets.babylonjs.com/fonts/';
  const response = await fetch(`${root}roboto-regular.json`);
  if (!response.ok) throw new Error(`Font metadata failed: HTTP ${response.status}`);
  return new FontAsset(await response.text(), `${root}roboto-regular.png`, scene);
}

/** Connect the decorated actor/container classes to a normal Babylon scene. */
export async function startShowcaseApplication(
  scene: BABYLON.Scene,
  camera: BABYLON.ArcRotateCamera,
  canvas: HTMLCanvasElement
): Promise<ShadoVatShowcaseController | undefined> {
  const font = await loadNameplateFont(scene);
  if (scene.isDisposed) return undefined;

  const ui = createPlaygroundShowcaseUi(canvas);
  const controller = createShadoVatShowcase(scene, camera, {
    // Playground's global BABYLON and npm packages are separate runtimes.
    // Passing the host namespace lets Shado share generated shader stores.
    babylon: BABYLON,
    actorClass: PlaygroundShowcaseActor,
    containerClass: PlaygroundShowcaseContainer,
    assetRoot: ASSETS.models,
    weaponRoot: ASSETS.weapons,
    armorRoot: ASSETS.armor,
    bakeWorkerUrl: ASSETS.bakeWorker,
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

  // Try these from the Playground console:
  //   await shadoShowcase.loadModel('bjs-dude')
  //   await shadoShowcase.addRandom(1000)
  //   shadoShowcase.setSelectedPublished('armor', 'plate')
  //   shadoShowcase.setSelectedPublished('lightingTone', 'warm')
  (globalThis as any).shadoShowcase = controller;

  scene.onDisposeObservable.addOnce(() => {
    if ((globalThis as any).shadoShowcase === controller) {
      delete (globalThis as any).shadoShowcase;
    }
    ui.dispose();
  });

  return controller;
}
