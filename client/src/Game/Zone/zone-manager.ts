import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { FileSystem } from "@game/FileSystem/filesystem";
import type GameManager from "@game/Manager/game-manager";
import { RegionManager } from "@game/Regions/region-manager";
import { LightManager } from "@game/Lights/light-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import { Spawns } from "@game/Net/internal/api/capnp/common";
import EntityPool from "./entity-pool";
import ObjectCache from "@/Game/Model/object-cache";
import { ZoneMetadata } from "./zone-types";
import { swapMaterialTexture } from "@game/Model/bjs-utils";
import { supportedZones } from "@game/Constants/supportedZones";
import emitter, { ChatMessage } from "@game/Events/events";

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

  get EntityPool(): EntityPool | null {
    return this.entityPool;
  }
  private entityPool: EntityPool | null = null;
  private zoneObjects: ObjectCache | null = null;

  private disableWorldEnv: boolean = false;
  public zoneName = "qeynos2";
  public get CurrentZone() {
    return this.parent.CurrentZone;
  }

  get GameManager(): GameManager {
    return this.parent;
  }
  private parent: GameManager;

  private intervals: NodeJS.Timeout[] = [];

  constructor(parent: GameManager) {
    this.parent = parent;
    this.zoneContainer = null;
    this.regionManager = new RegionManager(this.GameManager);
    this.lightManager = new LightManager();
    this.skyManager = new DayNightSkyManager(this);
    this.zoneContainer = new BABYLON.TransformNode(
      "ZoneContainer",
      this.parent.scene,
    );
    this.objectContainer = new BABYLON.TransformNode(
      "ZoneObjectContainer",
      this.parent.scene,
    );
    this.lightContainer = new BABYLON.TransformNode(
      "LightContainer",
      this.parent.scene,
    );
    this.entityContainerNode = new BABYLON.TransformNode(
      "EntityContainer",
      this.parent.scene,
    );
    this.entityPool = new EntityPool(
      this.GameManager,
      this.entityContainerNode,
      this.parent.scene!,
    );
  }

  dispose() {
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
    // if (this.objectContainer) {
    //   this.objectContainer.dispose();
    // }
    // if (this.lightContainer) {
    //   this.lightContainer.dispose();
    // }
    // if (this.entityContainerNode) {
    //   this.entityContainerNode.dispose();
    // }
    if (this.entityPool) {
      this.entityPool.dispose();
    }
    this.intervals.forEach((i) => {
      clearInterval(i);
    });
    this.zoneObjects?.disposeAll();
    this.regionManager.dispose();
    this.lightManager.dispose();
    this.skyManager.dispose();
  }


  public async loadZone(zoneName: string): Promise<void> {
    console.log("[ZoneManager] Loading zone:", zoneName);
    this.dispose();
    const longName = Object.values(supportedZones).find(
      (z) => z.shortName.toLowerCase() === zoneName.toLowerCase(),
    )?.longName;
    const msg: ChatMessage = {
      message: `You have entered ${longName}`,
      chanNum: 0,
      color: "#ddd",
      type: 0,
    };
    setTimeout(() => {
      emitter.emit("chatMessage", msg);
    }, 500);
    console.log(`You have entered ${longName}`);
    this.zoneName = zoneName;


    if (this.zoneObjects) {
      this.zoneObjects.disposeAll();
    }
    this.zoneObjects = new ObjectCache(this.objectContainer);
    await this.instantiateZone();
  }

  public async loadSpawns(spawns: Spawns) {
    console.log("Got spawns", spawns);
    if (!this.zoneContainer) {
      return;
    }
  }
  public async instantiateZone() {
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
    this.parent.scene.onBeforeRenderObservable.add(this.tick.bind(this));
    this.parent.setLoading(true);
    const bytes = await FileSystem.getFileBytes(
      `eqrequiem/zones`,
      `${this.zoneName}.babylon`,
    );
    if (!bytes) {
      console.log(`[ZoneManager] Failed to load zone file: ${this.zoneName}`);
      this.parent.setLoading(false);
      return;
    }
    const file = new File([bytes], `${this.zoneName}.babylon`, {
      type: "application/babylon",
    });
    const result = await BABYLON.LoadAssetContainerAsync(
      file,
      this.parent.scene!,
    ).catch((error) => {
      console.error(`[ZoneManager] Error importing zone mesh: ${error}`);
      this.parent.setLoading(false);
      return null;
    });
    if (!result) {
      console.error(
        `[ZoneManager] Failed to import zone mesh: ${this.zoneName}`,
      );
      this.parent.setLoading(false);
      return;
    }
    result.addAllToScene();
    this.zoneContainer!.scaling.x = -1;

    result.meshes.forEach((mesh) => {
      mesh.isPickable = true;
      mesh.collisionMask = 0x0000dad1;
      const materialExtras = mesh?.material?.metadata?.gltf?.extras;
      if (materialExtras?.frames?.length && materialExtras?.animationDelay) {
        const { frames, animationDelay } = materialExtras;
        let currentFrameIndex = 0;
        const intervalId = setInterval(() => {
          try {
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            const selectedFrame = frames[currentFrameIndex] as string;
            swapMaterialTexture(mesh.material!, selectedFrame, true);
          } catch (error) {
            console.error(
              `[ZoneManager] Failed to swap texture for mesh ${mesh.name}:`,
              error,
            );
            clearInterval(intervalId);
          }
        }, animationDelay * 2);

        this.intervals.push(intervalId);
      }
      mesh.parent = this.zoneContainer;

      const passThrough = mesh.metadata?.gltf?.extras?.passThrough ?? false;
      if (!passThrough) {
        // Create physics body for static zone geometry
        mesh.physicsBody = new BABYLON.PhysicsBody(
          mesh,
          BABYLON.PhysicsMotionType.STATIC,
          false,
          this.parent.scene!,
        );
        // Use PhysicsShapeMesh for complex geometry
        mesh.physicsBody.shape = new BABYLON.PhysicsShapeMesh(
          mesh as BJS.Mesh, // The mesh to base the shape on
          this.parent.scene!,
        );
        mesh.physicsBody.shape.material.friction = 1;
        mesh.physicsBody.shape.material.restitution = 0;
        mesh.physicsBody.setMassProperties({ mass: 0 }); // Static
      }
    });

    this.skyManager.createSky("sky1", this.disableWorldEnv);
    this.parent.setLoading(false);

    const metadataByte = await FileSystem.getFileBytes(
      `eqrequiem/zones`,
      `${this.zoneName}.json`,
    );
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
        if (this.CurrentZone?.zonePoints) {
          this.regionManager.instantiateRegions(
            this.GameManager.scene!,
            metadata,
            this.GameManager.CurrentZone?.zonePoints,
          );
        }
        this.instantiateObjects(metadata).then(() => {
          this.dedupeMaterialsByName();
        });
  
        //this.bakeZoneVertexColors(metadata.lights);
   
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }

    this.entityPool?.initialize();

    setTimeout(() => {
      this.dedupeMaterialsByName();
    }, 1000);
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

  public tick() {
    if (!this.zoneContainer) {
      return;
    }
    const delta = this.parent.scene?.getEngine().getDeltaTime() ?? 0;
    this.skyManager.tick(delta);
    this.entityPool?.process();
    this.lightManager.updateLights(delta);
  }
}
