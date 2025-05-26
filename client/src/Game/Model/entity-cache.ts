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

  protected getMergedMesh(container: BJS.AssetContainer): BJS.Mesh | null {
    const meshes = [] as BJS.Mesh[];
    for (const mesh of container.rootNodes[0]?.getChildMeshes() ?? []) {
      if (mesh.getTotalVertices() > 0) {
        meshes.push(mesh as BJS.Mesh);
      }
    }
    if (meshes.length === 0) {
      console.warn(`No valid meshes found in container ${container.rootNodes[0]?.name}`);
      return null;
    }
    try {
      const mergedMesh = BABYLON.Mesh.MergeMeshes(
        meshes,
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
      return mergedMesh;
    } catch (e) {
      console.warn(`[ObjectCache] Warning merging object ${container.rootNodes[0]?.name}:`, e);
      return null;
    }
  }


  async getContainer(
    spawn: Spawn,
    scene: BJS.Scene,
  ): Promise<EntityContainer | null> {
    const race = spawn?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[spawn.gender ?? 0] || raceDataEntry[2];
    if (!this.containers[model]) {
      this.containers[model] = new Promise(async (res) => {
        const bytes = await FileSystem.getFileBytes(
          `eqrequiem/models`,
          `${model}.glb`,
        );
        if (!bytes) {
          console.warn(`[EntityCache] Failed to load model ${model}`);
          return null;
        }
        const file = new File([bytes!], `${model}.glb`, {
          type: "model/gltf-binary",
        });
        const result = await BABYLON.LoadAssetContainerAsync(file, scene);
        if (!result) {
          console.error(`Failed to load model ${model}`);
          return null;
        }

        result.rootNodes[0].name = `container_${model}`;
        const { animationGroups, skeletons } = result;
        const ranges = result.animationGroups.map((group) => {
          return {
            name: group.name,
            from: group.from,
            to: group.to,
          };
        });
        const hasAnimations = animationGroups.length > 0;
        let vatData: Float32Array | null = null;
        const animationRanges: BJS.AnimationRange[] = [];
        if (hasAnimations && skeletons.length) {
          for (const ag of animationGroups) {
            const animationRange = new BABYLON.AnimationRange(
              ag.name,
              ag.from,
              ag.to,
            );
            animationRanges.push(animationRange);
            ag.stop();
            ag.dispose();
          }
          result.animationGroups = [];
          const vatDataBytes = await FileSystem.getFileBytes(
            "eqrequiem/vat",
            `${model}.bin`,
          );
          if (vatDataBytes) {
            vatData = new Float32Array(vatDataBytes);
          }
        }
        if (!vatData) {
          console.warn(`No VAT data found for model ${model}`);
          res({
            manager: null,
            meshes: [] as BJS.Mesh[],
            animationRanges: ranges as BJS.Nullable<BJS.AnimationRange>[],
          } as EntityContainer);
          return null;
        }
        const baker = new BABYLON.VertexAnimationBaker(scene, skeletons[0]);
        const meshes = [] as BJS.Mesh[];
        for (const mesh of result.rootNodes[0]?.getChildMeshes() ?? []) {
          if (mesh.getTotalVertices() > 0) {
            meshes.push(mesh as BJS.Mesh);
          }
        }
       
        //const vData = await baker.bakeVertexData(ranges.slice(0, 4) as BJS.Nullable<BJS.AnimationRange>[]);
        const vertexTexture = baker.textureFromBakedVertexData(vatData);
        const manager = new BABYLON.BakedVertexAnimationManager(scene);
        scene.removeSkeleton(skeletons[0]);
        manager.texture = vertexTexture;

        for (const mesh of meshes) {
          mesh.registerInstancedBuffer("bakedVertexAnimationSettingsInstanced", 4);
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced = new BABYLON.Vector4(0, 0, 0, 0);
          mesh.bakedVertexAnimationManager = manager;
        }
        result.animationGroups = [];

        const renderObserver = scene.onAfterRenderObservable.add(() => {
          manager.time += scene.getEngine().getDeltaTime() / 1000.0;
        });

        const entityContainer: EntityContainer = {
          renderObserver,
          manager,
          meshes,
          animationRanges: ranges as BJS.Nullable<BJS.AnimationRange>[],
        };
        res(entityContainer);
      });
    }
    return this.containers[model]!;
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
        // Dispose of physics body if it exists
        if (this.physicsBodies[model]) {
          this.physicsBodies[model]?.forEach?.((p) => p.dispose());
          delete this.physicsBodies[model];
        }
        // Dispose of the container
        container.mesh.dispose();
        container.mesh._scene.onAfterRenderObservable.remove(container.renderObserver);
        container.manager?.dispose();
      });
      // Remove from cache
      delete this.containers[model];
    }
  }

  disposeAll(): void {
    this.intervals.forEach((interval) => clearInterval(interval));

    Object.keys(this.containers).forEach((model) => this.dispose(model));
  }
}
