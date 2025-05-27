// src/Game/Model/entity-cache.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { FileSystem } from "@game/FileSystem/filesystem";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import RACE_DATA from "@game/Constants/race-data";
import { Entity, EntityContainer } from "./entity";

type ModelKey = string;

export default class EntityCache {
  public containers: Record<ModelKey, Promise<EntityContainer>> = {};
  private physicsBodies: Record<ModelKey, BJS.PhysicsBody[] | null> = {};
  private intervals: NodeJS.Timeout[] = [];

  // Merge meshes for the main model
  protected getMergedMesh(container: BJS.AssetContainer, skeleton: BJS.Skeleton): BJS.Mesh | null {
    const meshes = container.rootNodes[0]?.getChildMeshes().filter((mesh) => mesh.getTotalVertices() > 0) ?? [];
    if (meshes.length === 0) {
      console.warn(`No valid meshes found in container ${container.rootNodes[0]?.name}`);
      return null;
    }
    try {
      const mergedMesh = BABYLON.Mesh.MergeMeshes(
        meshes as BJS.Mesh[],
        true, // dispose source meshes
        true, // allow 32-bit indices
        undefined, // mesh subclass
        true, // merge materials
        true, // multi-material
      );
      if (!mergedMesh) {
        throw new Error("MergeMeshes returned null");
      }
      mergedMesh.name = `merged_${container.rootNodes[0]?.name || "unknown"}`;
      mergedMesh.skeleton = skeleton;
      return mergedMesh;
    } catch (e) {
      console.warn(`[EntityCache] Warning merging object ${container.rootNodes[0]?.name}:`, e);
      return null;
    }
  }

  async getContainer(spawn: Spawn, scene: BJS.Scene): Promise<EntityContainer | null> {
    const race = spawn?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[spawn.gender ?? 0] || raceDataEntry[2];

    if (!this.containers[model]) {
      this.containers[model] = new Promise(async (res) => {
        // Load main model
        const bytes = await FileSystem.getFileBytes(`eqrequiem/models`, `${model}.glb`);
        if (!bytes) {
          console.warn(`[EntityCache] Failed to load model ${model}`);
          res(null);
          return;
        }
        const file = new File([bytes!], `${model}.glb`, { type: "model/gltf-binary" });
        const result = await BABYLON.SceneLoader.LoadAssetContainerAsync("", file, scene);
        if (!result) {
          console.error(`Failed to load model ${model}`);
          res(null);
          return;
        }

        result.rootNodes[0].name = `container_${model}`;
        const { animationGroups, skeletons } = result;
        const skeleton = skeletons[0];
        const ranges = [] as { name: string; from: number; to: number }[];
        let startTime = 0;
        for (const animGroup of animationGroups) {
          ranges.push({
            name: animGroup.name,
            from: Math.floor(animGroup.from) + startTime,
            to: Math.floor(animGroup.to) + startTime,
          });
          startTime += Math.round(animGroup.to);
        }

        // Load VAT data
        const vatDataBytes = await FileSystem.getFileBytes("eqrequiem/vat", `${model}.bin`);
        let vatData: Float32Array | null = null;
        if (vatDataBytes) {
          vatData = new Float32Array(vatDataBytes);
        } else {
          console.warn(`No VAT data found for model ${model}`);
          res(null);
          return;
        }

        // Merge main model mesh
        const mergedMesh = this.getMergedMesh(result, skeleton);
        if (!mergedMesh) {
          console.warn(`Failed to merge meshes for model ${model}`);
          res(null);
          return;
        }

        // Set up VAT for main mesh
        mergedMesh.registerInstancedBuffer("bakedVertexAnimationSettingsInstanced", 4);
        mergedMesh.instancedBuffers.bakedVertexAnimationSettingsInstanced = new BABYLON.Vector4(0, 0, 0, 0);
        const baker = new BABYLON.VertexAnimationBaker(scene, mergedMesh);
        const manager = new BABYLON.BakedVertexAnimationManager(scene);
        mergedMesh.bakedVertexAnimationManager = manager;
 
        const vertexTexture = baker.textureFromBakedVertexData(vatData);
        manager.texture = vertexTexture;
        mergedMesh.setEnabled(false); // Hide merged mesh

        // Set up render observer for VAT time
        const renderObserver = scene.onAfterRenderObservable.add(() => {
          manager.time += scene.getEngine().getDeltaTime() / 1000.0;
        });

        // Clean up
        animationGroups.forEach((ag) => ag.dispose());
        result.animationGroups = [];
        scene.removeSkeleton(skeleton);

        const entityContainer: EntityContainer = {
          renderObserver,
          manager,
          mesh: mergedMesh,
          animationRanges: ranges,
        };
        res(entityContainer);
      });
    }
    return this.containers[model];
  }

  async getInstance(spawn: Spawn, scene: BJS.Scene, entityContainer: BJS.Node): Promise<Entity | null> {
    const container = await this.getContainer(spawn, scene);
    if (!container) {
      return null;
    }
    return new Entity(spawn, container, scene, entityContainer);
  }

  dispose(model: ModelKey): void {
    if (model in this.containers) {
      this.containers[model].then((container) => {
        if (this.physicsBodies[model]) {
          this.physicsBodies[model]?.forEach?.((p) => p.dispose());
          delete this.physicsBodies[model];
        }
        container.mesh?.dispose();
        container.manager?.dispose();
        container.mesh._scene.onAfterRenderObservable.remove(container.renderObserver);
      });
      delete this.containers[model];
    }
  }

  disposeAll(): void {
    this.intervals.forEach((interval) => clearInterval(interval));
    Object.keys(this.containers).forEach((model) => this.dispose(model));
  }
}