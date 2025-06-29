import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import type GameManager from "@game/Manager/game-manager";
import { RegionManager } from "@game/Regions/region-manager";
import { LightData, LightManager } from "@game/Lights/light-manager";
import DayNightSkyManager from "@game/Sky/sky-manager";
import { Spawns } from "@game/Net/internal/api/capnp/common";
import EntityPool from "./entity-pool";
import ObjectCache from "@/Game/Model/object-cache";
import { ZoneMetadata } from "./zone-types";
import { swapMaterialTexture } from "@game/Model/bjs-utils";
import { supportedZones } from "@game/Constants/supportedZones";
import { ChatMessage } from "@ui/components/game/chat/chat-types";
import emitter from "@game/Events/events";

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
  private metadata: ZoneMetadata | null = null;

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
    this.regionManager = new RegionManager();
    this.lightManager = new LightManager();
    this.skyManager = new DayNightSkyManager(this);
  }

  dispose() {
    // Clean up resources if needed.
    if (this.zoneContainer) {
      this.zoneContainer.dispose();
      this.zoneContainer = null;
    }
    if (this.objectContainer) {
      this.objectContainer.dispose();
      this.objectContainer = null;
    }
    if (this.lightContainer) {
      this.lightContainer.dispose();
      this.lightContainer = null;
    }
    if (this.entityContainerNode) {
      this.entityContainerNode.dispose();
      this.entityContainerNode = null;
    }
    if (this.entityPool) {
      this.entityPool.dispose();
      this.entityPool = null;
    }
    this.intervals.forEach((i) => {
      clearInterval(i);
    });
    this.zoneObjects?.disposeAll();
    this.regionManager.dispose();
    this.lightManager.dispose();
    this.skyManager.dispose();
    this.parent.scene?.onBeforeRenderObservable.remove(this.tick.bind(this));
  }
  private bakeZoneVertexColors(
    lights: LightData[],
    constantAtt: number = 0.5,
    linearAtt: number = 0.02,
    quadAtt: number = 0.001,
    ambientTerm: number = 0.1,    // ← base light so nothing goes pitch-black
  ): void {
    const scene = this.parent.scene!;

    scene.meshes.forEach((mesh) => {
      if (mesh.parent !== this.zoneContainer || !(mesh as BJS.Mesh).geometry) {
        return;
      }

      // 1) (Optional) ensure normals are smooth / shared before baking:
      //    mesh.forceSharedVertices();
      //    // or for a flat-shaded look:
      //    // (mesh as BJS.Mesh).convertToFlatShadedMesh();

      const positions    = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)!;
      const normals      = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind)!;
      const worldMat     = mesh.getWorldMatrix();

      // 2) Inverse-transpose for correct normal transforms under negative scale
      const normalMatrix = worldMat.clone().invert().transpose();

      const wPos   = new BABYLON.Vector3();
      const wNorm  = new BABYLON.Vector3();
      const tmpCol = new BABYLON.Color3();
      const toLight= new BABYLON.Vector3();

      const colorArray = new Float32Array(positions.length);

      for (let i = 0; i < positions.length; i += 3) {
      // world-space position
        BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(
          positions[i], positions[i + 1], positions[i + 2],
          worldMat, wPos,
        );

        // world-space normal via inverse-transpose
        BABYLON.Vector3.TransformNormalFromFloatsToRef(
          normals[i], normals[i + 1], normals[i + 2],
          normalMatrix, wNorm,
        );
        wNorm.normalize();

        // 4) ambient base
        tmpCol.set(ambientTerm, ambientTerm, ambientTerm);

        // accumulate each light
        for (const L of lights) {
          toLight.set(-L.x, L.y, L.z).subtractInPlace(wPos);
          const dist = toLight.length();
          toLight.normalize();

          const NdotL = Math.max(0, BABYLON.Vector3.Dot(wNorm, toLight));
          if (NdotL <= 0) { continue; }

          const att = 1.0 / (constantAtt + linearAtt * dist + quadAtt * dist * dist);

          tmpCol.r += L.r * NdotL * att;
          tmpCol.g += L.g * NdotL * att;
          tmpCol.b += L.b * NdotL * att;
        }

        // → gamma-correct into sRGB (so your eye sees linear light properly)
        tmpCol.r = Math.pow(tmpCol.r, 1 / 2.2);
        tmpCol.g = Math.pow(tmpCol.g, 1 / 2.2);
        tmpCol.b = Math.pow(tmpCol.b, 1 / 2.2);

        // → clamp to [0,1] to avoid HDR “leaks”
        tmpCol.r = Math.min(1, Math.max(0, tmpCol.r));
        tmpCol.g = Math.min(1, Math.max(0, tmpCol.g));
        tmpCol.b = Math.min(1, Math.max(0, tmpCol.b));

        colorArray[i]     = tmpCol.r;
        colorArray[i + 1] = tmpCol.g;
        colorArray[i + 2] = tmpCol.b;
      }

      // upload & enable
      (mesh as BJS.Mesh).setVerticesData(
        BABYLON.VertexBuffer.ColorKind,
        colorArray,
        false,
      );
      mesh.useVertexColors = true;
    });
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

    if (this.zoneObjects) {
      this.zoneObjects.disposeAll();
    }
    this.zoneObjects = new ObjectCache(this.objectContainer);
    this.instantiateZone();
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
    console.log("Result", result);
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
        this.metadata = metadata;
        console.log("Got metadata", metadata);
        console.log("Version: ", metadata.version);
        console.log("Current zone", this.CurrentZone);
        await this.instantiateObjects(metadata);
        this.lightManager.loadLights(
          this.lightContainer!,
          this.parent.scene!,
          metadata.lights,
        );
        //this.bakeZoneVertexColors(metadata.lights);
        if (this.CurrentZone?.zonePoints) {
          this.regionManager.instantiateRegions(
            this.GameManager.scene!,
            metadata,
            this.GameManager.CurrentZone?.zonePoints,
          );
        }
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }

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
