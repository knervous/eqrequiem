import * as fantasyNameGenerator from 'fantasy-name-generator';
import {
  ShadoInstanceContainer,
  TestClass,
} from 'shado';
import { createMsdfNameplateLayer, NameplateData } from 'shado/msdf';
import {
  deserializeShadoModel,
  getBabylonSceneDataUrl,
  type ShadoDeserializedModel,
  type ShadoModelManifestDocument,
  type ShadoModelManifestEntry,
} from 'shado/preprocess/runtime';
import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import * as BABYLON from '@babylonjs/core';
import { ShowInspector } from '@babylonjs/inspector';
import '@babylonjs/loaders';
import * as GUI from '@babylonjs/gui';

type LoadedActorPool = {
  container: ShadoInstanceContainer<TestClass>;
  nameplates: NameplateData;
  nameplateLayer?: BABYLON.Mesh;
};

type ActorControls = {
  readonly instanceCount: number;
  readonly visibleCount: number;
  readonly isLoaded: boolean;
  readonly isLoading: boolean;
  readonly nameplatesEnabled: boolean;
  addInstances(count: number): Promise<void>;
  removeRandomInstance(): Promise<void>;
  shuffleInstances(): Promise<void>;
  setNameplatesEnabled(enabled: boolean): void;
  frustumCull(camera: BABYLON.Camera, baseRadius: number, radius: number): void;
};

function randomFantasyName(): string {
  const name = fantasyNameGenerator.nameByRace('demon');
  return typeof name === 'string' ? name : `Demon ${Math.floor(Math.random() * 100000)}`;
}

