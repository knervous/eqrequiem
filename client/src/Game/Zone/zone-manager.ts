import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { supportedZones } from "@game/Constants/supportedZones";
import emitter, { ChatMessage } from "@game/Events/events";
import { FileSystem } from "@game/FileSystem/filesystem";
import { LightManager } from "@game/Lights/light-manager";
import type GameManager from "@game/Manager/game-manager";
import { swapMaterialTexture } from "@game/Model/bjs-utils";
import EntityCache from "@game/Model/entity-cache";
import { Spawns } from "@game/Net/messages";
import { RegionManager } from "@game/Regions/region-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import EntityPool from "./entity-pool";
import { ShadoWorldObjectLayer } from "./shado-world-object-layer";
import { ShadoWorldSceneLayer } from "./shado-world-scene-layer";
import { Grid } from "./zone-grid";
import { ZoneMetadata } from "./zone-types";
import ObjectCache from "@/Game/Model/object-cache";

export class ZoneManager {
  get RegionManager(): RegionManager {
    return this.regionManager;
  }

  get LightManager(): LightManager {
    return this.lightManager;
  }
  private lightManager: LightManager;

  get SkyManager(): DayNightSkyManager {
    return this.skyManager;
  }
  private skyManager: DayNightSkyManager;

  private regionManager: RegionManager;
  get ZoneContainer(): BJS.TransformNode | null {
    return this.zoneContainer;
  }
  private zoneContainer: BJS.TransformNode | null = null;
  private objectContainer: BJS.TransformNode | null = null;
  private lightContainer: BJS.TransformNode | null = null;
  private entityContainerNode: BJS.TransformNode | null = null;
  public grid: Grid | null = null;

  private tickObservable: BJS.Nullable<BJS.Observer<BJS.Scene>> = null;
  get EntityPool(): EntityPool | null {
    return this.entityPool;
  }
  private entityPool: EntityPool | null = null;
  private zoneObjects: ObjectCache | null = null;
  private shadoWorldObjects: ShadoWorldObjectLayer | null = null;
  private shadoWorldScene: ShadoWorldSceneLayer | null = null;

  private disableWorldEnv: boolean = false;
  public zoneName = "";
  public get CurrentZone() {
    return this.parent.CurrentZone;
  }

  get GameManager(): GameManager {
    return this.parent;
  }
  private parent: GameManager;

  private animatedTextures: Array<{
    mesh: BJS.AbstractMesh;
    frames: string[];
    delayMs: number;
    elapsedMs: number;
    frame: number;
  }> = [];
  private loadGeneration = 0;

  constructor(parent: GameManager) {
    this.parent = parent;
    this.zoneContainer = null;
    this.regionManager = new RegionManager(this.GameManager);
    this.lightManager = new LightManager();
    this.skyManager = new DayNightSkyManager(this);
    this.zoneContainer =
      this.parent.scene?.getTransformNodeByName("ZoneContainer") ??
      new BABYLON.TransformNode("ZoneContainer", this.parent.scene);
    this.objectContainer =
      this.parent.scene?.getTransformNodeByName("ZoneObjectContainer") ??
      new BABYLON.TransformNode("ZoneObjectContainer", this.parent.scene);
    this.lightContainer =
      this.parent.scene?.getTransformNodeByName("LightContainer") ??
      new BABYLON.TransformNode("LightContainer", this.parent.scene);
    this.entityContainerNode =
      this.parent.scene?.getTransformNodeByName("EntityContainer") ??
      new BABYLON.TransformNode("EntityContainer", this.parent.scene);
    this.entityPool = new EntityPool(
      this.GameManager,
      this.entityContainerNode,
      this.parent.scene!,
    );
  }

