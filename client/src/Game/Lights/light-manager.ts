import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import Player from "@game/Player/player";

const MAX_LIGHTS = 4;

export type LightData = {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
};

export class LightManager {
  private zoneLights: BJS.PointLight[] = [];
  private ambientLight: BJS.HemisphericLight | null = null;
  private playerLight: BJS.PointLight | null = null;
  private previousLights: number[] = [];
  private lastPosition: BJS.Vector3 = new BABYLON.Vector3(-1, 0, 0);
  private accumTime: number = 0;

  dispose() {
    this.zoneLights.forEach((l) => l.dispose());
    this.previousLights = [];
    this.zoneLights = [];
    this.ambientLight?.dispose();
    this.playerLight?.dispose();
  }

  setAmbientColor(hex: string) {
    if (this.ambientLight) {
      this.ambientLight.diffuse = BABYLON.Color3.FromHexString(hex);
      this.ambientLight.groundColor = BABYLON.Color3.FromHexString(hex);
    }
  }

  setIntensity(intensity: number) {
    if (this.ambientLight) {
      this.ambientLight.intensity = intensity;
    }
  }

  async loadLights(container: BJS.Node, scene: BJS.Scene, zoneLights: LightData[]) {
    // Allow up to MAX_LIGHTS influence per material
    scene.materials.forEach((m) => {
      m.maxSimultaneousLights = MAX_LIGHTS;
    });

    // Create lights
    zoneLights.forEach((data, idx) => {
      const pos = new BABYLON.Vector3(-data.x, data.y, data.z);
      const light = new BABYLON.PointLight(`zoneLight_${idx}`, pos, scene);
      light.diffuse = new BABYLON.Color3(data.r, data.g, data.b);
      light.intensity = 0.5;
      light.radius = 25;
      light.range = 100;
      light.intensityMode = BABYLON.Light.INTENSITYMODE_LUMINANCE;
      light.falloffType = BABYLON.Light.FALLOFF_GLTF;
      light.specular.set(0, 0, 0);
      light.setEnabled(false);
      light.parent = container;
      this.zoneLights.push(light);
    });
  }

  updateLights(delta: number) {
    const playerPosition = Player.instance?.getPlayerPosition();
    if (!playerPosition) {
      return;
    }
    if (this.lastPosition.equals(playerPosition)) {
      return;
    }
    if (this.accumTime <= 100) {
      this.accumTime += delta;
      return;
    }
    const start = performance.now();
    this.accumTime = 0;

    // Compute distances to all lights and pick nearest
    const hits = this.zoneLights.map((light, idx) => {
      const distSq = BABYLON.Vector3.DistanceSquared(playerPosition, light.position);
      return { idx, distSq };
    });

    const nearest = hits
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, Math.min(MAX_LIGHTS, this.zoneLights.length))
      .map((h) => h.idx);

    // Disable lights no longer needed
    this.previousLights.forEach((oldIdx) => {
      if (!nearest.includes(oldIdx)) {
        this.zoneLights[oldIdx].setEnabled(false);
      }
    });

    // Enable newly needed lights
    nearest.forEach((idx) => {
      this.zoneLights[idx].setEnabled(true);
    });

    this.previousLights = nearest;
    this.lastPosition.copyFrom(playerPosition);
    const next = performance.now() - start;
    // console.log('[Performance] LightManager.updateLights, %c', 'green', next);
  }
}
// BABYLON.Effect.IncludesShadersStore.lightFragment = `
// #ifdef LIGHT{X}
//     // --- Pre-lighting for point lights only ---
//     preInfo = computePointAndSpotPreLightingInfo(
//         light{X}.vLightData,
//         viewDirectionW,
//         normalW
//     );

//     // --- GLTF distance falloff (soft, physically plausible) ---
//     preInfo.attenuation = computeDistanceLightFalloff_GLTF(
//         preInfo.lightDistanceSquared,
//         light{X}.vLightFalloff.y
//     );

//     // --- Tweak roughness based on light properties ---
//     preInfo.roughness = adjustRoughnessFromLightProperties(
//         roughness,
//         light{X}.vLightSpecular.a,
//         preInfo.lightDistance
//     );

//     // --- Compute diffuse & specular contributions ---
//     info.diffuse = computeDiffuseLighting(
//         preInfo,
//         light{X}.vLightDiffuse.rgb
//     );
//     info.specular = computeSpecularLighting(
//         preInfo,
//         normalW,
//         clearcoatOut.specularEnvironmentR0,
//         specularEnvironmentR90,
//         AARoughnessFactors.x,
//         light{X}.vLightDiffuse.rgb
//     );

//     // --- Accumulate into the final base colors (no manual clamp!) ---
//     diffuseBase  += info.diffuse;
//     specularBase += info.specular;
// #endif
// `;
