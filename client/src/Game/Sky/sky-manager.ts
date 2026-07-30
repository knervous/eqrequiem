import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type { ZoneManager } from "@game/Zone/zone-manager";
import { FileSystem } from "@game/FileSystem/filesystem";
import {
  createRequiemSkyMaterial,
  setRequiemAtmosphereState,
  setRequiemCloudState,
  setRequiemSkyPalette,
  type RequiemSkyLayer,
  type RequiemSkyPalette,
} from "./sky-material";
import {
  advanceSkyHour,
  DEFAULT_SKY_MOTION_SETTINGS,
  normalizeSkyMotionSettings,
  type RequiemSkyMotionSettings,
  wrapSkyHour,
} from "./sky-motion";

type ColorTuple = [number, number, number];
type VectorTuple = [number, number];

type SkyKeyframe = {
  hour: number;
  low: ColorTuple;
  mid: ColorTuple;
  high: ColorTuple;
  zenith: ColorTuple;
  cloud: ColorTuple;
  horizon: ColorTuple;
  stars: number;
  cloudLowOpacity: number;
  cloudHighOpacity: number;
  sunIntensity: number;
  fogStart: number;
  fogEnd: number;
};

type CloudDefinition = {
  scale: number;
  coverage: number;
  rate: VectorTuple;
  softness: number;
  detail: number;
  warp: number;
  stretch: number;
  lightStrength: number;
};

type BiomeCloudDefinition = {
  coverageOffset: number;
  opacityMultiplier: number;
  speedMultiplier: number;
  scaleMultiplier: number;
};

type SkyBiomeDefinition = {
  skyTint: ColorTuple;
  horizonTint: ColorTuple;
  cloudTint: ColorTuple;
  sunTint: ColorTuple;
  fogTint: ColorTuple;
  saturation: number;
  exposure: number;
  haze: number;
  fogStartMultiplier: number;
  fogEndMultiplier: number;
  clouds: {
    low: BiomeCloudDefinition;
    high: BiomeCloudDefinition;
  };
};

type RequiemSkyManifest = {
  version: number;
  asset: string;
  runtimeScale: number;
  layers: {
    root: string;
    visualDome: string;
    cloudLow: string;
    cloudHigh: string;
    horizon: string;
    sun: string;
    moon: string;
  };
  keyframes: SkyKeyframe[];
  clouds: {
    low: CloudDefinition;
    high: CloudDefinition;
  };
  defaultBiome: string;
  biomeTransitionMs: number;
  biomes: Record<string, SkyBiomeDefinition>;
  zoneBiomes: Record<string, string>;
  sun: {
    azimuthBasisRadians: number;
    distance: number;
    lightDistance: number;
    nightColor: ColorTuple;
    dawnColor: ColorTuple;
    noonColor: ColorTuple;
    duskColor: ColorTuple;
  };
  moon: {
    color: ColorTuple;
    distance: number;
  };
  environment: {
    visibleSkyContributesDiffuse: boolean;
    reflectionBinding: string | null;
  };
};

type BlendedSkyState = RequiemSkyPalette & {
  sunIntensity: number;
  fogStart: number;
  fogEnd: number;
};

type ResolvedBiomeState = Omit<SkyBiomeDefinition, "clouds"> & {
  clouds: {
    low: BiomeCloudDefinition;
    high: BiomeCloudDefinition;
  };
};

const color = ([red, green, blue]: ColorTuple): BJS.Color3 =>
  new BABYLON.Color3(red, green, blue);

const lerpNumber = (start: number, end: number, amount: number): number =>
  start + (end - start) * amount;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const copyBiome = (biome: SkyBiomeDefinition): ResolvedBiomeState => ({
  ...biome,
  skyTint: [...biome.skyTint],
  horizonTint: [...biome.horizonTint],
  cloudTint: [...biome.cloudTint],
  sunTint: [...biome.sunTint],
  fogTint: [...biome.fogTint],
  clouds: {
    low: { ...biome.clouds.low },
    high: { ...biome.clouds.high },
  },
});

