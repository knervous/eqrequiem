import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import ObjectCache from "@/Game/Model/object-cache";
import { ZoneGeometryFx } from "@/fx/zone-geometry-fx";
import { supportedZones } from "@game/Constants/supportedZones";
import emitter, { ChatMessage } from "@game/Events/events";
import { FileSystem } from "@game/FileSystem/filesystem";
import type GameManager from "@game/Manager/game-manager";
import EntityCache from "@game/Model/entity-cache";
import { Spawns } from "@game/Net/messages";
import { RegionManager } from "@game/Regions/region-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import EntityPool from "./entity-pool";
import { ShadoWorldObjectLayer } from "./shado-world-object-layer";
import { ShadoWorldSceneLayer } from "./shado-world-scene-layer";
import { ShadoWorldPhysicsStreamer } from "./shado-world-physics-streamer";
import { Grid } from "./zone-grid";
import { ZoneMetadata } from "./zone-types";

export class ZoneManager {
  get RegionManager(): RegionManager {
    return this.regionManager;
  }

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
  private shadoWorldPhysics: ShadoWorldPhysicsStreamer | null = null;
  private zoneGeometryFx: ZoneGeometryFx | null = null;

  private disableWorldEnv: boolean = false;
  public zoneName = "";
  public get CurrentZone() {
    return this.parent.CurrentZone;
  }

  get GameManager(): GameManager {
    return this.parent;
  }
  private parent: GameManager;

  private loadGeneration = 0;

  constructor(parent: GameManager) {
    this.parent = parent;
    this.zoneContainer = null;
    this.regionManager = new RegionManager(this.GameManager);
    this.skyManager = new DayNightSkyManager(this);
    this.zoneContainer =
      this.parent.scene?.getTransformNodeByName("ZoneContainer") ??
      new BABYLON.TransformNode("ZoneContainer", this.parent.scene);
    this.objectContainer =
      this.parent.scene?.getTransformNodeByName("ZoneObjectContainer") ??
      new BABYLON.TransformNode("ZoneObjectContainer", this.parent.scene);
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
    this.zoneGeometryFx?.dispose();
    this.zoneGeometryFx = null;
    this.shadoWorldPhysics?.dispose();
    this.shadoWorldPhysics = null;
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
    this.zoneObjects?.disposeAll();
    this.regionManager.dispose();
    this.skyManager.dispose();
    if (destroy) {
      this.zoneContainer?.dispose();
      this.objectContainer?.dispose();
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
        : (longName ?? "Unknown Reach");
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
    EntityCache.initialize(
      this.GameManager.scene!,
      this.shadoWorldScene ? {
        world: this.shadoWorldScene.world,
        coordinator: this.shadoWorldScene.coordinator,
      } : undefined,
    );
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
    this.zoneGeometryFx = ZoneGeometryFx.attach(
      this.shadoWorldScene.renderMeshes,
      this.parent.scene,
      this.shadoWorldScene.world,
      this.shadoWorldScene.coordinator,
    );
    this.shadoWorldPhysics = new ShadoWorldPhysicsStreamer(
      this.shadoWorldScene.collision,
      this.parent.scene,
      this.zoneContainer,
    );
    // Authored local light/AO values are baked into static geometry and
    // promoted objects. Keep the real sky rig alive so daylight still changes
    // those PBR surfaces and actors; player lights are the other permitted
    // dynamic-light authority.
    await this.skyManager.createSky(
      "requiem-sky",
      this.disableWorldEnv,
      this.zoneName,
    );
    this.parent.setLoading(false);
    await this.loadZoneMetadata(generation);
  }

  public ensureWorldPhysicsAt(position: BJS.Vector3): void {
    this.shadoWorldPhysics?.ensureAt(position);
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
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    await this.instantiateWorldObjects(generation);
    if (generation !== this.loadGeneration) return;
  }

  private async instantiateWorldObjects(generation: number): Promise<void> {
    if (!this.zoneObjects || !this.parent.scene || !this.shadoWorldScene)
      return;
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
    const playerEntity = this.parent.player?.playerEntity ?? null;
    const playerPosition = playerEntity?.getAbsolutePosition() ?? null;
    if (playerPosition) {
      this.shadoWorldPhysics?.ensureAt(
        playerPosition,
        playerEntity?.physicsBody?.getLinearVelocity() ?? null,
      );
    }
    this.shadoWorldScene?.tick(delta);
    // Update the Babylon sky lights before custom zone ShaderMaterials bind
    // them so specialized grass/water stays in lockstep with the day cycle.
    this.skyManager.tick(delta);
    this.zoneGeometryFx?.tick(
      delta,
      this.parent.scene?.activeCamera ?? null,
      playerPosition,
    );
    this.shadoWorldObjects?.tick(delta);
    this.entityPool?.process(delta);
  }
}
