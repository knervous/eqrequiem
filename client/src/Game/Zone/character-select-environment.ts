import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { createTerrainSurfaceMaterial } from "@/fx/terrain-surface-shader";
import { bindZoneShaderLighting } from "@/fx/zone-shader-lighting";
import { FileSystem } from "@game/FileSystem/filesystem";
import type DayNightSkyManager from "@game/Sky/sky-manager";

type SemanticNode =
  | BJS.TransformNode
  | BJS.AbstractMesh;

type CharacterSelectSceneManifest = {
  version: 1;
  asset: string;
  name: string;
  coordinateContract: "gltf-y-up-identity";
  semantics: {
    root: string;
    character: string;
    camera: string;
    cameraTarget: string;
    faceCamera: string;
    faceTarget: string;
    classFx: string;
    sky: string;
  };
  camera: {
    fov: number;
    near: number;
    orbitDurationSeconds: number;
    horizontalCompositionOffset: number;
  };
  character: {
    heading: number;
    gravity: boolean;
    collision: boolean;
  };
  terrain: {
    mesh: string;
    controlMap0: string;
    worldMin: [number, number];
    worldMax: [number, number];
    layers: Record<"grass" | "dirt" | "rock", {
      albedo: string;
      metallicRoughness: string;
    }>;
    scales: {
      grass: number;
      dirt: number;
      rock: number;
      macro: number;
    };
    rockSlopeStart: number;
    rockSlopeEnd: number;
    triplanarSlopeStart: number;
    triplanarSlopeEnd: number;
  };
  atmosphere: {
    clearColor: [number, number, number, number];
    fogColor: [number, number, number];
    fogStart: number;
    fogEnd: number;
    ambientColor: [number, number, number];
  };
  lights: {
    key: DirectionalLightDefinition;
    fill: DirectionalLightDefinition;
    hemisphere: {
      direction: [number, number, number];
      skyColor: [number, number, number];
      groundColor: [number, number, number];
      intensity: number;
    };
    settlement: PointLightDefinition[];
  };
};

type DirectionalLightDefinition = {
  direction: [number, number, number];
  color: [number, number, number];
  intensity: number;
};

type PointLightDefinition = {
  position: [number, number, number];
  color: [number, number, number];
  intensity: number;
  range: number;
};

type PreviousSceneState = {
  clearColor: BJS.Color4;
  ambientColor: BJS.Color3;
  fogMode: number;
  fogColor: BJS.Color3;
  fogStart: number;
  fogEnd: number;
};

const SCENE_DIRECTORY = "eqrequiem/scenes";
const SCENE_MANIFEST = "requiem-character-select.json";

function color3([red, green, blue]: [number, number, number]): BJS.Color3 {
  return new BABYLON.Color3(red, green, blue);
}

function vector3([x, y, z]: [number, number, number]): BJS.Vector3 {
  return new BABYLON.Vector3(x, y, z);
}

function findNode(
  container: BJS.AssetContainer,
  name: string,
): SemanticNode {
  const node = [...container.transformNodes, ...container.meshes].find(
    (candidate) => candidate.name === name,
  );
  if (!node) {
    throw new Error(`Missing semantic node '${name}'`);
  }
  return node;
}

function assertIdentityRoot(root: SemanticNode): void {
  const epsilon = 0.00001;
  const identityPosition = root.position.lengthSquared() <= epsilon;
  const identityScale = root.scaling.subtract(BABYLON.Vector3.One()).lengthSquared() <=
    epsilon;
  const rotation = root.rotationQuaternion?.toEulerAngles() ?? root.rotation;
  const identityRotation = rotation.lengthSquared() <= epsilon;
  if (!identityPosition || !identityScale || !identityRotation) {
    throw new Error(
      "Character-select root must remain at its authored identity transform",
    );
  }
}

