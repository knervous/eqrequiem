// src/game/Model/item-cache.ts

import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { FileSystem } from '@game/FileSystem/filesystem';

type ModelKey = string;

export type ItemContainer = {
  container: BJS.AssetContainer;
  model: ModelKey;
  meshes: BJS.Mesh[];
};

const ANIMATION_BUFFER = new BABYLON.Vector4(0, 1, 0, 60);

export class ItemCache {
  private static containers: Record<ModelKey, Promise<ItemContainer | null>> =
    {};
  private static resolvedContainers: Record<ModelKey, ItemContainer | null> =
    {};
  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private static getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName('itemNodeContainer');
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode('itemNodeContainer', scene);
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
  ): Promise<ItemContainer | null> {
    model = model.toLowerCase();
    const modelKey = model + vatOwnerItemModel;

    const bucket = ItemCache.getOrCreateNodeContainer(scene);
    if (!ItemCache.containers[modelKey]) {
      ItemCache.containers[modelKey] = (async () => {
        // Load .babylon
        const bytes = await FileSystem.getFileBytes(
          'eqrequiem/items',
          `${model}.babylon.gz`,
        );
        if (!bytes) {
          console.log(`[ItemCache] Failed to load model ${model}`);
          return null;
        }
        const file = new File([bytes], `${model}.babylon`, {
          type: 'application/babylon',
        });
        const container = await BABYLON.LoadAssetContainerAsync(file, scene, {
          name           : `${model}.babylon`,
          pluginExtension: '.babylon',
        }).catch((e) => {
          console.log(`[ItemCache] Error loading model ${model}:`, e);
          return null;
        });
        if (!container) {
          return null;
        }

        // Attach to bucket
        const root = container.rootNodes[0];
        root.name = `container_${model}`;
        (root as BJS.Mesh).setParent(bucket);

        // Process meshes
        const meshes = container.rootNodes[0]
          .getChildMeshes(false)
          .filter((m) => m.getTotalVertices() > 0) as BJS.Mesh[];
        for (const mesh of meshes) {
          mesh.addLODLevel(500, null);
          mesh.name = mesh.material?.name?.toLowerCase() ?? '';
          mesh.registerInstancedBuffer(
            'bakedVertexAnimationSettingsInstanced',
            4,
          );
          if (flip) {
            const orient = BABYLON.Matrix.RotationX(Math.PI) // tip from +Z → +Y
              .multiply(BABYLON.Matrix.RotationZ(Math.PI)); // flip if needed
            mesh.bakeTransformIntoVertices(orient);
          }
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            ANIMATION_BUFFER;
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.scaling.set(1, 1, 1);
          mesh.parent = bucket;
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
    Object.keys(ItemCache.resolvedContainers).forEach((m) => {
      const c = ItemCache.resolvedContainers[m];
      if (!c) {
        return;
      }
      c.container.dispose();
      c.meshes.forEach((mesh) => mesh.dispose());
    });
    Object.keys(ItemCache.containers).forEach((m) => {
      delete ItemCache.containers[m];
    });
  }
}

export default ItemCache;