export class Playground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    canvas: HTMLCanvasElement
  ): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.ArcRotateCamera(
      'orbitCam',
      -Math.PI / 2,
      Math.PI / 3,
      35,
      BABYLON.Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 10;
    camera.upperRadiusLimit = 100;
    camera.wheelPrecision = 50;
    camera.panningSensibility = 50;

    const light = new BABYLON.HemisphericLight('light1', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.9;

    const logShaderCode = false;
    const logAscCode = false;
    const msdfNameplatesSupported = true;
    const query = new URLSearchParams(window.location.search);
    const usePreprocessed = query.get('preprocessed') !== 'false';
    const usePreprocessedAnimation = query.get('animation') !== 'false';
    const preferredVat = query.get('vat') as 'float16' | 'float32' | null;

    let shadoInitPromise: Promise<void> | undefined;
    let fontAssetPromise: Promise<FontAsset> | undefined;
    let preprocessedManifestPromise: Promise<ShadoModelManifestDocument | undefined> | undefined;
    const preprocessedModelPromises = new Map<string, Promise<ShadoDeserializedModel | undefined>>();
    let barbarianPool: LoadedActorPool | undefined;
    let arrPool: LoadedActorPool | undefined;
    let barbarianLoading = false;
    let arrLoading = false;
    let nameplatesEnabled = true;
    let barbarianLoadPromise: Promise<LoadedActorPool> | undefined;
    let arrLoadPromise: Promise<LoadedActorPool> | undefined;

    const loadPreprocessedManifest = async () => {
      if (!usePreprocessed) return undefined;
      preprocessedManifestPromise ??= fetch('/shado/preprocessed/models.json')
        .then(response => (response.ok ? response.json() : undefined))
        .then(manifest => manifest as ShadoModelManifestDocument | undefined)
        .catch(error => {
          console.warn('[Playground] preprocessed manifest unavailable; using on-the-fly path', error);
          return undefined;
        });
      return preprocessedManifestPromise;
    };

    const getPreprocessedModel = async (name: string) => {
      const manifest = await loadPreprocessedManifest();
      return manifest?.models?.[name];
    };

    const loadPreprocessedModel = async (name: string) => {
      if (!usePreprocessed) return undefined;
      const manifest = await loadPreprocessedManifest();
      const model = manifest?.models?.[name];
      if (!manifest || !model?.artifacts?.model) return undefined;
      const cacheKey = [
        name,
        preferredVat ?? 'auto',
        usePreprocessedAnimation ? 'animation' : 'no-animation',
        engine.getCaps().textureHalfFloat ? 'half' : 'full',
      ].join(':');
      let promise = preprocessedModelPromises.get(cacheKey);
      if (!promise) {
        promise = deserializeShadoModel(
          {
            manifest,
            modelName: name,
            model,
            baseUrl: '/shado/preprocessed/',
          },
          {
            animation: usePreprocessedAnimation,
            vat: preferredVat ?? 'auto',
            gpu: { textureHalfFloat: !!engine.getCaps().textureHalfFloat },
            reducers: false,
            shaders: false,
          }
        ).catch(error => {
          console.warn('[Playground] preprocessed model unavailable; using source model', {
            model: name,
            error,
          });
          return undefined;
        });
        preprocessedModelPromises.set(cacheKey, promise);
      }
      return promise;
    };

    const importPreprocessedScene = async (preprocessed?: ShadoDeserializedModel) => {
      const sceneUrl = preprocessed?.model ? getBabylonSceneDataUrl(preprocessed.model) : undefined;
      if (!sceneUrl) return undefined;
      const result = await BABYLON.ImportMeshAsync(sceneUrl, scene);
      return { preprocessed, result };
    };

    const loadPrecompiledWasmMode = async (model?: ShadoModelManifestEntry) => {
      const wasmPath = model?.artifacts?.asm;
      if (!usePreprocessed || !wasmPath) return false;
      const response = await fetch(`/shado/preprocessed/${wasmPath}`);
      if (!response.ok) return false;
      return { mode: 'precompiled' as const, module: await response.arrayBuffer() };
    };

    const ensureShadoInitialized = async () => {
      shadoInitPromise ??= (async () => {
        const barbarianModel = await getPreprocessedModel('barbarian');
        const wasm = await loadPrecompiledWasmMode(barbarianModel);
        await ShadoInstanceContainer.initialize(engine, {
          logAscCode,
          logShaderCode,
          extra: TestClass,
          wasm,
        });
        await NameplateData.initialize(scene.getEngine() as BABYLON.Engine, {
          logShaderCode,
          logAscCode,
          wasm,
        });
      })();
      return shadoInitPromise;
    };

    const ensureFontAsset = async () => {
      fontAssetPromise ??= (async () => {
        const sdfFontDefinition = await (
          await fetch('https://assets.babylonjs.com/fonts/roboto-regular.json')
        ).text();
        return new FontAsset(
          sdfFontDefinition,
          'https://assets.babylonjs.com/fonts/roboto-regular.png',
          scene
        );
      })();
      return fontAssetPromise;
    };

    const createPool = async () => {
      await ensureShadoInitialized();
      const fontAsset = await ensureFontAsset();
      const nameplates = new NameplateData(scene.getEngine() as BABYLON.Engine, fontAsset);
      const container = new ShadoInstanceContainer<TestClass>(
        scene.getEngine() as BABYLON.Engine
      );
      container.nameplates = nameplates;
      return { container, nameplates, fontAsset };
    };

    const ensureBarbarianLoaded = async (): Promise<LoadedActorPool> => {
      if (barbarianPool) return barbarianPool;
      barbarianLoadPromise ??= (async () => {
        barbarianLoading = true;
        try {
          const modelConfig = await getPreprocessedModel('barbarian');
          const preprocessed = await loadPreprocessedModel('barbarian');
          console.debug('[Playground] loading Barbarian assets', {
            preprocessed: !!modelConfig,
            packed: !!preprocessed?.model,
            vat: preprocessed?.vatVariant,
            usePreprocessed,
          });
          const { container, nameplates, fontAsset } = await createPool();
          const packedImport = await importPreprocessedScene(preprocessed);
          let meshes: BABYLON.Mesh[];
          let skeleton: BABYLON.Skeleton | undefined;
          if (packedImport) {
            meshes = packedImport.result.meshes.filter(m => m.getTotalVertices() > 0) as BABYLON.Mesh[];
            skeleton = packedImport.result.skeletons[0] as BABYLON.Skeleton | undefined;
          } else {
            const source =
              modelConfig && 'url' in modelConfig.import
                ? modelConfig.import.url
                : 'https://eqrequiem.blob.core.windows.net/dev/barbarian_1.glb';
            const importResult = await BABYLON.LoadAssetContainerAsync(source, scene, undefined);
            meshes = importResult.rootNodes[0]
              .getChildMeshes(false)
              .filter(m => m.getTotalVertices() > 0) as BABYLON.Mesh[];
            skeleton = importResult.skeletons[0] as BABYLON.Skeleton | undefined;
            importResult.addAllToScene();
          }
          if (!skeleton) throw new Error('Barbarian model has no skeleton');

          await container.attachMeshes(scene, meshes as any, skeleton as any, {
            replaceMaterial: modelConfig?.runtime?.replaceMaterial ?? true,
            disposeOriginalMaterial: modelConfig?.runtime?.disposeOriginalMaterial ?? false,
            merge: modelConfig?.runtime?.merge ?? true,
            logOnCompile: true,
            prebakedVat: preprocessed?.vat,
            vatOptions: {
              useHalfDQ: true,
              ...(modelConfig?.vat?.options ?? {}),
            },
            picking: {
              radius: 1.25,
              onPick: result => {
                console.debug('[Playground] picked barbarian instance', {
                  index: result.index,
                  engine: result.engine,
                  point: result.pickedPoint.asArray(),
                  translation: Array.from((result.instance as any).translation ?? []),
                });
              },
              onMiss: () => {
                console.debug('[Playground] missed barbarian instance');
              },
            },
          });

          const nameplateLayer = msdfNameplatesSupported
            ? createMsdfNameplateLayer(scene, container, nameplates, fontAsset, {
                debug: true,
                thickness: 0.02,
              })
            : undefined;
          nameplateLayer?.setEnabled(nameplatesEnabled);
          barbarianPool = { container, nameplates, nameplateLayer };
          (window as any).instanceContainer = container;
          (window as any).instancePool = container;
          console.debug('[Playground] Barbarian ready for instances');
          return barbarianPool;
        } finally {
          barbarianLoading = false;
        }
      })();
      return barbarianLoadPromise;
    };

    const ensureArrLoaded = async (): Promise<LoadedActorPool> => {
      if (arrPool) return arrPool;
      arrLoadPromise ??= (async () => {
        arrLoading = true;
        try {
          const modelConfig = await getPreprocessedModel('arr');
          const preprocessed = await loadPreprocessedModel('arr');
          console.debug('[Playground] loading Arr assets', {
            preprocessed: !!modelConfig,
            packed: !!preprocessed?.model,
            vat: preprocessed?.vatVariant,
            usePreprocessed,
          });
          const { container, nameplates, fontAsset } = await createPool();
          const arrImport =
            modelConfig && modelConfig.import.kind === 'scene-loader'
              ? modelConfig.import
              : {
                  kind: 'scene-loader' as const,
                  rootUrl: 'https://raw.githubusercontent.com/RaggarDK/Baby/baby/',
                  fileName: 'arr.babylon',
                };
          const packedImport = await importPreprocessedScene(preprocessed);
          const importResult =
            packedImport?.result ??
            (await BABYLON.SceneLoader.ImportMeshAsync(
              arrImport.meshNames ?? '',
              arrImport.rootUrl,
              arrImport.fileName,
              scene
            ));
          const mesh = importResult.meshes.find(m => m.getTotalVertices() > 0) as BABYLON.Mesh;
          mesh.position.x = -5;
          await container.attachMeshes(scene, [mesh] as any, mesh.skeleton as any, {
            replaceMaterial: modelConfig?.runtime?.replaceMaterial ?? true,
            disposeOriginalMaterial: modelConfig?.runtime?.disposeOriginalMaterial ?? false,
            merge: modelConfig?.runtime?.merge ?? false,
            prebakedVat: preprocessed?.vat,
            vatOptions: {
              useHalfDQ: true,
              ...(modelConfig?.vat?.options ?? {
                defaultFPS: 30,
                manualAnimationRanges: [
                  { from: 0, to: 33, name: 'Animation_0' },
                  { from: 33, to: 61, name: 'Animation_1' },
                  { from: 63, to: 91, name: 'Animation_2' },
                  { from: 93, to: 130, name: 'Animation_3' },
                ],
              }),
            },
            picking: {
              radius: 1.25,
              onPick: result => {
                console.debug('[Playground] picked arr instance', {
                  index: result.index,
                  engine: result.engine,
                  point: result.pickedPoint.asArray(),
                  translation: Array.from((result.instance as any).translation ?? []),
                });
              },
              onMiss: () => {
                console.debug('[Playground] missed arr instance');
              },
            },
          });

          const nameplateLayer = msdfNameplatesSupported
            ? createMsdfNameplateLayer(scene, container, nameplates, fontAsset, {
                debug: true,
                thickness: 0.02,
              })
            : undefined;
          nameplateLayer?.setEnabled(nameplatesEnabled);
          arrPool = { container, nameplates, nameplateLayer };
          (window as any).instanceContainer2 = container;
          (window as any).instancePool2 = container;
          console.debug('[Playground] Arr ready for instances');
          return arrPool;
        } finally {
          arrLoading = false;
        }
      })();
      return arrLoadPromise;
    };

    const makeControls = (
      label: string,
      getPool: () => LoadedActorPool | undefined,
      getLoading: () => boolean,
      ensureLoaded: () => Promise<LoadedActorPool>
    ): ActorControls => ({
      get instanceCount() {
        return getPool()?.container.instanceCount ?? 0;
      },
      get visibleCount() {
        return getPool()?.container.visibleCount ?? 0;
      },
      get isLoaded() {
        return !!getPool();
      },
      get isLoading() {
        return getLoading();
      },
      get nameplatesEnabled() {
        return nameplatesEnabled;
      },
      async addInstances(count: number) {
        const pool = await ensureLoaded();
        const created = pool.container.addInstances(count, randomFantasyName);
        for (const actor of created as any[]) {
          actor.nameWorldPerEM = 0.55;
          actor.nameLiftWorld = 3.5;
          actor.nameplateColor = new Float32Array([1.0, 0.96, 0.65, 1.0]);
        }
        pool.container.frustumCull(scene.activeCamera! as any, 5, 100);
        console.debug(`[Playground] added ${count} ${label}`, {
          instanceCount: pool.container.instanceCount,
          visibleCount: pool.container.visibleCount,
          glyphCount: pool.nameplates.glyphCount(),
        });
      },
      async removeRandomInstance() {
        const pool = getPool();
        if (!pool) return;
        pool.container.removeRandomInstance();
      },
      async shuffleInstances() {
        const pool = getPool();
        if (!pool) return;
        pool.container.shuffleInstances(pool.container.vat?.clips ?? []);
      },
      setNameplatesEnabled(enabled: boolean) {
        nameplatesEnabled = enabled;
        barbarianPool?.nameplateLayer?.setEnabled(enabled);
        arrPool?.nameplateLayer?.setEnabled(enabled);
      },
      frustumCull(activeCamera: BABYLON.Camera, baseRadius: number, radius: number) {
        getPool()?.container.frustumCull(activeCamera as any, baseRadius, radius);
      },
    });

    const barbarianControls = makeControls(
      'Barbarian',
      () => barbarianPool,
      () => barbarianLoading,
      ensureBarbarianLoaded
    );
    const arrControls = makeControls(
      'Arr',
      () => arrPool,
      () => arrLoading,
      ensureArrLoaded
    );

    const {
      countLabel,
      perfLabel,
      visibleCountLabel,
      cullPerfLabel,
      radiusSlider,
      fpsLabel,
      loadStatusLabel,
    } = buildUi(scene, barbarianControls, arrControls);

    (scene as any).__clock = 0;
    scene.onBeforeRenderObservable.add(() => {
      const deltaTime = scene.getEngine().getDeltaTime() * 0.001;
      (scene as any).__clock += deltaTime;

      const t0 = performance.now();
      const t1 = performance.now();
      const tickMs = t1 - t0;

      const radius = radiusSlider.value | 0;
      barbarianControls.frustumCull(scene.activeCamera!, 5, radius);
      arrControls.frustumCull(scene.activeCamera!, 5, radius);
      const cullTickMs = performance.now() - t1;

      const n1 = barbarianControls.instanceCount | 0;
      const n2 = arrControls.instanceCount | 0;
      const v1 = barbarianControls.visibleCount | 0;
      const v2 = arrControls.visibleCount | 0;

      countLabel.text = `Instances: Barbarian=${n1}, Arr=${n2}`;
      perfLabel.text = `Move Tick: ${tickMs.toFixed(2)} ms`;
      visibleCountLabel.text = `Visible: Barbarian=${v1}, Arr=${v2}`;
      cullPerfLabel.text = `Frustum Culling (CPU): ${cullTickMs.toFixed(2)} ms`;
      fpsLabel.text = `FPS Engine: ${engine.getFps().toFixed(2)}`;
      loadStatusLabel.text = [
        usePreprocessed ? 'preprocessed=on' : 'preprocessed=off',
        barbarianControls.isLoading ? 'Barbarian loading' : barbarianControls.isLoaded ? 'Barbarian loaded' : 'Barbarian idle',
        arrControls.isLoading ? 'Arr loading' : arrControls.isLoaded ? 'Arr loaded' : 'Arr idle',
      ].join(' | ');
    });

    return scene;
  }
}

