import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export const ZONE_SHADER_LIGHTING_UNIFORMS = [
  "uZoneDaylightFactor",
  "uZoneLightDirection",
  "uZoneLightColor",
  "uZoneAmbientColor",
  "uZonePlayerLightPosition",
  "uZonePlayerLightColor",
  "uZonePlayerLightRange",
] as const;

const lightDirection = BABYLON.Vector3.Up();
const lightColor = BABYLON.Vector3.Zero();
const ambientColor = BABYLON.Vector3.Zero();
const playerLightPosition = BABYLON.Vector3.Zero();
const playerLightColor = BABYLON.Vector3.Zero();
const white = BABYLON.Color3.White();
const defaultAmbient = new BABYLON.Color3(0.08, 0.09, 0.1);

/**
 * Bind the live Babylon sky and local player light to custom zone shaders.
 * PBR materials receive these lights automatically; ShaderMaterial does not.
 */
export function bindZoneShaderLighting(
  scene: BJS.Scene,
  materials: readonly (BJS.ShaderMaterial | null)[],
): void {
  const enabledLights = scene.lights.filter((light) => light.isEnabled());
  const sun = enabledLights.find(
    (light) => light.getClassName() === "DirectionalLight",
  ) as BJS.DirectionalLight | undefined;
  const hemisphere = enabledLights.find(
    (light) => light.getClassName() === "HemisphericLight",
  ) as BJS.HemisphericLight | undefined;

  const sourceDirection = sun?.direction ?? hemisphere?.direction;
  if (sourceDirection) {
    lightDirection.copyFrom(sourceDirection);
    if (sun) lightDirection.scaleInPlace(-1);
    lightDirection.normalize();
  } else {
    lightDirection.copyFromFloats(0, 1, 0);
  }

  const direct = sun ?? hemisphere;
  const directIntensity = Number.isFinite(direct?.intensity)
    ? direct!.intensity
    : 0;
  const directDiffuse = direct?.diffuse ?? white;
  lightColor.set(
    directDiffuse.r * directIntensity,
    directDiffuse.g * directIntensity,
    directDiffuse.b * directIntensity,
  );

  const sceneAmbient = scene.ambientColor;
  const ambientBase =
    Math.max(sceneAmbient.r, sceneAmbient.g, sceneAmbient.b) > 1e-6
      ? sceneAmbient
      : defaultAmbient;
  const hemisphereIntensity = hemisphere?.intensity ?? 0;
  const hemisphereDiffuse = hemisphere?.diffuse ?? white;
  ambientColor.set(
    ambientBase.r + hemisphereDiffuse.r * hemisphereIntensity,
    ambientBase.g + hemisphereDiffuse.g * hemisphereIntensity,
    ambientBase.b + hemisphereDiffuse.b * hemisphereIntensity,
  );

  const playerLight = scene.getLightByName(
    "playerLight",
  ) as BJS.PointLight | null;
  if (playerLight?.isEnabled()) {
    playerLightPosition.copyFrom(playerLight.getAbsolutePosition());
    const strength = Math.min(2, Math.max(0, playerLight.intensity / 1200));
    playerLightColor.set(
      playerLight.diffuse.r * strength,
      playerLight.diffuse.g * strength,
      playerLight.diffuse.b * strength,
    );
  } else {
    playerLightPosition.set(0, 0, 0);
    playerLightColor.set(0, 0, 0);
  }

  for (const material of materials) {
    if (!material) continue;
    // Grass uses this deliberately coarse day/night value instead of doing
    // per-fragment directional and local-light work. Other zone shaders keep
    // the richer uniforms below.
    material.setFloat(
      "uZoneDaylightFactor",
      lightDirection.y > 0.025 ? 1 : 0.38,
    );
    material.setVector3("uZoneLightDirection", lightDirection);
    material.setVector3("uZoneLightColor", lightColor);
    material.setVector3("uZoneAmbientColor", ambientColor);
    material.setVector3("uZonePlayerLightPosition", playerLightPosition);
    material.setVector3("uZonePlayerLightColor", playerLightColor);
    material.setFloat("uZonePlayerLightRange", playerLight?.range ?? 1);
  }
}