export class CharacterSelectEnvironment {
  private readonly scene: BJS.Scene;
  private readonly camera: BJS.UniversalCamera;
  private readonly previous: PreviousSceneState;
  private manifest: CharacterSelectSceneManifest | null = null;
  private container: BJS.AssetContainer | null = null;
  private lights: BJS.Light[] = [];
  private characterAnchor: SemanticNode | null = null;
  private cameraAnchor: SemanticNode | null = null;
  private cameraTarget: SemanticNode | null = null;
  private faceCameraAnchor: SemanticNode | null = null;
  private faceCameraTarget: SemanticNode | null = null;
  private orbitObserver: BJS.Observer<BJS.Scene> | null = null;
  private orbitTarget = BABYLON.Vector3.Zero();
  private orbitLookTarget = BABYLON.Vector3.Zero();
  private orbitAngle = 0;
  private orbitRadius = 1;
  private orbitHeight = 0;
  private bodyPoseActive = true;
  private ambientMotes: BJS.ParticleSystem | null = null;
  private terrainMaterial: BJS.ShaderMaterial | null = null;
  private terrainTextures: BJS.BaseTexture[] = [];
  private readonly runtimeSky: DayNightSkyManager | null;

  constructor(
    scene: BJS.Scene,
    camera: BJS.UniversalCamera,
    runtimeSky: DayNightSkyManager | null = null,
  ) {
    this.scene = scene;
    this.camera = camera;
    this.runtimeSky = runtimeSky;
    this.previous = {
      clearColor: scene.clearColor.clone(),
      ambientColor: scene.ambientColor.clone(),
      fogMode: scene.fogMode,
      fogColor: scene.fogColor.clone(),
      fogStart: scene.fogStart,
      fogEnd: scene.fogEnd,
    };
  }

  get characterPosition(): BJS.Vector3 {
    if (!this.characterAnchor) {
      throw new Error("Character-select environment is not initialized");
    }
    return this.characterAnchor.getAbsolutePosition().clone();
  }

  get characterHeading(): number {
    return this.manifest?.character.heading ?? 0;
  }

  get gravityEnabled(): boolean {
    return this.manifest?.character.gravity ?? false;
  }

  get collisionEnabled(): boolean {
    return this.manifest?.character.collision ?? false;
  }