export function buildUi(scene: BABYLON.Scene, actorPool1: ActorControls, actorPool2: ActorControls) {
  const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI', true, scene);

  const panel = new GUI.StackPanel();
  panel.isVertical = true;
  panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  panel.paddingLeft = '12px';
  panel.paddingTop = '12px';
  panel.width = '220px';
  panel.spacing = 8;
  ui.addControl(panel);

  function mkBtn(text: string, onClick: () => void | Promise<void>) {
    const b = GUI.Button.CreateSimpleButton(text, text);
    b.width = '220px';
    b.height = '36px';
    b.cornerRadius = 8;
    b.thickness = 1;
    b.color = '#333';
    b.background = '#f1f1f1';
    b.onPointerUpObservable.add(() => {
      b.isEnabled = false;
      Promise.resolve(onClick())
        .catch(error => console.error(`[Playground] ${text} failed`, error))
        .finally(() => {
          b.isEnabled = true;
        });
    });
    return b;
  }

  const barbarianLabel = new GUI.TextBlock('barbarianLabel', '=== Barbarian (glTF) ===');
  barbarianLabel.color = 'white';
  barbarianLabel.fontSize = 14;
  barbarianLabel.height = '24px';
  panel.addControl(barbarianLabel);

  let nameplateToggle: GUI.Button;
  nameplateToggle = mkBtn('Hide Nameplates', () => {
    const next = !actorPool1.nameplatesEnabled;
    actorPool1.setNameplatesEnabled(next);
    nameplateToggle.textBlock!.text = next ? 'Hide Nameplates' : 'Show Nameplates';
  });
  panel.addControl(nameplateToggle);

  panel.addControl(mkBtn('Add Barbarian', () => actorPool1.addInstances(1)));
  panel.addControl(mkBtn('Add 100 Barbarian', () => actorPool1.addInstances(100)));
  panel.addControl(mkBtn('Add 1000 Barbarian', () => actorPool1.addInstances(1000)));
  panel.addControl(mkBtn('Remove Barbarian', () => actorPool1.removeRandomInstance()));
  panel.addControl(mkBtn('Shuffle Barbarian', () => actorPool1.shuffleInstances()));

  const arrLabel = new GUI.TextBlock('arrLabel', '=== Arr (.babylon) ===');
  arrLabel.color = 'white';
  arrLabel.fontSize = 14;
  arrLabel.height = '24px';
  arrLabel.paddingTop = '12px';
  panel.addControl(arrLabel);

  panel.addControl(mkBtn('Add Arr', () => actorPool2.addInstances(1)));
  panel.addControl(mkBtn('Add 100 Arr', () => actorPool2.addInstances(100)));
  panel.addControl(mkBtn('Add 1000 Arr', () => actorPool2.addInstances(1000)));
  panel.addControl(mkBtn('Remove Arr', () => actorPool2.removeRandomInstance()));
  panel.addControl(mkBtn('Shuffle Arr', () => actorPool2.shuffleInstances()));

  const radiusTitle = new GUI.TextBlock('radiusTitle', 'Cull Radius: 100');
  radiusTitle.color = 'white';
  radiusTitle.fontSize = 16;
  radiusTitle.height = '22px';
  panel.addControl(radiusTitle);

  const radiusSlider = new GUI.Slider();
  radiusSlider.minimum = 5;
  radiusSlider.maximum = 300;
  radiusSlider.value = 100;
  radiusSlider.isThumbCircle = true;
  radiusSlider.height = '20px';
  radiusSlider.width = '200px';
  radiusSlider.step = 1;
  radiusSlider.borderColor = '#FFF';
  panel.addControl(radiusSlider);

  radiusSlider.onValueChangedObservable.add(v => {
    radiusTitle.text = `Cull Radius: ${v.toFixed(0)}`;
  });

  const hudLeft = new GUI.StackPanel();
  hudLeft.isVertical = true;
  hudLeft.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  hudLeft.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  hudLeft.paddingLeft = '12px';
  hudLeft.paddingTop = '12px';
  hudLeft.width = '380px';
  hudLeft.spacing = 6;
  ui.addControl(hudLeft);

  const countLabel = new GUI.TextBlock('countLabel', 'Instances: Barbarian=0, Arr=0');
  countLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  countLabel.color = 'white';
  countLabel.fontSize = 18;
  countLabel.height = '24px';
  countLabel.paddingLeft = '8px';
  hudLeft.addControl(countLabel);

  const visibleCountLabel = new GUI.TextBlock('visibleCountLabel', 'Visible: Barbarian=0, Arr=0');
  visibleCountLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  visibleCountLabel.color = 'white';
  visibleCountLabel.fontSize = 18;
  visibleCountLabel.height = '24px';
  visibleCountLabel.paddingLeft = '8px';
  hudLeft.addControl(visibleCountLabel);

  const loadStatusLabel = new GUI.TextBlock('loadStatusLabel', 'Barbarian idle | Arr idle');
  loadStatusLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  loadStatusLabel.color = 'white';
  loadStatusLabel.fontSize = 14;
  loadStatusLabel.height = '24px';
  loadStatusLabel.paddingLeft = '8px';
  hudLeft.addControl(loadStatusLabel);

  const perfLabel = new GUI.TextBlock('perfLabel', 'Move tick: 0.000 ms');
  perfLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  perfLabel.color = 'white';
  perfLabel.fontSize = 16;
  perfLabel.height = '24px';
  perfLabel.paddingLeft = '8px';
  hudLeft.addControl(perfLabel);

  const cullPerfLabel = new GUI.TextBlock('cullPerfLabel', 'Frustum Culling (CPU): 0.000 ms');
  cullPerfLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  cullPerfLabel.color = 'white';
  cullPerfLabel.fontSize = 16;
  cullPerfLabel.height = '24px';
  cullPerfLabel.paddingLeft = '8px';
  hudLeft.addControl(cullPerfLabel);

  const fpsLabel = new GUI.TextBlock('fpsLabel', 'FPS Engine: 0.000');
  fpsLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  fpsLabel.color = 'white';
  fpsLabel.fontSize = 16;
  fpsLabel.height = '24px';
  fpsLabel.paddingLeft = '8px';
  hudLeft.addControl(fpsLabel);

  const inspectorBtn = mkBtn('Show Inspector', () => {
    if (scene.debugLayer.isVisible()) {
      scene.debugLayer.hide();
      inspectorBtn.textBlock!.text = 'Show Inspector';
    } else {
      ShowInspector(scene as any, { overlay: true });
      inspectorBtn.textBlock!.text = 'Hide Inspector';
    }
  });
  inspectorBtn.width = '140px';
  inspectorBtn.height = '32px';
  inspectorBtn.color = '#fff';
  inspectorBtn.background = '#111';
  inspectorBtn.top = -40;
  inspectorBtn.left = 20;
  inspectorBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  inspectorBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
  ui.addControl(inspectorBtn);

  return {
    countLabel,
    visibleCountLabel,
    perfLabel,
    cullPerfLabel,
    radiusSlider,
    fpsLabel,
    loadStatusLabel,
  };
}
