// src/Game/Model/entity-cache.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { FileSystem } from "@game/FileSystem/filesystem";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import RACE_DATA from "@game/Constants/race-data";
import { Entity, EntityContainer } from "./entity";

type ModelKey = string;

function calculateRanges(animationGroups) {
  return animationGroups.reduce((acc, ag, index) => {
    if (index === 0) {
      acc.push({ name: ag.name, from: Math.floor(ag.from), to: Math.floor(ag.to) });
    } else {
      const prev = acc[index - 1];
      acc.push({ name: ag.name, from: prev.to + 1, to: prev.to + 1 + Math.floor(ag.to) });
    }
    return acc;
  }, []);
}
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
        false, true, undefined, undefined, true,
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
        let vatData: Float32Array | null = null;

        const calculatedRanges = calculateRanges(animationGroups).slice(1, 5);
        const baker = new BABYLON.VertexAnimationBaker(scene, skeleton);

        // vatData = await baker.bakeVertexData(calculatedRanges);
        console.log('Vat', vatData);
        console.log('Calculated Ranges', calculatedRanges);
        // Load VAT data
        const vatDataBytes = await FileSystem.getFileBytes("eqrequiem/vat", `${model}.bin`);
        if (vatDataBytes) {
          vatData = new Float32Array(vatDataBytes);
        } else {
          console.warn(`No VAT data found for model ${model}`);
          res(null);
          return;
        }
        const mergedMesh = this.getMergedMesh(result, skeleton);
        if (!mergedMesh) {
          console.warn(`Failed to merge meshes for model ${model}`);
          res(null);
          return;
        }
      
        const manager = new BABYLON.BakedVertexAnimationManager(scene);
        const vertexTexture = baker.textureFromBakedVertexData(vatData);
        manager.texture = vertexTexture;
        mergedMesh.bakedVertexAnimationManager = manager;
        mergedMesh.registerInstancedBuffer("bakedVertexAnimationSettingsInstanced", 4);
        mergedMesh.instancedBuffers.bakedVertexAnimationSettingsInstanced = new BABYLON.Vector4(
          0,
          0,
          0,
          60,
        );

        mergedMesh.setEnabled(false); // Hide merged mesh

        // Set up render observer for VAT time
        const renderObserver = scene.onAfterRenderObservable.add(() => {
          manager.time += scene.getEngine().getDeltaTime() / 1000.0;
        });


        const entityContainer: EntityContainer = {
          renderObserver,
          manager,
          mesh: mergedMesh,
          animationRanges: calculatedRanges,
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