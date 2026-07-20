import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { ShowInspector } from '@babylonjs/inspector';
import {
  ShadoDynamicEntityContainer,
  ShadoDynamicEntityRenderer,
  createSolidColorAtlas,
  type ShadoDynamicEntityDestinationInput,
  type ShadoDynamicEntityInput,
} from '@knervous/shado/render';

type EntityKind = 'work-item' | 'work-center' | 'resource' | 'queue';

const KIND_COLORS: Record<EntityKind | 'default', readonly [number, number, number, number]> = {
  default: [1, 1, 1, 1],
  'work-item': [0.22, 0.55, 0.96, 1],
  'work-center': [0.16, 0.72, 0.42, 1],
  resource: [0.98, 0.68, 0.2, 1],
  queue: [0.78, 0.35, 0.88, 1],
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeEntity(i: number): ShadoDynamicEntityInput {
  const kinds: EntityKind[] = ['work-item', 'work-center', 'resource', 'queue'];
  const kind = kinds[i % kinds.length];
  const width = kind === 'work-center' ? rand(1.6, 3.2) : rand(0.5, 1.3);
  const depth = kind === 'queue' ? rand(2.0, 5.0) : rand(0.5, 1.6);
  return {
    id: `entity-${i}`,
    textureKey: kind,
    x: rand(-45, 45),
    y: rand(-30, 30),
    width,
    depth,
    height: kind === 'work-item' ? 0.35 : rand(0.45, 1.25),
    rotationRad: rand(-Math.PI, Math.PI),
    opacity: kind === 'queue' ? 0.72 : 1,
    sortKey: i,
    visible: true,
  };
}

export class LeanPassPlayground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    canvas: HTMLCanvasElement
  ): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#101820ff');

    const camera = new BABYLON.ArcRotateCamera(
      'leanPassCam',
      -Math.PI / 2,
      Math.PI / 3.2,
      72,
      BABYLON.Vector3.Zero(),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 160;
    camera.wheelPrecision = 45;
    camera.panningSensibility = 55;

    const light = new BABYLON.HemisphericLight('leanPassLight', new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 0.85;

    const ground = BABYLON.MeshBuilder.CreateGround(
      'lean-pass-floor',
      { width: 110, height: 78, subdivisions: 2 },
      scene
    );
    const groundMaterial = new BABYLON.StandardMaterial('lean-pass-floor-material', scene);
    groundMaterial.diffuseColor = BABYLON.Color3.FromHexString('#172333');
    groundMaterial.specularColor = BABYLON.Color3.Black();
    ground.material = groundMaterial;

    await ShadoDynamicEntityContainer.initialize(engine, { wasm: false, backend: 'datatex' });
    const atlas = createSolidColorAtlas(scene, KIND_COLORS);
    const container = new ShadoDynamicEntityContainer(engine, atlas);
    const renderer = new ShadoDynamicEntityRenderer(scene, container, atlas, {
      log: true,
      sortDrawList: false,
      picking: {
        padding: 0.05,
        onPick: result => {
          console.debug('[LeanPass] picked entity', {
            id: result.id,
            index: result.index,
            engine: result.engine,
            point: result.pickedPoint.asArray(),
          });
        },
        onMiss: () => {
          console.debug('[LeanPass] missed entity');
        },
      },
    });
    renderer.mesh.name = 'lean-pass-box-batch';

    let nextId = 0;
    let animate = false;
    let lastMutationMs = 0;

    const addEntities = (count: number) => {
      const entities: ShadoDynamicEntityInput[] = [];
      for (let i = 0; i < count; i++) entities.push(makeEntity(nextId++));
      container.upsertMany(entities, false);
      container.syncDrawList();
      updateLabels();
    };

    const moveSubset = (count: number) => {
      const total = container.entityCount | 0;
      if (!total) return;
      const t0 = performance.now();
      const destinations: ShadoDynamicEntityDestinationInput[] = [];
      for (let i = 0; i < count; i++) {
        const index = Math.floor(Math.random() * total);
        const id = container.ids[index];
        const entity = container.getEntity(index);
        if (!id || !entity) continue;
        destinations.push({
          id,
          x: entity.destinationSize[0] + rand(-1.5, 1.5),
          y: entity.destinationSize[1] + rand(-1.5, 1.5),
          width: entity.positionSize[2],
          depth: entity.positionSize[3],
          transition: true,
          transitionSpeed: 8,
        });
      }
      container.setEntityDestinations(destinations);
      perfLabel.text = `Destination sync: ${(performance.now() - t0).toFixed(2)} ms`;
      updateLabels();
    };

    const removeEntities = (count: number) => {
      for (let i = 0; i < count; i++) {
        const ids = container.ids;
        if (!ids.length) break;
        const id = ids[Math.floor(Math.random() * ids.length)];
        container.remove(id);
      }
      container.syncDrawList();
      updateLabels();
    };

    const ui = GUI.AdvancedDynamicTexture.CreateFullscreenUI('lean-pass-ui', true, scene);
    const panel = new GUI.StackPanel('lean-pass-panel');
    panel.width = '270px';
    panel.top = '16px';
    panel.left = '16px';
    panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    panel.spacing = 8;
    ui.addControl(panel);

    const label = new GUI.TextBlock('lean-pass-counts', '');
    label.height = '28px';
    label.color = '#ffffff';
    label.fontSize = 14;
    label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(label);

    const perfLabel = new GUI.TextBlock('lean-pass-perf', '');
    perfLabel.height = '28px';
    perfLabel.color = '#a9c5ff';
    perfLabel.fontSize = 13;
    perfLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(perfLabel);

    const makeButton = (text: string, handler: () => void) => {
      const button = GUI.Button.CreateSimpleButton(text, text);
      button.height = '34px';
      button.color = '#ffffff';
      button.background = '#26364f';
      button.thickness = 1;
      button.cornerRadius = 4;
      button.onPointerClickObservable.add(handler);
      panel.addControl(button);
      return button;
    };

    makeButton('Add 1,000', () => addEntities(1000));
    makeButton('Move 500', () => moveSubset(500));
    makeButton('Remove 250', () => removeEntities(250));
    makeButton('Clear', () => {
      container.clearEntities();
      nextId = 0;
      updateLabels();
    });
    const animateButton = makeButton('Animate deltas: off', () => {
      animate = !animate;
      animateButton.textBlock!.text = animate ? 'Animate deltas: on' : 'Animate deltas: off';
    });
    makeButton('Inspector', () => {
      void ShowInspector(scene, {});
    });

    const updateLabels = () => {
      label.text = `Entities: ${container.entityCount | 0}  Draw: ${container.drawCount | 0}`;
    };
    updateLabels();

    scene.onBeforeRenderObservable.add(() => {
      container.tickTransitions(scene.getEngine().getDeltaTime() * 0.001);
      if (!animate) return;
      const now = performance.now();
      if (now - lastMutationMs < 100) return;
      lastMutationMs = now;
      moveSubset(Math.min(500, container.entityCount | 0));
    });

    (window as any).leanShadoPass = { container, renderer, atlas, addEntities, moveSubset, removeEntities };
    return scene;
  }
}
