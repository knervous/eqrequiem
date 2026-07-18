import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import { ShadoInstanceContainer, TestClass, VERSION } from 'shader-object';
import { createMsdfNameplateLayer, NameplateData } from 'shader-object/msdf';
import {
  deserializeShadoModel,
  getBabylonSceneDataUrl,
  type ShadoDeserializedModel,
} from 'shader-object/preprocess/runtime';

const RAW_ASSET_ROOT =
  'https://raw.githubusercontent.com/knervous/eqrequiem/main/' +
  'shader-object/sandbox/public/shado/preprocessed/';
const ARACHNID_TEXTURE_URL = 'https://raw.githubusercontent.com/RaggarDK/Baby/baby/arachnid.png';

const BARBARIAN_NAMES = [
  'Agnar Stonefist',
  'Brynja Frostmane',
  'Cairn Ironhide',
  'Dagrun Wolfsong',
  'Eirik Emberborn',
  'Freya Stormward',
  'Gorm Redaxe',
  'Hakon Bearclaw',
  'Ingrid Skybreaker',
  'Jorund Ashwalker',
  'Kara Runeblade',
  'Leif Thunderhand',
  'Magna Oakshield',
  'Njal Winterborn',
  'Orin Deepdelver',
  'Ragna Steelheart',
  'Sigrid Dawnscar',
  'Torvald Blackwolf',
  'Ulfar Giantbane',
  'Yrsa Flamehair',
  'Bodil Raveneye',
  'Eydis Snowtide',
  'Finn Bloodoak',
  'Gudrun Highpeak',
  'Halfdan Coldiron',
  'Ivar Stonewake',
  'Kelda Mistborn',
  'Rolf Grimward',
  'Solveig Goldaxe',
  'Vidar Northwind',
] as const;

const ARACHNID_NAMES = [
  'Silkfang',
  'Webmaw',
  'Gloomspinner',
  'Cavern Widow',
  'Venomtip',
  'Duskskitter',
  'Needleleg',
  'Ashweb',
  'Crypt Crawler',
  'Nightweaver',
  'Broodwatcher',
  'Fangling',
  'Mirestalker',
  'Shadowspinner',
  'Deepweb',
  'Chitin Queen',
] as const;

const ARMOR_PALETTE = [
  [0.9, 0.18, 0.12, 1],
  [0.15, 0.42, 0.95, 1],
  [0.12, 0.7, 0.34, 1],
  [0.72, 0.25, 0.88, 1],
  [0.95, 0.62, 0.12, 1],
  [0.12, 0.78, 0.82, 1],
  [0.92, 0.32, 0.58, 1],
  [0.65, 0.68, 0.75, 1],
] as const;

type LoadedPool = {
  container: ShadoInstanceContainer<TestClass>;
  nameplates: NameplateData;
  nameplateLayer: BABYLON.Mesh;
};

class Playground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): BABYLON.Scene {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#101722ff');

    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 3,
      54,
      new BABYLON.Vector3(0, 2, 0),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 16;
    camera.upperRadiusLimit = 90;
    camera.wheelPrecision = 40;

    const skyLight = new BABYLON.HemisphericLight(
      'sky-light',
      new BABYLON.Vector3(0.2, 1, 0.1),
      scene
    );
    skyLight.intensity = 1.05;

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 70, height: 50 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial('ground-material', scene);
    groundMaterial.diffuseColor = BABYLON.Color3.FromHexString('#243249');
    groundMaterial.specularColor = BABYLON.Color3.Black();
    ground.material = groundMaterial;

    void Playground.LoadDemo(scene, engine, camera).catch(error => {
      console.error('Shader Object Playground setup failed', error);
    });

