import * as BABYLON from '@babylonjs/core';
import { FontAsset } from '@babylonjs/addons/msdfText/fontAsset';
import { FloatingTextPool, formatCombatText, NameplateData } from '@knervous/shado/msdf';
import { ShadoDynamicEntityNameplateLayer } from '@knervous/shado/render';

/**
 * Floating text under the *game's* exact layer configuration.
 *
 * The first sandbox (`/floating-text`) proved the animation, but it used its own scale
 * and drew over geometry. In the real client the same pool produced nothing visible, so
 * this scene reproduces the client's configuration precisely — `worldScale: 1/32`,
 * `depthTest: true`, `renderingGroupId: 0`, EQ-sized coordinates — and draws a nameplate
 * beside every combat value through the same layer.
 *
 * That side-by-side is the point: nameplates demonstrably render in the client, so
 * anything that shows a nameplate and not a number isolates the difference to the
 * per-instance fields the two paths do not share.
 */
export class FloatingTextParityPlayground {
  public static async CreateScene(
    engine: BABYLON.Engine,
    canvas: HTMLCanvasElement,
  ): Promise<BABYLON.Scene> {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.08, 1);

    // Client-scale world: an entity stands ~6 units tall around coordinates in the
    // hundreds, not a 3-unit capsule at the origin.
    const origin = new BABYLON.Vector3(-57, 30, -510);
    const camera = new BABYLON.ArcRotateCamera(
      'cam', -Math.PI / 2, Math.PI / 2.4, 30,
      origin.add(new BABYLON.Vector3(0, 4, 0)), scene,
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 20;
    camera.minZ = 0.1;

    new BABYLON.HemisphericLight('l', new BABYLON.Vector3(0, 1, 0), scene).intensity = 0.9;

    const ground = BABYLON.MeshBuilder.CreateGround('g', { width: 200, height: 200 }, scene);
    ground.position.set(origin.x, origin.y - 3, origin.z);
    const groundMaterial = new BABYLON.StandardMaterial('gm', scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.12, 0.13, 0.16);
    ground.material = groundMaterial;

    const body = BABYLON.MeshBuilder.CreateCapsule('t', { height: 6, radius: 1.2 }, scene);
    body.position.copyFrom(origin);
    const bodyMaterial = new BABYLON.StandardMaterial('tm', scene);
    bodyMaterial.diffuseColor = new BABYLON.Color3(0.28, 0.3, 0.36);
    body.material = bodyMaterial;

    const fontDefinition = await (
      await fetch('https://assets.babylonjs.com/fonts/roboto-regular.json')
    ).text();
    const fontAsset = new FontAsset(
      fontDefinition,
      'https://assets.babylonjs.com/fonts/roboto-regular.png',
      scene,
    );
    await NameplateData.initialize(engine, {
      backend: engine.isWebGPU ? 'storage' : 'datatex',
      wasm: false,
    });

    // Byte-for-byte the client's options (see EntityCache).
    const layer = new ShadoDynamicEntityNameplateLayer(scene, {
      fontAsset: fontAsset as never,
      color: '#00ffff',
      depthTest: true,
      renderingGroupId: 0,
      worldScale: 1 / 32,
    } as never);

    // A/B: the left column animates size on appearance, the right holds it constant.
    // If only the right renders crisply, the appearance pop is what the layer dislikes.
    const pool = new FloatingTextPool();
    const steadyPool = new FloatingTextPool({ appearFraction: 0 });
    let nextAtMs = 0;
    let slot = 0;

    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      if (now >= nextAtMs) {
        slot += 1;
        const kind = (['damage', 'critical', 'heal', 'miss'] as const)[slot % 4]!;
        pool.spawn({
          kind,
          text: formatCombatText(kind, 40 + slot * 7),
          // The client's swizzle: world x, world *z* into `y`, height into `z`.
          x: origin.x - 5,
          y: origin.z,
          z: origin.y + 4.5,
          slot,
        }, now);
        steadyPool.spawn({
          kind,
          text: formatCombatText(kind, 40 + slot * 7),
          x: origin.x + 5,
          y: origin.z,
          z: origin.y + 4.5,
          slot,
        }, now);
        nextAtMs = now + 700;
      }

      // The control: a nameplate written exactly as the client writes one.
      const nameplate = {
        id: 'control-nameplate',
        text: 'Garis Ashford 3',
        x: origin.x,
        y: origin.z,
        z: origin.y + 4,
        visible: true,
      };

      layer.sync([
        nameplate,
        ...pool.advance(now),
        ...steadyPool.advance(now),
      ] as never);
    });

    (window as unknown as Record<string, unknown>).parityPool = pool;
    (window as unknown as Record<string, unknown>).parityLayer = layer;
    return scene;
  }
}
