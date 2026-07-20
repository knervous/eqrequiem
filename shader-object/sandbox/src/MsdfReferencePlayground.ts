import fantasyNameGenerator from 'fantasy-name-generator';
import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import '@babylonjs/loaders';
import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import { NameplateData, registerMSDFTextShaders } from '@knervous/shado/msdf';
import { ShadoInstanceContainer, TestClass } from '@knervous/shado';
import { fetchShadoBytes } from '@knervous/shado/preprocess/runtime';

function randomFantasyName(): string {
  const name = fantasyNameGenerator.nameByRace('demon');
  return typeof name === 'string' ? name : `Demon ${Math.floor(Math.random() * 100000)}`;
}

const fantasyNames = Array.from({ length: 100 }, randomFantasyName);

export class MsdfReferencePlayground {
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

    const sdfFontDefinition = await (
      await fetch('https://assets.babylonjs.com/fonts/roboto-regular.json')
    ).text();
    const fontAsset = new FontAsset(
      sdfFontDefinition,
      'https://assets.babylonjs.com/fonts/roboto-regular.png',
      scene
    );

    const skeletonBytes = await fetchShadoBytes('/shado/eq-demo/models/ske.glb.gz');
    const skeletonUrl = URL.createObjectURL(new Blob([skeletonBytes], { type: 'model/gltf-binary' }));
    const importResult = await BABYLON.LoadAssetContainerAsync(skeletonUrl, scene, {
      pluginExtension: '.glb',
    });
    URL.revokeObjectURL(skeletonUrl);
    importResult.addAllToScene();
    const sourceMeshes = importResult.meshes.filter(
      m => m instanceof BABYLON.Mesh && m.getTotalVertices() > 0 && m.skeleton
    ) as BABYLON.Mesh[];
    const mesh = sourceMeshes[0];
    if (!mesh) throw new Error('MSDF reference scene could not find a renderable mesh.');

    const skeleton = mesh.skeleton ?? importResult.skeletons[0];
    if (!skeleton) throw new Error('MSDF reference scene mesh has no skeleton.');

    const logShaderCode = false;
    const logAssemblyScriptCode = false;
    await NameplateData.initialize(scene.getEngine() as BABYLON.Engine, {
      logShaderCode,
      logAscCode: logAssemblyScriptCode,
      wasm: false,
    });
    await ShadoInstanceContainer.initialize(scene.getEngine() as BABYLON.Engine, {
      logShaderCode,
      logAscCode: logAssemblyScriptCode,
      extra: TestClass,
      wasm: false,
    });

    const nameplates = new NameplateData(scene.getEngine() as BABYLON.Engine, fontAsset);
    const instancePool = new ShadoInstanceContainer<TestClass>(
      scene.getEngine() as BABYLON.Engine
    );
    instancePool.nameplates = nameplates;
    instancePool.addNamesToPool(fantasyNames);
    (window as any).ipool = instancePool;

    await instancePool.attachMeshes(scene, sourceMeshes, skeleton as any, {
      merge: true,
      replaceMaterial: true,
      disposeOriginalMaterial: false,
      vatOptions: { useHalfDQ: true },
      logOnCompile: true,
      picking: {
        radius: 1.25,
        onPick: result => {
          console.debug('[msdf/reference] picked instance', {
            index: result.index,
            engine: result.engine,
            point: result.pickedPoint.asArray(),
            translation: Array.from((result.instance as any).translation ?? []),
          });
        },
        onMiss: () => {
          console.debug('[msdf/reference] missed instance');
        },
      },
    });

    const initialCount = 100;
    instancePool.addInstances(initialCount, randomFantasyName);
    instancePool.frustumCull(scene.activeCamera as any, 5, 100);

    const actorMaterial = mesh.material;
    const { countLabel, perfLabel, visibleCountLabel, cullPerfLabel, radiusSlider } = buildUi(
      scene,
      instancePool
    );
    (window as any).demo = { instancePool, mesh, material: actorMaterial, nameplates };

    createOriginalStyleMsdfLayer(scene, instancePool, nameplates, fontAsset);