const lerpTuple = (
  left: ColorTuple,
  right: ColorTuple,
  amount: number,
): ColorTuple => [
  lerpNumber(left[0], right[0], amount),
  lerpNumber(left[1], right[1], amount),
  lerpNumber(left[2], right[2], amount),
];

const lerpBiomeCloud = (
  left: BiomeCloudDefinition,
  right: BiomeCloudDefinition,
  amount: number,
): BiomeCloudDefinition => ({
  coverageOffset: lerpNumber(
    left.coverageOffset,
    right.coverageOffset,
    amount,
  ),
  opacityMultiplier: lerpNumber(
    left.opacityMultiplier,
    right.opacityMultiplier,
    amount,
  ),
  speedMultiplier: lerpNumber(
    left.speedMultiplier,
    right.speedMultiplier,
    amount,
  ),
  scaleMultiplier: lerpNumber(
    left.scaleMultiplier,
    right.scaleMultiplier,
    amount,
  ),
});

const lerpBiome = (
  left: ResolvedBiomeState,
  right: SkyBiomeDefinition,
  amount: number,
): ResolvedBiomeState => ({
  skyTint: lerpTuple(left.skyTint, right.skyTint, amount),
  horizonTint: lerpTuple(left.horizonTint, right.horizonTint, amount),
  cloudTint: lerpTuple(left.cloudTint, right.cloudTint, amount),
  sunTint: lerpTuple(left.sunTint, right.sunTint, amount),
  fogTint: lerpTuple(left.fogTint, right.fogTint, amount),
  saturation: lerpNumber(left.saturation, right.saturation, amount),
  exposure: lerpNumber(left.exposure, right.exposure, amount),
  haze: lerpNumber(left.haze, right.haze, amount),
  fogStartMultiplier: lerpNumber(
    left.fogStartMultiplier,
    right.fogStartMultiplier,
    amount,
  ),
  fogEndMultiplier: lerpNumber(
    left.fogEndMultiplier,
    right.fogEndMultiplier,
    amount,
  ),
  clouds: {
    low: lerpBiomeCloud(left.clouds.low, right.clouds.low, amount),
    high: lerpBiomeCloud(left.clouds.high, right.clouds.high, amount),
  },
});

const findMesh = (
  container: BJS.AssetContainer,
  name: string,
): BJS.AbstractMesh => {
  const mesh = container.meshes.find((candidate) => candidate.name === name);
  if (!mesh) {
    throw new Error(`Required Requiem sky mesh is missing: ${name}`);
  }
  return mesh;
};

const findRoot = (
  container: BJS.AssetContainer,
  name: string,
): BJS.TransformNode => {
  const root = container.transformNodes.find(
    (candidate) => candidate.name === name,
  );
  if (!root) {
    throw new Error(`Required Requiem sky root is missing: ${name}`);
  }
  return root;
};

export default class DayNightSkyManager {
  scale = 7000;
  timeOfDay = 12;

