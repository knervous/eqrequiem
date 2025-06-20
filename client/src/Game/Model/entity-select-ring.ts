import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

BABYLON.Effect.ShadersStore["circlesPixelShader"] = `
        precision highp float;

        varying vec2 vUV;

        uniform float time;
        uniform vec4 color;
        uniform float numCircles;
        uniform float radius;
        uniform float width;
        uniform float intensity;

        void main(void) {
            vec2 st = vUV * 2.0 - 1.0;
            float l = length(st);
            float dist1 = fract((l * numCircles) - fract(time));
            float dist2 = dist1 - radius;
            vec3 col = vec3(color.rgb  * pow(radius / abs(dist2), width) * intensity * max((0.8- abs(dist2)), 0.0));
            gl_FragColor = vec4(col, col.r * (1.-l));
        }
    `;
export function createTargetRingMaterial(scene: BJS.Scene): [BJS.StandardMaterial, BJS.ProceduralTexture] {
  let time = 0;
  const texture = new BABYLON.ProceduralTexture("circles", 512, "circles", scene);
  texture.hasAlpha = true;

  texture.setFloat("numCircles", 2);
  texture.setFloat("radius", 0.5);
  texture.setFloat("width", 1.0);
  texture.setFloat("intensity", 0.1);
  texture.setColor4("color", new BABYLON.Color4(1, 0, 1, 1));
  texture.setFloat("time", time);

  //

  const material = new BABYLON.StandardMaterial("mat");
  material.diffuseTexture = texture;

  scene.onReadyObservable.addOnce(() => {
    scene.onBeforeRenderObservable.add(() => {
      time += 0.01 * scene.getAnimationRatio();
      texture.setFloat("time", time);
    });
  });
  return [material, texture];
}