    (scene as any).__clock = 0;
    scene.onBeforeRenderObservable.add(() => {
      const deltaTime = scene.getEngine().getDeltaTime() * 0.001;
      (scene as any).__clock += deltaTime;

      const t0 = performance.now();
      instancePool.tickInstances('instances', deltaTime);
      const t1 = performance.now();
      const tickMs = t1 - t0;

      const radius = radiusSlider.value | 0;
      instancePool.frustumCull(scene.activeCamera as any, 5, radius);
      const cullTickMs = performance.now() - t1;

      countLabel.text = `Instances: ${instancePool.instanceCount | 0}`;
      perfLabel.text = `Move Tick: ${tickMs.toFixed(2)} ms`;
      visibleCountLabel.text = `Visible Instances: ${instancePool.visibleCount}`;
      cullPerfLabel.text = `Frustum Culling: ${cullTickMs.toFixed(2)} ms`;
    });

    scene.onDisposeObservable.add(() => {
      fontAsset.dispose();
    });

    console.debug('[msdf/reference] original-style scene ready', {
      mesh: mesh.name,
      skeleton: skeleton.name,
      instanceCount: instancePool.instanceCount,
      visibleCount: instancePool.visibleCount,
      glyphCount: nameplates.glyphCount(),
    });

    return scene;
  }
}

function createOriginalStyleMsdfLayer(
  scene: BABYLON.Scene,
  instancePool: ShadoInstanceContainer<TestClass>,
  nameplates: NameplateData,
  fontAsset: FontAsset
) {
  const engine = scene.getEngine();
  const isWebGPU =
    (engine as any)._isWebGPU || (engine as any).getClassName?.() === 'WebGPUEngine';

  registerMSDFTextShaders(BABYLON, {
    shaderName: 'msdfText',
    actorStructName: 'TestClass',
    containerStructName: 'ShadoInstanceContainer',
    nameplateStructName: 'NameplateData',
  });

  const glyphMesh = new BABYLON.Mesh('glyphQuad', scene);
  const corners = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]);
  glyphMesh.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false, 3);
  glyphMesh.setVerticesData('corner', corners, true, 2);
  glyphMesh.setIndices(indices);
  glyphMesh.refreshBoundingInfo();
  glyphMesh.alwaysSelectAsActiveMesh = true;

  const ioScene = ShadoInstanceContainer.shaderIO(scene.getEngine() as BABYLON.Engine);
  const ioNP = NameplateData.shaderIO(scene.getEngine() as BABYLON.Engine);
  const msdf = new BABYLON.ShaderMaterial(
    'msdfText',
    scene,
    { vertex: 'msdfText', fragment: 'msdfText' },
    {
      attributes: ['position', 'corner'],
      uniforms: isWebGPU
        ? ['worldViewProjection', 'uAlphaCutoff', 'uFontAtlasSize', 'uDistanceRange']
        : [
            'worldViewProjection',
            'view',
            'uThickness',
            'uAlphaCutoff',
            'uFontAtlasSize',
            'uDistanceRange',
            ...ioScene.uniforms,
            ...ioNP.uniforms,
          ],
      samplers: [...ioScene.samplers, ...ioNP.samplers, 'uFontAtlas'],
      uniformBuffers: ['Scene'],
      shaderLanguage: isWebGPU ? BABYLON.ShaderLanguage.WGSL : BABYLON.ShaderLanguage.GLSL,
    }
  );

  msdf.backFaceCulling = true;
  msdf.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  msdf.needAlphaBlending = () => true;
  msdf.disableDepthWrite = true;
  glyphMesh.material = msdf;

  msdf.onCompiled = effect => {
    console.debug('[msdf/reference] MSDF material compiled', {
      uniforms: effect.getUniformNames(),
      samplers: effect.getSamplers(),
    });
  };

  let loggedFirstDraw = false;
  msdf.onBind = () => {
    const eff = msdf.getEffect();
    if (!eff?.isReady()) return;

    instancePool.commitAndBind(eff);
    nameplates.commitAndBind(eff);

    eff.setMatrix('worldViewProjection', glyphMesh.getWorldMatrix().multiply(scene.getTransformMatrix()));
    eff.setMatrix('view', scene.getViewMatrix());
    eff.setFloat('uThickness', 0.0);
    eff.setFloat('uAlphaCutoff', 0.001);
    const fontTexture = fontAsset.textures[0];
    const fontSize = fontTexture.getSize();
    eff.setFloat2('uFontAtlasSize', fontSize.width, fontSize.height);
    eff.setFloat('uDistanceRange', (fontAsset as any)._font?.distanceField?.distanceRange ?? 4);
    eff.setTexture('uFontAtlas', fontTexture);

    const nGlyphs = nameplates.glyphCount();
    if (nGlyphs > 0) {
      const sub = glyphMesh.subMeshes[0];
      const previousAlphaMode = engine.getAlphaMode();
      const previousDepthBuffer = engine.getDepthBuffer();
      const previousDepthWrite = engine.getDepthWrite();
      engine.setAlphaMode(BABYLON.Engine.ALPHA_COMBINE, true);
      engine.setDepthBuffer(false);
      engine.setDepthWrite(false);
      const drawDepthTest = engine.getDepthBuffer();
      const drawDepthWrite = engine.getDepthWrite();
      try {
        scene.getEngine().drawElementsType(
          BABYLON.Material.TriangleFillMode,
          sub.indexStart,
          sub.indexCount,
          nGlyphs
        );
      } finally {
        engine.setAlphaMode(previousAlphaMode, true);
        engine.setDepthBuffer(previousDepthBuffer);
        engine.setDepthWrite(previousDepthWrite);
      }

      if (!loggedFirstDraw) {
        loggedFirstDraw = true;
        console.debug('[msdf/reference] first glyph draw submitted', {
          glyphCount: nGlyphs,
          visibleCount: instancePool.visibleCount,
          instanceCount: instancePool.instanceCount,
          indexStart: sub.indexStart,
          indexCount: sub.indexCount,
          depthTest: drawDepthTest,
          depthWrite: drawDepthWrite,
        });
      }
    }
  };
}