  #camera: BJS.Camera | null = null;
  #scene: BJS.Scene | null = null;
  #domeRoot: BJS.TransformNode | null = null;
  #manifest: RequiemSkyManifest | null = null;
  #sun: BJS.DirectionalLight | null = null;
  #worldEnv: BJS.HemisphericLight | null = null;
  #sunMesh: BJS.AbstractMesh | null = null;
  #moonMesh: BJS.AbstractMesh | null = null;
  #sunMaterial: BJS.StandardMaterial | null = null;
  #moonMaterial: BJS.StandardMaterial | null = null;
  #materials = new Map<RequiemSkyLayer, BJS.ShaderMaterial>();
  #cloudLowOffset = BABYLON.Vector2.Zero();
  #cloudHighOffset = BABYLON.Vector2.Zero();
  #motionSettings: RequiemSkyMotionSettings = {
    ...DEFAULT_SKY_MOTION_SETTINGS,
  };
  #starElapsedSeconds = 0;
  #starRotationRadians = 0;
  #sunDirection = BABYLON.Vector3.Up();
  #biomeName = "";
  #biomeFrom: ResolvedBiomeState | null = null;
  #biomeTarget: SkyBiomeDefinition | null = null;
  #biomeBlendElapsedMs = 0;
  #biomeBlendDurationMs = 0;

  skyContainer: BJS.AssetContainer | null = null;
  parent: ZoneManager;

  constructor(parent: ZoneManager) {
    this.parent = parent;
  }

  get dayLengthSeconds(): number {
    return this.#motionSettings.dayLengthSeconds;
  }

  set dayLengthSeconds(value: number) {
    this.setMotionSettings({ dayLengthSeconds: value });
  }

  get motionSettings(): Readonly<RequiemSkyMotionSettings> {
    return { ...this.#motionSettings };
  }

  setMotionSettings(
    partial: Partial<RequiemSkyMotionSettings>,
  ): Readonly<RequiemSkyMotionSettings> {
    this.#motionSettings = normalizeSkyMotionSettings(
      this.#motionSettings,
      partial,
    );
    return this.motionSettings;
  }

  async createSky(
    name: string,
    noWorldEnv: boolean = false,
    zoneName: string = "",
    bakedWorldLighting: boolean = false,
  ): Promise<void> {
    this.dispose();
    this.#scene = this.parent.GameManager.scene!;
    this.#camera = this.parent.GameManager.Camera;

    const manifest = await FileSystem.getFileJSON<RequiemSkyManifest>(
      "eqrequiem/sky",
      `${name}.json`,
    );
    if (
      !manifest ||
      manifest.version !== 2 ||
      manifest.keyframes.length < 2 ||
      !manifest.biomes[manifest.defaultBiome]
    ) {
      console.error(`[SkyManager] Invalid or missing sky manifest: ${name}`);
      return;
    }
    this.#manifest = manifest;
    this.scale = manifest.runtimeScale;
    const requestedBiome =
      manifest.zoneBiomes[zoneName.toLowerCase()] ?? manifest.defaultBiome;
    const targetBiome =
      manifest.biomes[requestedBiome] ?? manifest.biomes[manifest.defaultBiome];
    this.#biomeName =
      manifest.biomes[requestedBiome] !== undefined
        ? requestedBiome
        : manifest.defaultBiome;
    this.#biomeFrom = copyBiome(manifest.biomes[manifest.defaultBiome]);
    this.#biomeTarget = targetBiome;
    this.#biomeBlendElapsedMs =
      this.#biomeName === manifest.defaultBiome
        ? manifest.biomeTransitionMs
        : 0;
    this.#biomeBlendDurationMs = manifest.biomeTransitionMs;

    const bytes = await FileSystem.getFileBytes(
      "eqrequiem/sky",
      manifest.asset,
    );
    if (!bytes) {
      console.error(`[SkyManager] Failed to load sky geometry: ${manifest.asset}`);
      return;
    }

    await BABYLON.loadFeature("gltf");
    const sky = await BABYLON.LoadAssetContainerAsync(
      new Uint8Array(bytes),
      this.#scene,
      {
        pluginExtension: ".glb",
        name: manifest.asset,
      },
    ).catch((error) => {
      console.error(`[SkyManager] Error importing ${manifest.asset}:`, error);
      return null;
    });
    if (!sky) return;

    try {
      const domeRoot = findRoot(sky, manifest.layers.root);
      const dome = findMesh(sky, manifest.layers.visualDome);
      const cloudLow = findMesh(sky, manifest.layers.cloudLow);
      const cloudHigh = findMesh(sky, manifest.layers.cloudHigh);
      const horizon = findMesh(sky, manifest.layers.horizon);
      const sun = findMesh(sky, manifest.layers.sun);
      const moon = findMesh(sky, manifest.layers.moon);

      sky.addAllToScene();
      this.skyContainer = sky;
      this.#domeRoot = domeRoot;
      this.#domeRoot.name = "__sky__";
      this.#domeRoot.scaling.setAll(this.scale);
      this.#domeRoot.position.copyFrom(this.#camera!.position);

      this.#bindAnalyticMaterial(dome, "dome");
      this.#bindAnalyticMaterial(cloudLow, "cloudLow");
      this.#bindAnalyticMaterial(cloudHigh, "cloudHigh");
      this.#bindAnalyticMaterial(horizon, "horizon");
      cloudHigh.alphaIndex = 0;
      cloudLow.alphaIndex = 1;
      horizon.alphaIndex = 2;

      this.#sunMesh = sun;
      this.#moonMesh = moon;
      this.#configureCelestialMeshes();
      for (const mesh of sky.meshes) {
        mesh.isPickable = false;
        mesh.applyFog = false;
        mesh.alwaysSelectAsActiveMesh = true;
      }
    } catch (error) {
      sky.dispose();
      this.#manifest = null;
      console.error("[SkyManager] Requiem sky contract failed:", error);
      return;
    }

    this.#scene.fogEnabled = true;
    this.#scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;

    if (!noWorldEnv) {
      this.#worldEnv = new BABYLON.HemisphericLight(
        "worldEnv",
        BABYLON.Vector3.Up(),
        this.#scene,
      );
      this.#worldEnv.intensity = 0.1;
    }

    if (!bakedWorldLighting) {
      this.#sun = new BABYLON.DirectionalLight(
        "sun",
        BABYLON.Vector3.Down(),
        this.#scene,
      );
      this.#sun.shadowMinZ = 0;
      this.#sun.shadowMaxZ = 10000;
    }
    this.#updateAppearance();
  }

  #bindAnalyticMaterial(
    mesh: BJS.AbstractMesh,
    layer: RequiemSkyLayer,
  ): void {
    const previous = mesh.material;
    const material = createRequiemSkyMaterial(
      `requiem-sky-${layer}`,
      this.#scene!,
      layer,
    );
    mesh.material = material;
    previous?.dispose();
    this.#materials.set(layer, material);
  }

  #configureCelestialMeshes(): void {
    const manifest = this.#manifest!;
    this.#sunMaterial = new BABYLON.StandardMaterial(
      "requiem-sky-sun",
      this.#scene!,
    );
    this.#sunMaterial.disableLighting = true;
    this.#sunMaterial.backFaceCulling = false;
    this.#sunMaterial.emissiveColor = color(manifest.sun.noonColor);
    this.#sunMesh!.material?.dispose();
    this.#sunMesh!.material = this.#sunMaterial;

    this.#moonMaterial = new BABYLON.StandardMaterial(
      "requiem-sky-moon",
      this.#scene!,
    );
    this.#moonMaterial.disableLighting = true;
    this.#moonMaterial.backFaceCulling = false;
    this.#moonMaterial.emissiveColor = color(manifest.moon.color);
    this.#moonMesh!.material?.dispose();
    this.#moonMesh!.material = this.#moonMaterial;
  }

  tick(delta: number): void {
    if (!this.#domeRoot || !this.#camera || !this.#manifest) return;
    this.#domeRoot.position.copyFrom(this.#camera.position);
    const deltaSeconds = Math.max(0, delta) / 1000;
    this.timeOfDay = advanceSkyHour(
      this.timeOfDay,
      delta,
      this.#motionSettings,
    );
    this.#starElapsedSeconds +=
      deltaSeconds * this.#motionSettings.starTwinkleRate;
    this.#starRotationRadians =
      (this.#starRotationRadians +
        deltaSeconds *
          this.#motionSettings.starDriftRate *
          0.0008) %
      (Math.PI * 2);

    const wasBlending =
      this.#biomeBlendElapsedMs < this.#biomeBlendDurationMs;
    if (wasBlending) {
      this.#biomeBlendElapsedMs = Math.min(
        this.#biomeBlendDurationMs,
        this.#biomeBlendElapsedMs + delta,
      );
    }
    if (wasBlending || this.#motionSettings.celestialRate !== 0) {
      this.#updateAppearance();
    }
    const biome = this.#resolvedBiome();

    const low = this.#manifest.clouds.low;
    const high = this.#manifest.clouds.high;
    this.#cloudLowOffset.addInPlaceFromFloats(
      low.rate[0] *
        biome.clouds.low.speedMultiplier *
        this.#motionSettings.cloudLowRate *
        delta,
      low.rate[1] *
        biome.clouds.low.speedMultiplier *
        this.#motionSettings.cloudLowRate *
        delta,
    );
    this.#cloudHighOffset.addInPlaceFromFloats(
      high.rate[0] *
        biome.clouds.high.speedMultiplier *
        this.#motionSettings.cloudHighRate *
        delta,
      high.rate[1] *
        biome.clouds.high.speedMultiplier *
        this.#motionSettings.cloudHighRate *
        delta,
    );
    setRequiemCloudState(
      this.#materials.get("cloudLow")!,
      {
        offset: this.#cloudLowOffset,
        scale: low.scale * biome.clouds.low.scaleMultiplier,
        coverage: clamp01(
          low.coverage + biome.clouds.low.coverageOffset,
        ),
        softness: low.softness,
        detail: low.detail,
        warp: low.warp,
        stretch: low.stretch,
        lightStrength: low.lightStrength,
      },
    );
    setRequiemCloudState(
      this.#materials.get("cloudHigh")!,
      {
        offset: this.#cloudHighOffset,
        scale: high.scale * biome.clouds.high.scaleMultiplier,
        coverage: clamp01(
          high.coverage + biome.clouds.high.coverageOffset,
        ),
        softness: high.softness,
        detail: high.detail,
        warp: high.warp,
        stretch: high.stretch,
        lightStrength: high.lightStrength,
      },
    );
    for (const material of this.#materials.values()) {
      setRequiemAtmosphereState(material, {
        starElapsedSeconds: this.#starElapsedSeconds,
        starRotationRadians: this.#starRotationRadians,
        sunDirection: this.#sunDirection,
        haze: biome.haze,
        sunGlow: Math.max(0, this.#sunDirection.y + 0.12),
      });
    }
  }

  setTimeOfDay(time: number): void {
    this.timeOfDay = wrapSkyHour(time);
    this.#updateAppearance();
  }

  get biome(): string {
    return this.#biomeName;
  }

  setBiome(name: string, transitionMs?: number): boolean {
    if (!this.#manifest) return false;
    const target = this.#manifest.biomes[name];
    if (!target) {
      console.warn(`[SkyManager] Unknown sky biome: ${name}`);
      return false;
    }
    if (name === this.#biomeName && this.#biomeTarget === target) return true;

    this.#biomeFrom = this.#resolvedBiome();
    this.#biomeTarget = target;
    this.#biomeName = name;
    this.#biomeBlendElapsedMs = 0;
    this.#biomeBlendDurationMs = Math.max(
      0,
      transitionMs ?? this.#manifest.biomeTransitionMs,
    );
    if (this.#biomeBlendDurationMs === 0) {
      this.#biomeBlendElapsedMs = 0;
      this.#updateAppearance();
    }
    return true;
  }

  #resolvedBiome(): ResolvedBiomeState {
    const manifest = this.#manifest!;
    const from =
      this.#biomeFrom ?? copyBiome(manifest.biomes[manifest.defaultBiome]);
    const target =
      this.#biomeTarget ?? manifest.biomes[manifest.defaultBiome];
    const amount =
      this.#biomeBlendDurationMs <= 0
        ? 1
        : clamp01(
            this.#biomeBlendElapsedMs / this.#biomeBlendDurationMs,
          );
    return lerpBiome(from, target, amount);
  }

  #blendedState(): BlendedSkyState {
    const keyframes = this.#manifest!.keyframes
      .slice()
      .sort((left, right) => left.hour - right.hour);
    const hour = wrapSkyHour(this.timeOfDay);
    let current = keyframes.at(-1)!;
    let next = keyframes[0];
    for (let index = 0; index < keyframes.length; index += 1) {
      if (hour < keyframes[index].hour) {
        next = keyframes[index];
        current = keyframes[(index - 1 + keyframes.length) % keyframes.length];
        break;
      }
    }

    const currentHour = current.hour;
    const nextHour = next.hour <= currentHour ? next.hour + 24 : next.hour;
    const sampleHour = hour < currentHour ? hour + 24 : hour;
    const amount = Math.max(
      0,
      Math.min(1, (sampleHour - currentHour) / (nextHour - currentHour)),
    );
    const blendColor = (left: ColorTuple, right: ColorTuple): BJS.Color3 =>
      BABYLON.Color3.Lerp(color(left), color(right), amount);

    return {
      low: blendColor(current.low, next.low),
      mid: blendColor(current.mid, next.mid),
      high: blendColor(current.high, next.high),
      zenith: blendColor(current.zenith, next.zenith),
      cloud: blendColor(current.cloud, next.cloud),
      horizon: blendColor(current.horizon, next.horizon),
      stars: lerpNumber(current.stars, next.stars, amount),
      cloudLowOpacity: lerpNumber(
        current.cloudLowOpacity,
        next.cloudLowOpacity,
        amount,
      ),
      cloudHighOpacity: lerpNumber(
        current.cloudHighOpacity,
        next.cloudHighOpacity,
        amount,
      ),
      sunIntensity: lerpNumber(
        current.sunIntensity,
        next.sunIntensity,
        amount,
      ),
      fogStart: lerpNumber(current.fogStart, next.fogStart, amount),
      fogEnd: lerpNumber(current.fogEnd, next.fogEnd, amount),
    };
  }

  #adjustColor(
    source: BJS.Color3,
    tint: ColorTuple,
    saturation: number,
    exposure: number,
  ): BJS.Color3 {
    const luminance =
      source.r * 0.2126 + source.g * 0.7152 + source.b * 0.0722;
    return new BABYLON.Color3(
      Math.max(
        0,
        lerpNumber(luminance, source.r, saturation) * tint[0] * exposure,
      ),
      Math.max(
        0,
        lerpNumber(luminance, source.g, saturation) * tint[1] * exposure,
      ),
      Math.max(
        0,
        lerpNumber(luminance, source.b, saturation) * tint[2] * exposure,
      ),
    );
  }

  #biomeAdjustedState(
    state: BlendedSkyState,
    biome: ResolvedBiomeState,
  ): BlendedSkyState {
    const skyColor = (source: BJS.Color3): BJS.Color3 =>
      this.#adjustColor(
        source,
        biome.skyTint,
        biome.saturation,
        biome.exposure,
      );
    return {
      ...state,
      low: skyColor(state.low),
      mid: skyColor(state.mid),
      high: skyColor(state.high),
      zenith: skyColor(state.zenith),
      cloud: this.#adjustColor(
        state.cloud,
        biome.cloudTint,
        biome.saturation,
        biome.exposure,
      ),
      horizon: this.#adjustColor(
        state.horizon,
        biome.horizonTint,
        biome.saturation,
        biome.exposure,
      ),
      cloudLowOpacity: clamp01(
        state.cloudLowOpacity * biome.clouds.low.opacityMultiplier,
      ),
      cloudHighOpacity: clamp01(
        state.cloudHighOpacity * biome.clouds.high.opacityMultiplier,
      ),
      fogStart: state.fogStart * biome.fogStartMultiplier,
      fogEnd: state.fogEnd * biome.fogEndMultiplier,
    };
  }

  #updateAppearance(): void {
    if (!this.#manifest || !this.#scene) return;
    const biome = this.#resolvedBiome();
    const baseState = this.#blendedState();
    const state = this.#biomeAdjustedState(baseState, biome);
    for (const [layer, material] of this.#materials) {
      setRequiemSkyPalette(material, state, layer);
    }

    this.#scene.fogColor.copyFrom(
      this.#adjustColor(
        baseState.horizon,
        biome.fogTint,
        biome.saturation,
        biome.exposure,
      ),
    );
    this.#scene.fogStart = state.fogStart;
    this.#scene.fogEnd = state.fogEnd;

    const cycle = wrapSkyHour(this.timeOfDay) / 24;
    const solarElevation =
      Math.sin((cycle - 0.25) * Math.PI * 2) * (65 * Math.PI) / 180;
    const azimuth =
      cycle * Math.PI * 2 + this.#manifest.sun.azimuthBasisRadians;
    const sunDirection = new BABYLON.Vector3(
      Math.cos(solarElevation) * Math.sin(azimuth),
      Math.sin(solarElevation),
      Math.cos(solarElevation) * Math.cos(azimuth),
    ).normalize();
    this.#sunDirection.copyFrom(sunDirection);

    this.#sunMesh?.position.copyFrom(
      sunDirection.scale(this.#manifest.sun.distance),
    );
    this.#moonMesh?.position.copyFrom(
      sunDirection.scale(-this.#manifest.moon.distance),
    );
    this.#sunMesh?.setEnabled(sunDirection.y > -0.035);
    this.#moonMesh?.setEnabled(sunDirection.y < 0.12);

    const sunColor = this.#adjustColor(
      this.#sunColor(),
      biome.sunTint,
      biome.saturation,
      biome.exposure,
    );
    if (this.#sun) {
      this.#sun.diffuse = sunColor;
      this.#sun.intensity =
        state.sunIntensity * Math.max(0.06, Math.max(0, sunDirection.y));
      this.#sun.direction.copyFrom(sunDirection).scaleInPlace(-1);
      this.#sun.position.copyFrom(
        this.#domeRoot!.position.add(
          sunDirection.scale(this.#manifest.sun.lightDistance),
        ),
      );
    }
    this.#sunMaterial?.emissiveColor.copyFrom(sunColor);
    for (const material of this.#materials.values()) {
      setRequiemAtmosphereState(material, {
        starElapsedSeconds: this.#starElapsedSeconds,
        starRotationRadians: this.#starRotationRadians,
        sunDirection: this.#sunDirection,
        haze: biome.haze,
        sunGlow: Math.max(0, sunDirection.y + 0.12),
      });
    }
  }

  #sunColor(): BJS.Color3 {
    const manifest = this.#manifest!;
    const hour = wrapSkyHour(this.timeOfDay);
    const stops: [number, ColorTuple][] = [
      [0, manifest.sun.nightColor],
      [6, manifest.sun.dawnColor],
      [12, manifest.sun.noonColor],
      [18, manifest.sun.duskColor],
      [24, manifest.sun.nightColor],
    ];
    const nextIndex = stops.findIndex(([stopHour]) => stopHour > hour);
    const right = stops[nextIndex];
    const left = stops[nextIndex - 1];
    const amount = (hour - left[0]) / (right[0] - left[0]);
    return BABYLON.Color3.Lerp(color(left[1]), color(right[1]), amount);
  }

  dispose(): void {
    this.#worldEnv?.dispose();
    this.#sun?.dispose();
    this.skyContainer?.dispose();
    for (const material of this.#materials.values()) {
      material.dispose();
    }
    this.#sunMaterial?.dispose();
    this.#moonMaterial?.dispose();

    this.#camera = null;
    this.#scene = null;
    this.#domeRoot = null;
    this.#manifest = null;
    this.#sun = null;
    this.#worldEnv = null;
    this.#sunMesh = null;
    this.#moonMesh = null;
    this.#sunMaterial = null;
    this.#moonMaterial = null;
    this.#materials.clear();
    this.skyContainer = null;
    this.#cloudLowOffset.setAll(0);
    this.#cloudHighOffset.setAll(0);
    this.#starElapsedSeconds = 0;
    this.#starRotationRadians = 0;
    this.#sunDirection.copyFromFloats(0, 1, 0);
    this.#biomeName = "";
    this.#biomeFrom = null;
    this.#biomeTarget = null;
    this.#biomeBlendElapsedMs = 0;
    this.#biomeBlendDurationMs = 0;
  }
}