  dispose(destroy = false) {
    this.loadGeneration++;
    // Dispose promoted layers before their nodes are traversed below.
    this.shadoWorldObjects?.dispose();
    this.shadoWorldObjects = null;
    this.shadoWorldScene?.dispose();
    this.shadoWorldScene = null;
    // Clean up resources if needed.
    if (this.zoneContainer) {
      this.zoneContainer.getChildren().forEach((child) => {
        if (child instanceof BABYLON.AbstractMesh) {
          child.dispose();
        } else if (child instanceof BABYLON.TransformNode) {
          child.getChildren().forEach((grandChild) => {
            if (grandChild instanceof BABYLON.AbstractMesh) {
              grandChild.dispose();
            }
          });
        }
      });
    }
    if (this.entityPool) {
      this.entityPool.dispose();
    }
    if (this.grid) {
      this.grid.dispose();
      this.grid = null;
    }
    this.animatedTextures = [];
    this.zoneObjects?.disposeAll();
    this.regionManager.dispose();
    this.lightManager.dispose();
    this.skyManager.dispose();
    if (destroy) {
      this.zoneContainer?.dispose();
      this.objectContainer?.dispose();
      this.lightContainer?.dispose();
      this.entityContainerNode?.dispose();
    }
    if (this.tickObservable) {
      this.parent.scene?.onBeforeRenderObservable.remove(this.tickObservable);
      this.tickObservable = null;
    }
  }

  public async loadZone(
    zoneName: string,
    options: { announce?: boolean } = {},
  ): Promise<void> {
    console.log("[ZoneManager] Loading zone:", zoneName);
    this.dispose();
    const generation = this.loadGeneration;
    const longName = Object.values(supportedZones).find(
      (z) => z.shortName.toLowerCase() === zoneName.toLowerCase(),
    )?.longName;
    const normalizedZoneName = zoneName.toLowerCase();
    const presentedName =
      normalizedZoneName === "qeynos" || normalizedZoneName === "qeynos2"
        ? "Southern Reach"
        : longName ?? "Unknown Reach";
    const msg: ChatMessage = {
      message: `You have entered ${presentedName}`,
      chanNum: 0,
      type: 0,
    };
    if (options.announce !== false) {
      setTimeout(() => {
        if (generation !== this.loadGeneration) return;
        emitter.emit("chatMessage", msg);
      }, 500);
    }
    this.zoneName = zoneName;

    if (this.zoneObjects) {
      this.zoneObjects.disposeAll();
    }
    this.zoneObjects = new ObjectCache(this.objectContainer);
    await this.instantiateZone(generation);
    if (generation !== this.loadGeneration) return;
    EntityCache.initialize(this.GameManager.scene!);
  }

  public async loadSpawns(spawns: Spawns) {
    console.log("Got spawns", spawns);
    if (!this.zoneContainer) {
    }
  }

  public async instantiateZone(generation = this.loadGeneration) {
    console.log("Inst zone");
    if (!this.zoneContainer) {
      return;
    }
    // this.parent.scene!.performancePriority =
    //   BABYLON.ScenePerformancePriority.Aggressive;
    if (!this.parent.scene) {
      console.error("[ZoneManager] No scene available to instantiate zone.");
      return;
    }

    // Zone Grid
    this.grid = new Grid(300.0, this.parent.scene);

    this.tickObservable = this.parent.scene.onBeforeRenderObservable.add(
      this.tick.bind(this),
    );
    this.parent.setLoading(true);
    this.zoneContainer.scaling.setAll(1);
    try {
      this.shadoWorldScene = await ShadoWorldSceneLayer.load(
        this.zoneName,
        this.parent.scene,
        this.zoneContainer,
      );
    } catch (error) {
      console.error(
        `[ZoneManager] Zone ${this.zoneName} failed current-package activation`,
        error,
      );
      this.parent.setLoading(false);
      return;
    }
    if (generation !== this.loadGeneration) {
      this.shadoWorldScene?.dispose();
      this.shadoWorldScene = null;
      return;
    }
    this.registerAnimatedTextures(this.shadoWorldScene.renderMeshes);
    this.attachStaticWorldPhysics(this.shadoWorldScene.collisionMesh);
    const bakedWorldLighting =
      this.shadoWorldScene.usesBakedWorldLighting;
    await this.skyManager.createSky(
      "requiem-sky",
      this.disableWorldEnv || bakedWorldLighting,
      this.zoneName,
      bakedWorldLighting,
    );
    this.parent.setLoading(false);
    await this.loadZoneMetadata(generation);
  }