  async initialize(): Promise<void> {
    const manifest =
      await FileSystem.getFileJSON<CharacterSelectSceneManifest>(
        SCENE_DIRECTORY,
        SCENE_MANIFEST,
      );
    if (
      !manifest ||
      manifest.version !== 1 ||
      manifest.coordinateContract !== "gltf-y-up-identity"
    ) {
      throw new Error("Invalid or missing character-select scene manifest");
    }

    const bytes = await FileSystem.getFileBytes(
      SCENE_DIRECTORY,
      manifest.asset,
    );
    if (!bytes) {
      throw new Error(`Missing character-select asset '${manifest.asset}'`);
    }

    await BABYLON.loadFeature("gltf");
    const container = await BABYLON.LoadAssetContainerAsync(
      new Uint8Array(bytes),
      this.scene,
      {
        pluginExtension: ".glb",
        name: manifest.asset,
      },
    );

    try {
      const root = findNode(container, manifest.semantics.root);
      assertIdentityRoot(root);
      this.characterAnchor = findNode(
        container,
        manifest.semantics.character,
      );
      this.cameraAnchor = findNode(container, manifest.semantics.camera);
      this.cameraTarget = findNode(
        container,
        manifest.semantics.cameraTarget,
      );
      this.faceCameraAnchor = findNode(
        container,
        manifest.semantics.faceCamera,
      );
      this.faceCameraTarget = findNode(
        container,
        manifest.semantics.faceTarget,
      );
      findNode(container, manifest.semantics.classFx);
      const sky = findNode(container, manifest.semantics.sky);
      const skyMeshes = new Set(
        container.meshes.filter(
          (mesh) => mesh === sky || mesh.isDescendantOf(sky),
        ),
      );

      for (const material of container.materials) {
        if (!(material instanceof BABYLON.PBRMaterial)) continue;
        const sourceExtras = material.metadata?.gltf?.extras;
        if (sourceExtras?.requiemUnlit === true) material.unlit = true;
        if (material.name.startsWith("CS Light ·")) material.unlit = true;
        if (material.name.startsWith("CS Atmosphere · Sky")) {
          // Blender's glTF exporter cannot represent vertex color driving an
          // emissive socket. It otherwise exports a flat white emissive factor
          // that washes the authored COLOR_0 gradient into a pale backdrop.
          material.unlit = true;
          material.emissiveColor.copyFrom(BABYLON.Color3.Black());
          material.backFaceCulling = false;
          material.twoSidedLighting = true;
        }
      }
      for (const mesh of container.meshes) {
        mesh.isPickable = false;
        mesh.receiveShadows = false;
        if (skyMeshes.has(mesh)) {
          mesh.applyFog = false;
          mesh.alwaysSelectAsActiveMesh = true;
          if (mesh.material) {
            mesh.material.backFaceCulling = false;
          }
        }
      }

      container.addAllToScene();
      root.computeWorldMatrix(true);
      this.manifest = manifest;
      this.container = container;
      this.applyAtmosphere(manifest);
      this.createLights(manifest);
      this.createLayeredTerrain(container, manifest);
      if (this.runtimeSky) {
        await this.runtimeSky.createSky("requiem-sky", true);
        if (this.runtimeSky.skyContainer) {
          // The embedded gradient is a resilient fallback. The owned analytic
          // sky supplies the production dome, two independently moving cloud
          // layers, celestial bodies, and stars when its contract resolves.
          sky.setEnabled(false);
          this.runtimeSky.setBiome("forest", 0);
          this.runtimeSky.setTimeOfDay(17.75);
        }
      }
      this.createAmbientMotes();
      this.configureAmbientOrbit();
      this.applyCameraPose(false);
    } catch (error) {
      container.dispose();
      throw error;
    }
  }

  applyCameraPose(face: boolean): void {
    if (!this.manifest) return;
    this.bodyPoseActive = !face;
    if (face) {
      if (!this.faceCameraAnchor || !this.faceCameraTarget) return;
      this.camera.position.copyFrom(
        this.faceCameraAnchor.getAbsolutePosition(),
      );
      this.camera.lockedTarget =
        this.faceCameraTarget.getAbsolutePosition().clone();
    } else {
      this.applyAmbientOrbitPose();
    }
    this.camera.fov = this.manifest.camera.fov;
    this.camera.minZ = this.manifest.camera.near;
  }

  dispose(): void {
    if (this.orbitObserver) {
      this.scene.onBeforeRenderObservable.remove(this.orbitObserver);
      this.orbitObserver = null;
    }
    this.camera.lockedTarget = null;
    this.ambientMotes?.dispose();
    this.ambientMotes = null;
    this.runtimeSky?.dispose();
    for (const light of this.lights) light.dispose();
    this.lights = [];
    this.terrainMaterial?.dispose();
    this.terrainMaterial = null;
    for (const texture of this.terrainTextures) texture.dispose();
    this.terrainTextures = [];
    this.container?.dispose();
    this.container = null;
    this.manifest = null;
    this.characterAnchor = null;
    this.cameraAnchor = null;
    this.cameraTarget = null;
    this.faceCameraAnchor = null;
    this.faceCameraTarget = null;
    this.bodyPoseActive = true;

    this.scene.clearColor.copyFrom(this.previous.clearColor);
    this.scene.ambientColor.copyFrom(this.previous.ambientColor);
    this.scene.fogMode = this.previous.fogMode;
    this.scene.fogColor.copyFrom(this.previous.fogColor);
    this.scene.fogStart = this.previous.fogStart;
    this.scene.fogEnd = this.previous.fogEnd;
  }

