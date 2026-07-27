import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

const TARGET_RING_SHADER = "requiemTargetIndicator";
const ACQUISITION_DURATION_MS = 520;

BABYLON.Effect.ShadersStore[`${TARGET_RING_SHADER}PixelShader`] = `
  precision highp float;

  varying vec2 vUV;

  uniform float time;
  uniform float acquisition;
  uniform vec4 color;

  const float PI = 3.14159265359;
  const float TAU = 6.28318530718;

  float band(float value, float center, float halfWidth, float feather) {
    return 1.0 - smoothstep(
      halfWidth,
      halfWidth + feather,
      abs(value - center)
    );
  }

  void main(void) {
    vec2 point = vUV * 2.0 - 1.0;
    float distanceFromCenter = length(point);
    float angle = atan(point.y, point.x);
    float feather = 0.008;

    // A stable pair of rings provides an immediately readable footprint.
    float outerRing = band(distanceFromCenter, 0.82, 0.018, feather);
    float innerRing = band(distanceFromCenter, 0.61, 0.012, feather);

    // Break the outer ring into deliberate reticle segments.
    float segment = smoothstep(
      0.18,
      0.28,
      sin(angle * 8.0 + time * 0.85)
    );
    float segmentedOuter = outerRing * (0.34 + segment * 0.66);

    // Four cardinal brackets make facing and target center easy to judge.
    float cardinal = pow(
      max(abs(cos(angle)), abs(sin(angle))),
      32.0
    );
    float brackets =
      band(distanceFromCenter, 0.72, 0.055, feather) *
      smoothstep(0.44, 0.78, cardinal);

    // A restrained rotating scan persists after the acquisition flash.
    float scanPhase = fract(angle / TAU - time * 0.10);
    float scanArc =
      band(distanceFromCenter, 0.91, 0.010, feather) *
      smoothstep(0.76, 0.98, scanPhase);

    // On a fresh target, contract a bright wave toward the footprint.
    float acquisitionStrength = 1.0 - acquisition;
    float acquisitionRadius = mix(1.08, 0.66, acquisition);
    float acquisitionWave =
      band(distanceFromCenter, acquisitionRadius, 0.022, 0.016) *
      acquisitionStrength;
    float acquisitionFlash =
      outerRing *
      acquisitionStrength *
      (0.55 + 0.45 * sin(acquisition * PI * 5.0));

    float slowPulse = 0.84 + 0.16 * sin(time * 2.4);
    float intensity =
      segmentedOuter * slowPulse +
      innerRing * 0.56 +
      brackets * 0.92 +
      scanArc * 0.72 +
      acquisitionWave * 1.45 +
      acquisitionFlash * 0.92;

    // Fade the square corners completely and preserve a soft floor glow.
    float footprint = 1.0 - smoothstep(0.93, 1.03, distanceFromCenter);
    float floorGlow =
      (1.0 - smoothstep(0.22, 0.88, distanceFromCenter)) *
      (0.035 + acquisitionStrength * 0.055);
    float alpha = clamp((intensity + floorGlow) * footprint, 0.0, 0.92);
    vec3 finalColor =
      color.rgb *
      (0.72 + intensity * 0.64 + acquisitionStrength * 0.48);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export type TargetRingVisual = {
  material: BJS.StandardMaterial;
  texture: BJS.ProceduralTexture;
  setColor: (color: BJS.Color4) => void;
  triggerAcquisition: () => void;
};

export function createTargetRingMaterial(scene: BJS.Scene): TargetRingVisual {
  let elapsedSeconds = 0;
  let acquisitionStartedAt = -Infinity;
  const texture = new BABYLON.ProceduralTexture(
    "requiemTargetIndicatorTexture",
    512,
    TARGET_RING_SHADER,
    scene,
  );
  texture.hasAlpha = true;
  texture.setColor4("color", new BABYLON.Color4(1, 1, 1, 1));
  texture.setFloat("time", elapsedSeconds);
  texture.setFloat("acquisition", 1);

  const material = new BABYLON.StandardMaterial(
    "requiemTargetIndicatorMaterial",
    scene,
  );
  material.emissiveTexture = texture;
  material.opacityTexture = texture;
  material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
  material.disableLighting = true;
  material.diffuseTexture = null;
  material.backFaceCulling = false;

  const animationObserver = scene.onBeforeRenderObservable.add(() => {
    elapsedSeconds += scene.getEngine().getDeltaTime() / 1000;
    const acquisition = Math.min(
      1,
      (performance.now() - acquisitionStartedAt) /
        ACQUISITION_DURATION_MS,
    );
    texture.setFloat("time", elapsedSeconds);
    texture.setFloat("acquisition", acquisition);
  });
  texture.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(animationObserver);
  });

  return {
    material,
    texture,
    setColor: (color) => {
      texture.setColor4(
        "color",
        new BABYLON.Color4(color.r, color.g, color.b, 1),
      );
    },
    triggerAcquisition: () => {
      acquisitionStartedAt = performance.now();
      texture.setFloat("acquisition", 0);
    },
  };
}