  private registerAnimatedTextures(meshes: readonly BJS.AbstractMesh[]): void {
    const materials = new Set<BJS.Material>();
    for (const mesh of meshes) {
      const material = mesh.material;
      if (!material || materials.has(material)) continue;
      materials.add(material);
      const extras = material.metadata?.gltf?.extras;
      if (!extras?.frames?.length || !extras?.animationDelay) {
        material.freeze();
        continue;
      }
      this.animatedTextures.push({
        mesh,
        frames: extras.frames,
        delayMs: extras.animationDelay * 2,
        elapsedMs: 0,
        frame: 0,
      });
    }
  }

  private attachStaticWorldPhysics(zoneMesh: BJS.Mesh): void {
    zoneMesh.material?.freeze();
    zoneMesh.freezeWorldMatrix();
    zoneMesh.physicsBody = new BABYLON.PhysicsBody(
      zoneMesh,
      BABYLON.PhysicsMotionType.STATIC,
      false,
      this.parent.scene!,
    );
    zoneMesh.physicsBody.shape = new BABYLON.PhysicsShapeMesh(
      zoneMesh,
      this.parent.scene!,
    );
    zoneMesh.physicsBody.shape.material.friction = 1;
    zoneMesh.physicsBody.shape.material.restitution = 0;
    zoneMesh.physicsBody.setMassProperties({ mass: 0 });
  }

  private async loadZoneMetadata(generation: number): Promise<void> {
    const metadataByte = await FileSystem.getFileBytes(
      "eqrequiem/zones",
      `${this.zoneName}.json`,
    );
    if (generation !== this.loadGeneration) return;
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str) as ZoneMetadata;
        console.log("Got metadata", metadata);
        console.log("Version: ", metadata.version);
        console.log("Current zone", this.CurrentZone);
        if (!this.shadoWorldScene?.usesBakedWorldLighting) {
          this.lightManager.loadLights(
            this.lightContainer!,
            this.parent.scene!,
            metadata.lights,
            this.zoneName,
          );
        }
        setTimeout(() => {
          if (generation !== this.loadGeneration) return;
          this.GameManager.scene?.textures.forEach((t) => {
            if (
              t.name === "" &&
              !(t instanceof BABYLON.RawTexture) &&
              !(t instanceof BABYLON.RawTexture2DArray)
            ) {
              t.dispose();
              this.GameManager.scene?.removeTexture(t);
            }
          });
        }, 2000);

        // this.bakeZoneVertexColors(metadata.lights);
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    await this.instantiateWorldObjects(generation);
    if (generation !== this.loadGeneration) return;
  }

  private async instantiateWorldObjects(
    generation: number,
  ): Promise<void> {
    if (!this.zoneObjects || !this.parent.scene || !this.shadoWorldScene) return;
    try {
      this.shadoWorldObjects = await ShadoWorldObjectLayer.fromWorld(
        this.shadoWorldScene.world,
        this.shadoWorldScene.coordinator,
        this.zoneObjects,
        this.parent.scene,
      );
    } catch (error) {
      console.error(
        `[ZoneManager] World-object activation failed for ${this.zoneName}`,
        error,
      );
      return;
    }
    if (generation !== this.loadGeneration) return;
    if (this.CurrentZone?.zonePoints) {
      this.regionManager.instantiateShadoRegions(
        this.parent.scene,
        this.shadoWorldScene.world,
        this.CurrentZone.zonePoints,
      );
    }
  }

  public tick() {
    if (!this.zoneContainer) {
      return;
    }
    const delta = this.parent.scene?.getEngine().getDeltaTime() ?? 0;
    for (const animation of this.animatedTextures) {
      if (animation.mesh.isDisposed()) continue;
      animation.elapsedMs += delta;
      if (animation.elapsedMs < animation.delayMs) continue;
      animation.elapsedMs %= animation.delayMs;
      animation.frame = (animation.frame + 1) % animation.frames.length;
      swapMaterialTexture(
        animation.mesh.material!,
        animation.frames[animation.frame],
        true,
      );
    }
    this.skyManager.tick(delta);
    this.shadoWorldObjects?.tick(delta);
    this.entityPool?.process(delta);
    if (!this.shadoWorldScene?.usesBakedWorldLighting) {
      this.lightManager.updateLights(delta);
    }
  }
}