    return scene;
  }

  private static async LoadDemo(
    scene: BABYLON.Scene,
    engine: BABYLON.Engine,
    camera: BABYLON.ArcRotateCamera
  ): Promise<void> {
    // Babylon normally rebuilds serialized texture URLs from their short name.
    // Our packed scene contains a full raw GitHub URL, so preserve it.
    BABYLON.Texture.UseSerializedUrlIfAny = true;

    const fontAsset = await Playground.LoadFont(scene);
    await ShadoInstanceContainer.initialize(engine, {
      backend: 'datatex',
      wasm: false,
      extra: TestClass,
    });
    await NameplateData.initialize(engine, { wasm: false });

    const [barbarian, arachnid] = await Promise.all([
      Playground.LoadPool(scene, engine, fontAsset, 'barbarian'),
      Playground.LoadPool(scene, engine, fontAsset, 'arr'),
    ]);

    Playground.AddBarbarians(barbarian);
    Playground.AddArachnids(arachnid);

    const updateVisibility = (): void => {
      barbarian.container.frustumCull(camera, 3, 100);
      arachnid.container.frustumCull(camera, 3, 100);
    };
    scene.onBeforeRenderObservable.add(updateVisibility);
    updateVisibility();

    (
      globalThis as typeof globalThis & {
        shadoPlayground?: Record<string, unknown>;
      }
    ).shadoPlayground = {
      version: VERSION,
      rawAssetRoot: RAW_ASSET_ROOT,
      arachnidTextureUrl: ARACHNID_TEXTURE_URL,
      barbarians: barbarian,
      arachnids: arachnid,
      scene,
    };
  }

  private static async LoadFont(scene: BABYLON.Scene): Promise<FontAsset> {
    const definitionUrl = 'https://assets.babylonjs.com/fonts/roboto-regular.json';
    const atlasUrl = 'https://assets.babylonjs.com/fonts/roboto-regular.png';
    const response = await fetch(definitionUrl);
    if (!response.ok) {
      throw new Error(`Unable to load the MSDF font: ${response.status}`);
    }
    return new FontAsset(await response.text(), atlasUrl, scene);
  }

  private static async LoadPool(
    scene: BABYLON.Scene,
    engine: BABYLON.Engine,
    fontAsset: FontAsset,
    modelName: 'barbarian' | 'arr'
  ): Promise<LoadedPool> {
    const packed = await deserializeShadoModel(
      {
        manifestUrl: `${RAW_ASSET_ROOT}models.json`,
        modelName,
      },
      {
        animation: true,
        vat: 'auto',
        gpu: {
          textureHalfFloat: engine.getCaps().textureHalfFloatRender === true,
        },
      }
    );

    if (modelName === 'arr') {
      Playground.PointArachnidTexturesAtGitHub(packed);
    }

    const sceneDataUrl = packed.model && getBabylonSceneDataUrl(packed.model);
    if (!sceneDataUrl) {
      throw new Error(`${modelName} has no packed Babylon scene`);
    }

    const imported = await BABYLON.ImportMeshAsync(sceneDataUrl, scene);
    const meshes = imported.meshes.filter(mesh => mesh.getTotalVertices() > 0) as BABYLON.Mesh[];
    const skeleton = imported.skeletons[0] ?? meshes.find(mesh => mesh.skeleton)?.skeleton;
    if (!meshes.length || !skeleton) {
      throw new Error(`${modelName} has no skinned mesh`);
    }

    const nameplates = new NameplateData(engine, fontAsset);
    const container = new ShadoInstanceContainer<TestClass>(engine);
    container.nameplates = nameplates;
    await container.attachMeshes(scene, meshes, skeleton, {
      merge: modelName === 'barbarian',
      replaceMaterial: true,
      disposeOriginalMaterial: false,
      prebakedVat: packed.vat,
      vatOptions: {
        useHalfDQ: packed.vatVariant === 'float16',
        defaultFPS: 30,
        ...(modelName === 'arr'
          ? {
              manualAnimationRanges: [
                { from: 0, to: 33, name: 'Idle' },
                { from: 33, to: 61, name: 'Walk' },
                { from: 63, to: 91, name: 'Attack' },
                { from: 93, to: 130, name: 'Death' },
              ],
            }
          : {}),
      },
    });

    const nameplateLayer = createMsdfNameplateLayer(scene, container, nameplates, fontAsset, {
      thickness: 0.02,
      depthTest: true,
    });
    return { container, nameplates, nameplateLayer };
  }

  private static PointArachnidTexturesAtGitHub(packed: ShadoDeserializedModel): void {
    const serializedScene = packed.model?.scene as
      | {
          materials?: Array<{
            diffuseTexture?: { name?: string; url?: string };
          }>;
        }
      | undefined;
    for (const material of serializedScene?.materials ?? []) {
      if (!material.diffuseTexture) continue;
      material.diffuseTexture.name = ARACHNID_TEXTURE_URL;
      material.diffuseTexture.url = ARACHNID_TEXTURE_URL;
    }
  }

  private static AddBarbarians(pool: LoadedPool): void {
    const actors = pool.container.addInstances(BARBARIAN_NAMES.length, index => {
      return BARBARIAN_NAMES[index];
    });
    actors.forEach((actor, index) => {
      const column = index % 10;
      const row = Math.floor(index / 10);
      const color = ARMOR_PALETTE[index % ARMOR_PALETTE.length];
      actor.translation = new Float32Array([(column - 4.5) * 3.2, 0, (row - 2.8) * 4, 1]);
      actor.rotation = new Float32Array([0, 0, 0, 1]);
      actor.color = new Float32Array(color);
      actor.nameWorldPerEM = 0.42;
      actor.nameLiftWorld = 3.4;
      actor.nameplateColor = new Float32Array([1, 0.96, 0.72, 1]);
    });
  }

  private static AddArachnids(pool: LoadedPool): void {
    const actors = pool.container.addInstances(ARACHNID_NAMES.length, index => {
      return ARACHNID_NAMES[index];
    });
    actors.forEach((actor, index) => {
      const column = index % 8;
      const row = Math.floor(index / 8);
      actor.translation = new Float32Array([(column - 3.5) * 4.2, 0, 8 + row * 5, 0.72]);
      actor.rotation = new Float32Array([0, 0, 0, 1]);
      actor.color = new Float32Array([0.5 + (index % 3) * 0.12, 0.25, 0.65, 1]);
      actor.nameWorldPerEM = 0.5;
      actor.nameLiftWorld = 2.8;
      actor.nameplateColor = new Float32Array([0.78, 0.9, 1, 1]);
    });
  }
}

export { Playground };
