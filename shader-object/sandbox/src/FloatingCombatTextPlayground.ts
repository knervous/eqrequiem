import * as BABYLON from '@babylonjs/core';
import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import { NameplateData } from '@knervous/shado/msdf';
import {
  FloatingTextPool,
  formatCombatText,
  type FloatingTextKind,
} from '@knervous/shado/msdf';
import { ShadoDynamicEntityNameplateLayer } from '@knervous/shado/render';

/**
 * Isolated visual check for floating combat text.
 *
 * The animation is easy to get subtly wrong — too fast and it reads as noise, too
 * transparent too early and the number is unreadable exactly when the player looks at
 * it — and none of that is visible from a unit test. This scene is the smallest thing
 * that shows the real MSDF layer doing the real curve, with no game, no server and no
 * entity system in the way.
 *
 * Three dummy targets emit values continuously so appearance, rise, drift, fade and
 * overlap can all be judged at once.
 */

const KINDS: readonly FloatingTextKind[] = [
  'damage', 'damage', 'damage', 'critical', 'heal', 'miss', 'resist',
];

export class FloatingCombatTextPlayground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    canvas: HTMLCanvasElement,
  ): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.08, 1);

    const camera = new BABYLON.ArcRotateCamera(
      'cam', -Math.PI / 2, Math.PI / 2.6, 22,
      new BABYLON.Vector3(0, 3, 0), scene,
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 40;

    new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.9;

    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 40, height: 40 }, scene);
    const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.12, 0.13, 0.16);
    ground.material = groundMaterial;

    // Stand-in targets. Their only job is to give the numbers somewhere to come from.
    const targets = [-6, 0, 6].map((x, index) => {
      const body = BABYLON.MeshBuilder.CreateCapsule(
        `target${index}`, { height: 3.4, radius: 0.7 }, scene,
      );
      body.position.set(x, 1.7, 0);
      const material = new BABYLON.StandardMaterial(`targetMat${index}`, scene);
      material.diffuseColor = new BABYLON.Color3(0.28, 0.3, 0.36);
      body.material = material;
      return body;
    });

    const fontDefinition = await (
      await fetch('https://assets.babylonjs.com/fonts/roboto-regular.json')
    ).text();
    const fontAsset = new FontAsset(
      fontDefinition,
      'https://assets.babylonjs.com/fonts/roboto-regular.png',
      scene,
    );

    const backend = engine.isWebGPU ? 'storage' : 'datatex';
    await NameplateData.initialize(engine, { backend, wasm: false });

    const layer = new ShadoDynamicEntityNameplateLayer(scene, {
      fontAsset: fontAsset as never,
      // Combat text is read, not inspected: it draws over geometry so a number is never
      // lost behind the thing that produced it.
      depthTest: false,
      renderingGroupId: 1,
      // The game's zones are far larger than this scene, so its 1/32 would be invisible
      // here. Tuned for a 3.4-unit-tall stand-in target.
      worldScale: 0.09,
    } as never);

    const pool = new FloatingTextPool();
    let nextSpawnAtMs = 0;
    let slot = 0;

    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();

      // A burst cadence rather than a metronome, so overlapping values are visible —
      // that is the case most likely to look wrong.
      if (now >= nextSpawnAtMs) {
        const bursts = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < bursts; i++) {
          const target = targets[Math.floor(Math.random() * targets.length)]!;
          const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!;
          const amount = kind === 'critical'
            ? 120 + Math.floor(Math.random() * 260)
            : 8 + Math.floor(Math.random() * 90);
          slot += 1;
          pool.spawn({
            kind,
            text: formatCombatText(kind, amount),
            x: target.position.x,
            y: target.position.z,
            z: target.position.y + 1.6,
            slot,
          }, now);
        }
        nextSpawnAtMs = now + 260 + Math.random() * 340;
      }

      layer.sync(
        pool.advance(now).map((instance) => ({ ...instance, billboard: true })) as never,
      );
    });

    (window as unknown as Record<string, unknown>).floatingTextPool = pool;
    return scene;
  }
}