  private applyAtmosphere(manifest: CharacterSelectSceneManifest): void {
    const atmosphere = manifest.atmosphere;
    this.scene.clearColor.set(...atmosphere.clearColor);
    this.scene.ambientColor.copyFrom(color3(atmosphere.ambientColor));
    this.scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    this.scene.fogColor.copyFrom(color3(atmosphere.fogColor));
    this.scene.fogStart = atmosphere.fogStart;
    this.scene.fogEnd = atmosphere.fogEnd;
  }

  private configureAmbientOrbit(): void {
    if (!this.cameraAnchor || !this.cameraTarget || !this.manifest) return;
    const position = this.cameraAnchor.getAbsolutePosition();
    this.orbitTarget.copyFrom(this.cameraTarget.getAbsolutePosition());
    const offsetX = position.x - this.orbitTarget.x;
    const offsetZ = position.z - this.orbitTarget.z;
    this.orbitRadius = Math.max(1, Math.hypot(offsetX, offsetZ));
    this.orbitAngle = Math.atan2(offsetZ, offsetX);
    this.orbitHeight = position.y;
    this.orbitObserver = this.scene.onBeforeRenderObservable.add(() => {
      const deltaMilliseconds = this.scene.getEngine().getDeltaTime();
      this.runtimeSky?.tick(deltaMilliseconds);
      if (!this.manifest) return;
      // The shared sky owns zone-scale fog distances. This compact stage needs
      // its authored near haze reapplied after the sky tick so the outer grove
      // recedes instead of ending in a hard, flat horizon.
      this.applyPresentationFog(this.manifest);
      bindZoneShaderLighting(this.scene, [this.terrainMaterial]);
      if (!this.bodyPoseActive) return;
      const duration = Math.max(
        30,
        this.manifest.camera.orbitDurationSeconds,
      );
      const deltaSeconds = deltaMilliseconds / 1000;
      this.orbitAngle =
        (this.orbitAngle + (Math.PI * 2 * deltaSeconds) / duration) %
        (Math.PI * 2);
      this.applyAmbientOrbitPose();
    });
  }

  private createAmbientMotes(): void {
    const motes = new BABYLON.ParticleSystem(
      "__character_select_ambient_motes__",
      96,
      this.scene,
    );
    motes.particleTexture = new BABYLON.Texture(
      "textures/flare.png",
      this.scene,
      true,
      false,
    );
    motes.emitter = new BABYLON.Vector3(0, 1.9, 1.5);
    motes.minEmitBox = new BABYLON.Vector3(-15, -1.2, -15);
    motes.maxEmitBox = new BABYLON.Vector3(15, 3.8, 15);
    motes.color1 = new BABYLON.Color4(1, 0.55, 0.16, 0.76);
    motes.color2 = new BABYLON.Color4(0.45, 0.72, 0.64, 0.42);
    motes.colorDead = new BABYLON.Color4(0.16, 0.25, 0.22, 0);
    motes.minSize = 0.035;
    motes.maxSize = 0.13;
    motes.minLifeTime = 4.5;
    motes.maxLifeTime = 10;
    motes.emitRate = 8;
    motes.direction1 = new BABYLON.Vector3(-0.08, 0.025, -0.06);
    motes.direction2 = new BABYLON.Vector3(0.08, 0.12, 0.06);
    motes.minEmitPower = 0.08;
    motes.maxEmitPower = 0.22;
    motes.updateSpeed = 0.018;
    motes.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    motes.start();
    this.ambientMotes = motes;
  }

  private applyPresentationFog(
    manifest: CharacterSelectSceneManifest,
  ): void {
    this.scene.fogColor.copyFrom(color3(manifest.atmosphere.fogColor));
    this.scene.fogStart = manifest.atmosphere.fogStart;
    this.scene.fogEnd = manifest.atmosphere.fogEnd;
  }