function buildUi(scene: BABYLON.Scene, actorPool: ShadoInstanceContainer<TestClass>) {
  const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('MsdfReferenceUI', true, scene);

  const panel = new GUI.StackPanel();
  panel.isVertical = true;
  panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
  panel.paddingLeft = '12px';
  panel.paddingTop = '12px';
  panel.width = '220px';
  panel.spacing = 8;
  ui.addControl(panel);

  function mkBtn(text: string, onClick: () => void) {
    const b = GUI.Button.CreateSimpleButton(text, text);
    b.width = '220px';
    b.height = '36px';
    b.cornerRadius = 8;
    b.thickness = 1;
    b.color = '#333';
    b.background = '#f1f1f1';
    b.onPointerUpObservable.add(onClick);
    return b;
  }

  panel.addControl(mkBtn('Add Instance', () => actorPool.addInstances(1, randomFantasyName)));
  panel.addControl(mkBtn('Add 100', () => actorPool.addInstances(100, randomFantasyName)));
  panel.addControl(mkBtn('Add 1000', () => actorPool.addInstances(1000, randomFantasyName)));
  panel.addControl(mkBtn('Remove Random', () => actorPool.removeRandomInstance()));
  panel.addControl(mkBtn('Shuffle All', () => actorPool.shuffleInstances(actorPool.vat?.clips ?? [])));
  panel.addControl(mkBtn('Back to shado scene', () => { window.location.pathname = '/'; }));

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
  radiusSlider.width = '220px';
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
  hudLeft.width = '320px';
  hudLeft.spacing = 6;
  ui.addControl(hudLeft);

  const countLabel = new GUI.TextBlock('countLabel', 'Instances: 0');
  countLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  countLabel.color = 'white';
  countLabel.fontSize = 18;
  countLabel.height = '24px';
  countLabel.paddingLeft = '8px';
  hudLeft.addControl(countLabel);

  const visibleCountLabel = new GUI.TextBlock('visibleCountLabel', 'Visible Instances: 0');
  visibleCountLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  visibleCountLabel.color = 'white';
  visibleCountLabel.fontSize = 18;
  visibleCountLabel.height = '24px';
  visibleCountLabel.paddingLeft = '8px';
  hudLeft.addControl(visibleCountLabel);

  const perfLabel = new GUI.TextBlock('perfLabel', 'Move tick: 0.000 ms');
  perfLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  perfLabel.color = 'white';
  perfLabel.fontSize = 16;
  perfLabel.height = '24px';
  perfLabel.paddingLeft = '8px';
  hudLeft.addControl(perfLabel);

  const cullPerfLabel = new GUI.TextBlock('cullPerfLabel', 'Frustum Culling: 0.000 ms');
  cullPerfLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  cullPerfLabel.color = 'white';
  cullPerfLabel.fontSize = 16;
  cullPerfLabel.height = '24px';
  cullPerfLabel.paddingLeft = '8px';
  hudLeft.addControl(cullPerfLabel);

  return { countLabel, visibleCountLabel, perfLabel, cullPerfLabel, radiusSlider };
}
