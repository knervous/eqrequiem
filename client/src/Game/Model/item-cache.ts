// src/game/Model/item-cache.ts

import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { FileSystem } from "@game/FileSystem/filesystem";
import {
  getAssetContainerMeshes,
  getOrCreateAssetContainerRoot,
} from "./asset-container";

type ModelKey = string;

export type ItemContainer = {
  container: BJS.AssetContainer;
  model: ModelKey;
  meshes: BJS.Mesh[];
};

const ANIMATION_BUFFER = new BABYLON.Vector4(0, 1, 0, 60);

function attachItemGeometryToBone(
  mesh: BJS.Mesh,
  attachmentBoneIndex: number,
): void {
  const vertexCount = mesh.getTotalVertices();
  const indices = new Float32Array(vertexCount * 4);
  const weights = new Float32Array(vertexCount * 4);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 4;
    indices[offset] = attachmentBoneIndex;
    weights[offset] = 1;
  }
  mesh.setVerticesData(
    BABYLON.VertexBuffer.MatricesIndicesKind,
    indices,
    false,
    4,
  );
  mesh.setVerticesData(
    BABYLON.VertexBuffer.MatricesWeightsKind,
    weights,
    false,
    4,
  );
  mesh.numBoneInfluencers = 4;
}

export class ItemCache {
  private static containers: Record<ModelKey, Promise<ItemContainer | null>> =
    {};
  private static resolvedContainers: Record<ModelKey, ItemContainer | null> =
    {};
  private static generation = 0;
  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private static getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName("itemNodeContainer");
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode("itemNodeContainer", scene);
  }

  /**
   * Loads (or returns cached) mesh/animation container for a given model.
   * @param model       model key (lowercased)
   * @param scene       Babylon scene
   * @param parentNode  parent under which to attach; defaults to shared container
   */
  public static async getContainer(
    model: string,
    vatOwnerItemModel: string,
    scene: BJS.Scene,
    manager: BJS.BakedVertexAnimationManager | null = null,
    skeleton: BJS.Skeleton | null = null,
    flip: boolean = true,
    attachmentBoneIndex?: number,
    attachmentKey?: string,
    attachmentGeometryTransform?: BJS.Matrix,
  ): Promise<ItemContainer | null> {
    model = model.toLowerCase();
    const attachmentCacheKey =
      attachmentKey ??
      (attachmentBoneIndex === undefined
        ? "unbound"
        : `bone-${attachmentBoneIndex}`);
    // Primary weapons, off-hand weapons, and shields can share an idfile but
    // require different baked orientation. They must never share a source
    // mesh whose vertices have already been transformed for the other hand.
    const modelKey =
      `${model}:${vatOwnerItemModel}:${flip ? "flipped" : "raw"}:` +
      attachmentCacheKey;

    const bucket = ItemCache.getOrCreateNodeContainer(scene);
    if (!ItemCache.containers[modelKey]) {
      const generation = ItemCache.generation;
      ItemCache.containers[modelKey] = (async () => {
        // Load .babylon
        const bytes = await FileSystem.getFileBytes(
          "eqrequiem/items",
          `${model}.babylon.gz`,
        );
        if (!bytes) {
          console.log(`[ItemCache] Failed to load model ${model}`);
          return null;
        }
        const container = await BABYLON.loadBabylonAssetContainer(bytes, scene, {
          name: `${model}.babylon`,
        }).catch((e) => {
          console.log(`[ItemCache] Error loading model ${model}:`, e);
          return null;
        });
        if (!container) {
          return null;
        }

        // Attach to bucket
        const root = getOrCreateAssetContainerRoot(
          container,
          scene,
          `container_${model}`,
        );
        root.setParent(bucket);

        // Process meshes
        const meshes = getAssetContainerMeshes(container);
        if (!meshes.length) {
          console.warn(
            `[ItemCache] Model ${model} contains no renderable meshes`,
          );
          container.dispose();
          return null;
        }
        for (const mesh of meshes) {
          if (mesh.material) {
            if (mesh.material instanceof BABYLON.PBRMaterial) {
              (mesh.material as BJS.PBRMaterial).unlit = true;
            } else if (mesh.material instanceof BABYLON.StandardMaterial) {
              (mesh.material as BJS.StandardMaterial).disableLighting = true;
            }
          }
          mesh.addLODLevel(500, null);
          mesh.name = mesh.material?.name?.toLowerCase() ?? "";
          if (attachmentBoneIndex !== undefined) {
            // Establish every vertex attribute before the first instance can
            // compile its material. Adding skinning streams after compilation
            // leaves WebGPU's VAT instance attribute and matricesIndices
            // competing for the same shader location.
            attachItemGeometryToBone(mesh, attachmentBoneIndex);
          }
          mesh.registerInstancedBuffer(
            "bakedVertexAnimationSettingsInstanced",
            4,
          );
          if (flip) {
            const orient = BABYLON.Matrix.RotationX(Math.PI) // tip from +Z → +Y
              .multiply(BABYLON.Matrix.RotationZ(Math.PI)); // flip if needed
            mesh.bakeTransformIntoVertices(orient);
          }
          if (attachmentGeometryTransform) {
            mesh.bakeTransformIntoVertices(attachmentGeometryTransform);
          }
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            ANIMATION_BUFFER;
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.scaling.set(1, 1, 1);
          mesh.parent = bucket;
          // Source meshes only own geometry/material state. Rendering is done
          // exclusively by the per-entity instances created from them.
          mesh.isVisible = false;
          mesh.isPickable = false;
          mesh.bakedVertexAnimationManager = manager;
          if (skeleton) {
            mesh.skeleton = skeleton;
          }
        }
        return {
          container,
          model,
          meshes,
        };
      })()
        .then((c) => {
          if (generation !== ItemCache.generation) {
            c?.container.dispose();
            return null;
          }
          if (c) {
            ItemCache.resolvedContainers[modelKey] = c;
            return c;
          }
          delete ItemCache.containers[modelKey];
          return null;
        })
        .catch((e) => {
          console.error(`[ItemCache] Error loading model ${modelKey}:`, e);
          delete ItemCache.containers[modelKey];
          return null;
        });
    }
    return ItemCache.containers[modelKey];
  }

  public static dispose(model: ModelKey): void {
    delete ItemCache.containers[model];
  }

  public static disposeAll(): void {
    ItemCache.generation++;
    Object.keys(ItemCache.resolvedContainers).forEach((m) => {
      const c = ItemCache.resolvedContainers[m];
      if (!c) {
        return;
      }
      c.container.dispose();
      c.meshes.forEach((mesh) => mesh.dispose());
      delete ItemCache.resolvedContainers[m];
    });
    Object.keys(ItemCache.containers).forEach((m) => {
      delete ItemCache.containers[m];
    });
    ItemCache.resolvedContainers = {};
  }
}

export default ItemCache;