  private applyAmbientOrbitPose(): void {
    this.camera.position.set(
      this.orbitTarget.x + Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orbitHeight,
      this.orbitTarget.z + Math.sin(this.orbitAngle) * this.orbitRadius,
    );
    const compositionOffset =
      this.manifest?.camera.horizontalCompositionOffset ?? 0;
    this.orbitLookTarget.set(
      this.orbitTarget.x - Math.sin(this.orbitAngle) * compositionOffset,
      this.orbitTarget.y,
      this.orbitTarget.z + Math.cos(this.orbitAngle) * compositionOffset,
    );
    this.camera.lockedTarget = this.orbitLookTarget;
  }

  private createLights(manifest: CharacterSelectSceneManifest): void {
    const makeDirectional = (
      name: string,
      definition: DirectionalLightDefinition,
    ) => {
      const light = new BABYLON.DirectionalLight(
        name,
        vector3(definition.direction).normalize(),
        this.scene,
      );
      light.diffuse = color3(definition.color);
      light.intensity = definition.intensity;
      light.specular = light.diffuse.scale(0.55);
      this.lights.push(light);
    };
    makeDirectional("__character_select_key__", manifest.lights.key);
    makeDirectional("__character_select_fill__", manifest.lights.fill);

    const hemisphereDefinition = manifest.lights.hemisphere;
    const hemisphere = new BABYLON.HemisphericLight(
      "__character_select_hemisphere__",
      vector3(hemisphereDefinition.direction).normalize(),
      this.scene,
    );
    hemisphere.diffuse = color3(hemisphereDefinition.skyColor);
    hemisphere.groundColor = color3(hemisphereDefinition.groundColor);
    hemisphere.intensity = hemisphereDefinition.intensity;
    hemisphere.specular = BABYLON.Color3.Black();
    this.lights.push(hemisphere);

    for (const [index, definition] of manifest.lights.settlement.entries()) {
      const light = new BABYLON.PointLight(
        `__character_select_settlement_${index}__`,
        vector3(definition.position),
        this.scene,
      );
      light.diffuse = color3(definition.color);
      light.specular = light.diffuse.scale(0.35);
      light.intensity = definition.intensity;
      light.range = definition.range;
      light.radius = 3.2;
      this.lights.push(light);
    }
  }

  private createLayeredTerrain(
    container: BJS.AssetContainer,
    manifest: CharacterSelectSceneManifest,
  ): void {
    const terrain = container.meshes.find(
      (mesh) => mesh.name === manifest.terrain.mesh,
    );
    if (!terrain) {
      throw new Error(`Missing layered terrain mesh '${manifest.terrain.mesh}'`);
    }

    const texture = (url: string, gammaSpace: boolean): BJS.Texture => {
      const result = new BABYLON.Texture(
        url,
        this.scene,
        false,
        false,
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      );
      result.gammaSpace = gammaSpace;
      result.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
      result.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
      this.terrainTextures.push(result);
      return result;
    };
    const layer = (name: "grass" | "dirt" | "rock") => ({
      albedo: texture(manifest.terrain.layers[name].albedo, true),
      metallicRoughness: texture(
        manifest.terrain.layers[name].metallicRoughness,
        false,
      ),
    });
    const controlMap0 = texture(manifest.terrain.controlMap0, false);
    controlMap0.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    controlMap0.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

    this.terrainMaterial = createTerrainSurfaceMaterial(this.scene, {
      grass: layer("grass"),
      dirt: layer("dirt"),
      rock: layer("rock"),
      controlMap0,
      worldMin: manifest.terrain.worldMin,
      worldMax: manifest.terrain.worldMax,
      scales: manifest.terrain.scales,
      rockSlopeStart: manifest.terrain.rockSlopeStart,
      rockSlopeEnd: manifest.terrain.rockSlopeEnd,
      triplanarSlopeStart: manifest.terrain.triplanarSlopeStart,
      triplanarSlopeEnd: manifest.terrain.triplanarSlopeEnd,
      useVertexTint: false,
    });
    terrain.material = this.terrainMaterial;
    bindZoneShaderLighting(this.scene, [this.terrainMaterial]);
  }
}
