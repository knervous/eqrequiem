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
  private worldTickElapsedMs = 0;
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
    this.worldTickElapsedMs = 0;
    this.zoneObjects?.disposeAll();
    this.shadoWorldObjects?.dispose();
    this.shadoWorldObjects = null;
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

  public async loadZone(zoneName: string): Promise<void> {
    console.log("[ZoneManager] Loading zone:", zoneName);
    this.dispose();
    const generation = this.loadGeneration;
    const longName = Object.values(supportedZones).find(
      (z) => z.shortName.toLowerCase() === zoneName.toLowerCase(),
    )?.longName;
    const msg: ChatMessage = {
      message: `You have entered ${longName}`,
      chanNum: 0,
      type: 0,
    };
    setTimeout(() => {
      emitter.emit("chatMessage", msg);
    }, 500);
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

  private cleanupUnusedMaterials() {
    const scene = this.parent.scene;
    if (!scene) {
      return;
    }

    // Make a copy since disposing will mutate scene.materials
    for (const mat of scene.materials.slice()) {
      // check if any mesh or subMaterial is referencing it
      const used = scene.meshes.some((mesh) => {
        if (mesh.material === mat) {
          return true;
        }
        if (mesh.material instanceof BABYLON.MultiMaterial) {
          return (mesh.material as BJS.MultiMaterial).subMaterials.some(
            (sub) => sub === mat,
          );
        }
        return false;
      });

      if (!used) {
        // dispose material and force-dispose its textures
        mat.dispose(true, true);
        scene.removeMaterial(mat);
        console.log(`[ZoneManager] Disposed unused material: ${mat.name}`);
      }
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
    const bytes = await FileSystem.getFileBytes(
      "eqrequiem/zones",
      `${this.zoneName}.babylon`,
    );
    if (generation !== this.loadGeneration) return;
    if (!bytes) {
      console.log(`[ZoneManager] Failed to load zone file: ${this.zoneName}`);
      this.parent.setLoading(false);
      return;
    }
    const result = await BABYLON.loadBabylonAssetContainer(
      bytes,
      this.parent.scene!,
      { name: `${this.zoneName}.babylon` },
    ).catch((error) => {
      console.error(`[ZoneManager] Error importing zone mesh: ${error}`);
      this.parent.setLoading(false);
      return null;
    });
    if (generation !== this.loadGeneration) {
      result?.dispose();
      return;
    }
    if (!result) {
      console.error(
        `[ZoneManager] Failed to import zone mesh: ${this.zoneName}`,
      );
      this.parent.setLoading(false);
      return;
    }
    // result.addAllToScene();
    this.zoneContainer!.scaling.x = -1;
    const renderableMeshes = result.meshes.filter(
      (mesh): mesh is BJS.Mesh =>
        mesh instanceof BABYLON.Mesh && mesh.getTotalVertices() > 0,
    );
    if (!renderableMeshes.length) {
      console.error(
        `[ZoneManager] Zone ${this.zoneName} contains no renderable meshes`,
      );
      result.dispose();
      this.parent.setLoading(false);
      return;
    }
    const staticMeshes: BJS.Mesh[] = [];
    const passthroughMeshes: BJS.Mesh[] = [];

    renderableMeshes.forEach((mesh) => {
      mesh.isPickable = true;
      mesh.collisionMask = 0x0000dad1;
      let canMerged = true;
      const materialExtras = mesh?.material?.metadata?.gltf?.extras;
      if (materialExtras?.frames?.length && materialExtras?.animationDelay) {
        canMerged = false;
        const { frames, animationDelay } = materialExtras;
        this.animatedTextures.push({
          mesh,
          frames,
          delayMs: animationDelay * 2,
          elapsedMs: 0,
          frame: 0,
        });
      } else {
        mesh.material?.freeze();
      }

      mesh.parent = this.zoneContainer;

      const passThrough = mesh.metadata?.gltf?.extras?.passThrough ?? false;
      if (!passThrough) {
        if (canMerged) {
          staticMeshes.push(mesh as BJS.Mesh);
        }
        // Disable the cloud mdf always
        if (mesh.name === "CLOUD_MDF") {
          mesh.setEnabled(false);
        }
      } else {
        passthroughMeshes.push(mesh as BJS.Mesh);
      }
    });

    const mergeablePassthroughMeshes = passthroughMeshes.filter(
      (mesh) => mesh.getTotalVertices() > 0,
    );
    const passThroughMesh = mergeablePassthroughMeshes.length
      ? BABYLON.Mesh.MergeMeshes(
          mergeablePassthroughMeshes,
          true,
          true,
          undefined,
          false,
          true,
        )
      : null;
    const zoneMesh = BABYLON.Mesh.MergeMeshes(
      staticMeshes.filter((m) => m.getTotalVertices() > 0),
      true,
      true,
      undefined,
      false,
      true,
    );
    if (!zoneMesh) {
      console.error("[ZoneManager] Failed to merge zone meshes");
      this.parent.setLoading(false);
      return;
    }
    zoneMesh.material?.freeze();
    zoneMesh.freezeWorldMatrix();
    zoneMesh.physicsBody = new BABYLON.PhysicsBody(
      zoneMesh,
      BABYLON.PhysicsMotionType.STATIC,
      false,
      this.parent.scene!,
    );
    zoneMesh.physicsBody.shape = new BABYLON.PhysicsShapeMesh(
      zoneMesh as BJS.Mesh,
      this.parent.scene!,
    );
    zoneMesh.physicsBody.shape.material.friction = 1;
    zoneMesh.physicsBody.shape.material.restitution = 0;
    zoneMesh.physicsBody.setMassProperties({ mass: 0 }); // Static
    zoneMesh.setParent(this.zoneContainer);
    passThroughMesh?.setParent(this.zoneContainer);
    this.skyManager.createSky("sky1", this.disableWorldEnv);
    this.parent.setLoading(false);

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
        this.lightManager.loadLights(
          this.lightContainer!,
          this.parent.scene!,
          metadata.lights,
          this.zoneName,
        );
        this.instantiatePromotedObjects(metadata, generation).then(() => {
          if (generation !== this.loadGeneration) return;
          this.dedupeMaterialsByName();
          this.cleanupUnusedMaterials();
        });
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
  }

  private dedupeMaterialsByName() {
    if (!this.GameManager.scene) {
      return;
    }
    const meshes: BJS.AbstractMesh[] = this.GameManager.scene.meshes;
    const materials: BJS.Material[] = this.GameManager.scene.materials;

    const nameMap = new Map<string, BJS.Material>();

    for (const mat of materials.slice()) {
      if (!mat.name) {
        continue;
      }
      const key = mat.name;

      if (!nameMap.has(key)) {
        // first time we see this name → keep it
        nameMap.set(key, mat);
        // mat.freeze();
      } else {
        // duplicate name → remap all references, then dispose
        const canonical = nameMap.get(key)!;

        for (const mesh of meshes) {
          // mesh.isPickable = false;
          if (mesh.material === mat) {
            mesh.material = canonical;
          } else if (mesh.material instanceof BABYLON.MultiMaterial) {
            const mm = mesh.material as BJS.MultiMaterial;
            mm.subMaterials = mm.subMaterials.map((sub) => {
              if (sub === mat) {
                return canonical;
              }
              return sub;
            });
          }
        }

        mat.dispose(true, true);
      }
    }
  }

  private async instantiateObjects(metadata: ZoneMetadata) {
    if (!this.zoneObjects) {
      return;
    }
    for (const [key, values] of Object.entries(metadata.objects)) {
      this.zoneObjects.addThinInstances(key, this.parent.scene!, values);
    }
  }

  private async instantiatePromotedObjects(
    metadata: ZoneMetadata,
    generation: number,
  ): Promise<void> {
    if (!this.zoneObjects || !this.parent.scene) return;
    try {
      this.shadoWorldObjects = await ShadoWorldObjectLayer.load(
        this.zoneName,
        this.zoneObjects,
        this.parent.scene,
      );
    } catch (error) {
      console.warn(
        `[ZoneManager] Promoted world bootstrap failed for ${this.zoneName}; ` +
          "using legacy metadata",
        error,
      );
      this.shadoWorldObjects = null;
    }
    if (generation !== this.loadGeneration) return;
    if (this.shadoWorldObjects) {
      if (this.CurrentZone?.zonePoints) {
        this.regionManager.instantiateShadoRegions(
          this.parent.scene,
          this.shadoWorldObjects.world,
          this.CurrentZone.zonePoints,
        );
      }
    } else {
      if (this.CurrentZone?.zonePoints) {
        this.regionManager.instantiateRegions(
          this.parent.scene,
          metadata,
          this.CurrentZone.zonePoints,
        );
      }
      await this.instantiateObjects(metadata);
      console.info(
        `[ZoneManager] No promoted world package for ${this.zoneName}; ` +
          "using legacy object metadata",
      );
    }
  }

  public tick() {
    if (!this.zoneContainer) {
      return;
    }
    const delta = this.parent.scene?.getEngine().getDeltaTime() ?? 0;
    this.worldTickElapsedMs += delta;
    if (this.worldTickElapsedMs >= 1000) {
      this.worldTickElapsedMs %= 1000;
      this.skyManager.worldTick?.();
    }
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
    this.entityPool?.process();
    this.lightManager.updateLights(delta);
  }
}
