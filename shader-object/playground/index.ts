import { createShadoShowcaseEnvironment } from '@knervous/shado';
import { startShowcaseApplication } from './showcase-app';

/**
 * Babylon Playground entrypoint.
 *
 * Everything in this file is ordinary Babylon scene composition. The Shado
 * integration starts in `showcase-app.ts`, actor schemas live in
 * `showcase-actor.ts`, and custom material behavior lives in
 * `showcase-shader.ts`.
 */
class Playground {
  public static CreateScene(engine: BABYLON.Engine, canvas: HTMLCanvasElement): BABYLON.Scene {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = BABYLON.Color4.FromHexString('#0d1522ff');

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

    const sky = new BABYLON.HemisphericLight('sky-light', new BABYLON.Vector3(0.25, 1, 0.1), scene);
    sky.intensity = 1.05;

    const sun = new BABYLON.DirectionalLight(
      'sun-light',
      new BABYLON.Vector3(-0.45, -1, 0.35),
      scene
    );
    sun.intensity = 0.65;

    // Terrain and sky are normal Babylon meshes. Shado owns only the animated
    // actor pools rendered into this scene.
    createShadoShowcaseEnvironment(BABYLON, scene);

    void startShowcaseApplication(scene, camera, canvas).catch(error => {
      console.error('[Shado VAT Showcase] startup failed', error);
    });

    return scene;
  }
}

export { Playground };
