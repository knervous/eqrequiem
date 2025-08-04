import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { supportedZones } from '@game/Constants/supportedZones';
import emitter, { ChatMessage } from '@game/Events/events';
import { FileSystem } from '@game/FileSystem/filesystem';
import { LightManager } from '@game/Lights/light-manager';
import type GameManager from '@game/Manager/game-manager';
import { swapMaterialTexture } from '@game/Model/bjs-utils';
import EntityCache from '@game/Model/entity-cache';
import { Spawns } from '@game/Net/internal/api/capnp/common';
import { RegionManager } from '@game/Regions/region-manager';
import DayNightSkyManager from '@game/Sky/sky-manager';
import EntityPool from './entity-pool';
import { Grid } from './zone-grid';
import { ZoneMetadata } from './zone-types';
import ObjectCache from '@/Game/Model/object-cache';

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

  private disableWorldEnv: boolean = false;
  public zoneName = 'qeynos2';
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
    this.zoneContainer =
      this.parent.scene?.getTransformNodeByName('ZoneContainer') ??
      new BABYLON.TransformNode('ZoneContainer', this.parent.scene);
    this.objectContainer =
      this.parent.scene?.getTransformNodeByName('ZoneObjectContainer') ??
      new BABYLON.TransformNode('ZoneObjectContainer', this.parent.scene);
    this.lightContainer =
      this.parent.scene?.getTransformNodeByName('LightContainer') ??
      new BABYLON.TransformNode('LightContainer', this.parent.scene);
    this.entityContainerNode =
      this.parent.scene?.getTransformNodeByName('EntityContainer') ??
      new BABYLON.TransformNode('EntityContainer', this.parent.scene);
    this.entityPool = new EntityPool(
      this.GameManager,
      this.entityContainerNode,
      this.parent.scene!,
    );
  }

  dispose(destroy = false) {
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
    this.intervals.forEach((i) => {
      clearInterval(i);
    });
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

  public async loadZone(zoneName: string): Promise<void> {
    console.log('[ZoneManager] Loading zone:', zoneName);
    this.dispose();
    const longName = Object.values(supportedZones).find(
      (z) => z.shortName.toLowerCase() === zoneName.toLowerCase(),
    )?.longName;
    const msg: ChatMessage = {
      message: `You have entered ${longName}`,
      chanNum: 0,
      type   : 0,
    };
    setTimeout(() => {
      emitter.emit('chatMessage', msg);
    }, 500);
    this.zoneName = zoneName;

    if (this.zoneObjects) {
      this.zoneObjects.disposeAll();
    }
    this.zoneObjects = new ObjectCache(this.objectContainer);
    await this.instantiateZone();
    EntityCache.initialize(this.GameManager.scene!);
  }

  public async loadSpawns(spawns: Spawns) {
    console.log('Got spawns', spawns);
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

  public async instantiateZone() {
    console.log('Inst zone');
    if (!this.zoneContainer) {
      return;
    }
    // this.parent.scene!.performancePriority =
    //   BABYLON.ScenePerformancePriority.Aggressive;
    if (!this.parent.scene) {
      console.error('[ZoneManager] No scene available to instantiate zone.');
      return;
    }

    // Zone Grid
    this.grid = new Grid(150.0, this.parent.scene);

    this.tickObservable = this.parent.scene.onBeforeRenderObservable.add(
      this.tick.bind(this),
    );
    this.parent.setLoading(true);
    const bytes = await FileSystem.getFileBytes(
      'eqrequiem/zones',
      `${this.zoneName}.babylon`,
    );
    if (!bytes) {
      console.log(`[ZoneManager] Failed to load zone file: ${this.zoneName}`);
      this.parent.setLoading(false);
      return;
    }
    const file = new File([bytes], `${this.zoneName}.babylon`, {
      type: 'application/babylon',
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
    // result.addAllToScene();
    this.zoneContainer!.scaling.x = -1;
    const staticMeshes: BJS.Mesh[] = [];
    const passthroughMeshes: BJS.Mesh[] = [];

    result.meshes.forEach((mesh) => {
      mesh.isPickable = true;
      mesh.collisionMask = 0x0000dad1;
      let canMerged = true;
      const materialExtras = mesh?.material?.metadata?.gltf?.extras;
      if (materialExtras?.frames?.length && materialExtras?.animationDelay) {
        canMerged = false;
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
        if (mesh.name === 'CLOUD_MDF') {
          mesh.setEnabled(false);
        }
      } else {
        passthroughMeshes.push(mesh as BJS.Mesh);
      }
    });

    const passThroughMesh = BABYLON.Mesh.MergeMeshes(
      passthroughMeshes.filter((m) => m.getTotalVertices() > 0),
      true,
      true,
      undefined,
      false,
      true,
    );
    const zoneMesh = BABYLON.Mesh.MergeMeshes(
      staticMeshes.filter((m) => m.getTotalVertices() > 0),
      true,
      true,
      undefined,
      false,
      true,
    );
    if (!zoneMesh || !passThroughMesh) {
      console.error('[ZoneManager] Failed to merge zone meshes');
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
    passThroughMesh.setParent(this.zoneContainer);
    this.skyManager.createSky('sky1', this.disableWorldEnv);
    this.parent.setLoading(false);

    const metadataByte = await FileSystem.getFileBytes(
      'eqrequiem/zones',
      `${this.zoneName}.json`,
    );
    if (metadataByte) {
      try {
        const str = new TextDecoder('utf-8').decode(metadataByte);
        const metadata = JSON.parse(str) as ZoneMetadata;
        console.log('Got metadata', metadata);
        console.log('Version: ', metadata.version);
        console.log('Current zone', this.CurrentZone);
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
          this.cleanupUnusedMaterials();
        });
        setTimeout(() => {
          this.GameManager.scene?.textures.forEach((t) => {
            if (
              t.name === '' &&
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
        console.log('Error parsing zone metadata', e);
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
