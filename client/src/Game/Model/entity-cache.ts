// src/game/Model/entity-cache.ts

import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { isPlayerRace, Races } from '@game/Constants/constants';
import RACE_DATA from '@game/Constants/race-data';
import { FileSystem } from '@game/FileSystem/filesystem';
import type GameManager from '@game/Manager/game-manager';
import { Spawn } from '@game/Net/internal/api/capnp/common';
import { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import { loadBasisTexture } from './basis-texture';
import { Entity } from './entity';
import { createVATShaderMaterial } from './entity-material';
import ItemCache, { ItemContainer } from './item-cache';

type ModelKey = string;

export type EntityContainer = {
  container: BJS.AssetContainer;
  model: ModelKey;
  manager?: BJS.BakedVertexAnimationManager;
  shaderMaterial?: BJS.ShaderMaterial;
  meshes: BJS.Mesh[];
  textureAtlas: string[];
  animations: AnimationEntry[];
  skeleton?: BJS.Skeleton;
  itemPool?: Record<string, Promise<ItemContainer | null>>;
  getItem?: (model: string, flip?: boolean) => Promise<ItemContainer | null>;
  boundingBox?: {
    min: number[];
    max: number[];
    center: number[];
    yOffset: number;
  } | null;
};

export type AnimationEntry = {
  from: number;
  to: number;
  name: string;
};

export type BasisAtlas = {
  texture: BJS.RawTexture2DArray;
  atlas: string[];
};

// Texture attributes are defined as x: texture index, y: rgba mask
const TEXTURE_ATTRIBUTE_BUFFER = new Int32Array([0, 0]);
const ANIMATION_BUFFER = new BABYLON.Vector4(0, 1, 0, 60);

export class EntityCache {
  private static containers: Record<ModelKey, Promise<EntityContainer | null>> =
    {};
  private static resolvedContainers: Record<ModelKey, EntityContainer | null> =
    {};
  private static commonBasisAtlas: Record<string, BasisAtlas> = {};
  private static commonBasisAtlasLoaded = false;
  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private static getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName('entityNodeContainer');
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode('entityNodeContainer', scene);
  }

  /**
   * Loads (or returns cached) mesh/animation container for a given model.
   * @param model       model key (lowercased)
   * @param scene       Babylon scene
   * @param parentNode  parent under which to attach; defaults to shared container
   */
  public static async getContainer(
    model: string,
    scene: BJS.Scene,
  ): Promise<EntityContainer | null> {
    model = model.toLowerCase();
    if (!EntityCache.commonBasisAtlasLoaded) {
      const commonEntries = ['clk', 'helm'];
      for (const entry of commonEntries) {
        const bytes = await FileSystem.getFileBytes(
          'eqrequiem/basis',
          `${entry}.basis`,
        );
        if (!bytes) {
          console.warn(
            `[EntityCache] Common basis texture missing for ${entry}`,
          );
          continue;
        }
        const { data, layerCount, format } = await loadBasisTexture(
          scene.getEngine(),
          bytes,
        );
        const textureArray = new BABYLON.RawTexture2DArray(
          null,
          128,
          128,
          layerCount,
          format,
          scene,
          false,
          false,
          BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        );
        textureArray.update(data);
        // Atlas
        const textureAtlas =
          (await FileSystem.getFileJSON<string[]>(
            'eqrequiem/basis',
            `${entry}.json`,
          )) ?? [];
        if (!textureAtlas.length) {
          console.warn(`[EntityCache] VAT atlas missing for ${entry}`);
          return null;
        }

        EntityCache.commonBasisAtlas[entry] = {
          texture: textureArray,
          atlas  : textureAtlas,
        };
      }
      EntityCache.commonBasisAtlasLoaded = true;
    }

    const bucket = EntityCache.getOrCreateNodeContainer(scene);
    const baseModel = model.slice(0, 3);
    if (!EntityCache.containers[model]) {
      EntityCache.containers[model] = (async () => {
        // Load .babylon
        const bytes = await FileSystem.getFileBytes(
          'eqrequiem/babylon',
          `${model}.babylon.gz`,
        );
        if (!bytes) {
          console.log(`[EntityCache] Failed to load model ${model}`);
          return null;
        }
        const file = new File([bytes], `${model}.babylon`, {
          type: 'application/babylon',
        });
        const container = await BABYLON.LoadAssetContainerAsync(file, scene, {
          name           : `${model}.babylon`,
          pluginExtension: '.babylon',
        }).catch((e) => {
          console.log(`[EntityCache] Error loading model ${model}:`, e);
          return null;
        });
        if (!container) {
          return null;
        }

        // Attach to bucket
        const root = container.rootNodes[0];
        root.name = `container_${model}`;
        (root as BJS.Mesh).setParent(bucket);

        // VAT setup
        let manager: BJS.BakedVertexAnimationManager | null = null;
        let shaderMaterial: BJS.ShaderMaterial | null = null;
        let textureAtlas: string[] = [];

        // Vertex animation data
        const canUseFloat16 = scene.getEngine().getCaps().textureHalfFloat;
        const vat16 = `${model}.bin.gz`;
        const vat32 = `${model}_32.bin.gz`;
        const vatBytes = await FileSystem.getFileBytes(
          'eqrequiem/vat',
          canUseFloat16 ? vat16 : vat32,
        );
        if (!vatBytes) {
          console.warn(`[EntityCache] VAT data missing for ${model}`);
          return null;
        }
        const vatData = canUseFloat16
          ? new Uint16Array(vatBytes)
          : new Float32Array(vatBytes);
        manager = new BABYLON.BakedVertexAnimationManager(scene);
        const baker = new BABYLON.VertexAnimationBaker(
          scene,
          container.skeletons[0],
        );
        manager.texture = baker.textureFromBakedVertexData(vatData);
        manager.texture.name = `vatTexture16_${model}`;

        // Basis textures
        const basisBytes = await FileSystem.getFileBytes(
          'eqrequiem/basis',
          `${baseModel}.basis`,
        );
        if (!basisBytes) {
          console.warn(`[EntityCache] Basis texture missing for ${model}`);
          return null;
        }
        const { data, layerCount, format } = await loadBasisTexture(
          scene.getEngine(),
          basisBytes,
        );
        const textureArray = new BABYLON.RawTexture2DArray(
          null,
          128,
          128,
          layerCount,
          format,
          scene,
          false,
          false,
          BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
        );
        textureArray.update(data);

        // Shader material
        shaderMaterial = createVATShaderMaterial(scene);

        // Atlas
        textureAtlas =
          (await FileSystem.getFileJSON<string[]>(
            'eqrequiem/basis',
            `${baseModel}.json`,
          )) ?? [];
        if (!textureAtlas.length) {
          console.warn(`[EntityCache] VAT atlas missing for ${model}`);
          return null;
        }

        // Animate
        const frameUpdate = () => {
          manager!.time += scene.getEngine().getDeltaTime() / 1000;
        };
        scene.registerBeforeRender(frameUpdate);
        bucket.onDisposeObservable.add(() =>
          scene.unregisterBeforeRender(frameUpdate),
        );

        // Gather animations
        let animations: BJS.AnimationRange[] = [];
        const infoNode = (root as any).getChildTransformNodes()?.[0];

        const json = (await FileSystem.getFileJSON(
          'eqrequiem/vat',
          `${model}.json`,
        )) as any;
        if (json) {
          animations = json.animations as BJS.AnimationRange[];
        } else {
          const ranges =
            infoNode?.metadata?.gltf?.extras?.animationRanges ?? [];
          let offset = 0;
          animations = ranges.map((r) => {
            const entry = {
              from: r.from + offset,
              to  : Math.max(0, r.to + offset),
              name: r.name,
            };
            offset += r.to;
            return entry;
          });
        }

        // Process meshes
        const meshes = container.rootNodes[0]
          .getChildMeshes(false)
          .filter((m) => m.getTotalVertices() > 0) as BJS.Mesh[];
        for (const mesh of meshes) {
          mesh.metadata ??= {};
          const { model, piece, variation, texNum } = mesh.metadata.gltf.extras as any;

          if (!mesh.metadata.name) {
            mesh.metadata.name = mesh.material?.name?.toLowerCase() ?? '';
            if (!mesh.metadata.name) {
              mesh.metadata.name = `${model}${piece}${variation}${texNum}`.toLowerCase();
              mesh.name = mesh.metadata.name;
            }
          }
          mesh.metadata.atlasArrayTexture = textureArray; 
          mesh.metadata.atlasArray = textureAtlas;
          if (isPlayerRace(model)) {
            if (mesh.metadata.name?.toLowerCase()?.startsWith('clk')) {
              mesh.metadata.isRobe = true;
              mesh.metadata.atlasArrayTexture =
              EntityCache.commonBasisAtlas['clk'].texture;
              mesh.metadata.atlasArray =
              EntityCache.commonBasisAtlas['clk'].atlas;
            } else if (
              texNum !== '01' &&
            piece === 'HE' &&
            (mesh.metadata.name?.toLowerCase()?.startsWith('helm') ||
              mesh.metadata.name?.toLowerCase()?.startsWith('chain'))
            ) {
              mesh.metadata.isHelm = true;
              mesh.metadata.atlasArrayTexture =
              EntityCache.commonBasisAtlas['helm'].texture;
              mesh.metadata.atlasArray =
              EntityCache.commonBasisAtlas['helm'].atlas;
            }
          }
          mesh.metadata.vatTexture = manager!.texture;
          mesh.addLODLevel(500, null);
          mesh.parent = bucket;
          mesh.name = mesh.material?.name?.toLowerCase() ?? '';
          mesh.registerInstancedBuffer(
            'bakedVertexAnimationSettingsInstanced',
            4,
          );
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            ANIMATION_BUFFER;
          mesh.registerInstancedBuffer('textureAttributes', 4);
          mesh.instancedBuffers.textureAttributes = TEXTURE_ATTRIBUTE_BUFFER;
          mesh.bakedVertexAnimationManager = manager!;
          mesh.parent = null;
          mesh.computeWorldMatrix(true);
          mesh.bakeTransformIntoVertices(mesh.getWorldMatrix());
          mesh.flipFaces(true);
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.scaling.set(1, 1, 1);

          const mat = mesh.material;
          if (!mat) {
            console.warn(`[EntityCache] Mesh ${mesh.name} has no material`);
            // continue;
          }
          mat?.dispose();
          mesh.material = shaderMaterial!;
          mesh.parent = bucket;
        }

        const itemPool: Record<string, Promise<ItemContainer | null>> = {};
        const getItem = async (itemModel: string, flip: boolean = true): Promise<ItemContainer | null> => {
          itemModel = itemModel.toLowerCase();
          if (!itemPool[itemModel]) {
            itemPool[itemModel] = new Promise<ItemContainer | null>((res) => {
              ItemCache.getContainer(
                itemModel,
                model,
                scene,
                manager,
                container.skeletons[0] || null,
                flip,
              ).then(res).catch((e) => {
                console.warn(
                  `[EntityCache] Error loading item model ${itemModel}:`,
                  e,
                );

                res(null);
              });
            });
          }
          return itemPool[itemModel];
        };
        
        return {
          container,
          model,
          getItem,
          skeleton      : container.skeletons[0],
          manager       : manager!,
          shaderMaterial: shaderMaterial!,
          meshes,
          textureAtlas,
          animations,
          boundingBox   : infoNode?.metadata?.gltf?.extras?.boundingBox ?? null,
        };
      })()
        .then((c) => {
          if (c) {
            EntityCache.resolvedContainers[model] = c;
            return c;
          }
          delete EntityCache.containers[model];
          return null;
        })
        .catch((e) => {
          console.error(`[EntityCache] Error loading model ${model}:`, e);
          delete EntityCache.containers[model];
          return null;
        });
    }
    return EntityCache.containers[model];
  }

  /**
   * Instantiates an Entity under the given parent (or shared container).
   */
  public static async getInstance(
    gameManager: GameManager,
    spawn: Spawn | PlayerProfile,
    scene: BJS.Scene,
    parentNode?: BJS.Node,
  ): Promise<Entity | null> {
    const race = spawn.race ?? 1;
    const entry = RACE_DATA[race] ?? RACE_DATA[Races.HUMAN];
    let model = entry[spawn.gender ?? 0] || entry[2];
    model = model.toLowerCase();
    const container = await EntityCache.getContainer(model, scene);
    if (!container) {
      return null;
    }
    return new Entity(
      gameManager,
      spawn,
      scene,
      container,
      this,
      parentNode!,
      entry,
    );
  }

  public static dispose(model: ModelKey): void {
    delete EntityCache.containers[model];
  }

  public static disposeAll(scene: BJS.Scene): void {
    Entity.disposeStatics();
    EntityCache.commonBasisAtlasLoaded = false;
    for (const key in EntityCache.commonBasisAtlas) {
      const atlas = EntityCache.commonBasisAtlas[key];
      if (atlas.texture) {
        atlas.texture.dispose();
      }
    }
    EntityCache.commonBasisAtlas = {};
    Object.keys(EntityCache.resolvedContainers).forEach((m) => {
      const c = EntityCache.resolvedContainers[m];
      if (!c) {
        return;
      }
      c.container.dispose();
      c.manager?.dispose();
      c.shaderMaterial?.dispose(true, true);
      c.meshes.forEach((mesh) => mesh.dispose());
      c.textureAtlas.forEach((tex) => {
        const texture = scene.getTextureByName(tex);
        if (texture) {
          texture.dispose();
        }
      });
    });
    Object.keys(EntityCache.containers).forEach((m) => {
      delete EntityCache.containers[m];
    });
    Entity.instantiateStatics(scene);
  }
}

export default EntityCache;
