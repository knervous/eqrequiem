// src/game/Model/entity-cache.ts

import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { isPlayerRace, MaterialPrefixes, Races } from '@game/Constants/constants';
import RACE_DATA from '@game/Constants/race-data';
import { FileSystem } from '@game/FileSystem/filesystem';
import type GameManager from '@game/Manager/game-manager';
import { Spawn } from '@game/Net/internal/api/capnp/common';
import { PlayerProfile } from '@game/Net/internal/api/capnp/player';
import { loadBasisTexture } from './basis-texture';
import { Entity } from './entity';
import { createVATShaderMaterial } from './entity-material';
import { EntityMeshMetadata } from './entity-types';
import ItemCache, { ItemContainer } from './item-cache';

type ModelKey = string;
type SubmeshRange = {
  textureAttributesBuffer: Float32Array;
  isRobe: boolean;
  isHelm: boolean;
  atlasArray: string[];
  name: string;
  metadata: {
    model: string;
    piece: string;
    variation: string;
    texNum: string;
  };
};

export type EntityContainer = {
  container: BJS.AssetContainer;
  model: ModelKey;
  manager?: BJS.BakedVertexAnimationManager;
  shaderMaterial?: BJS.ShaderMaterial;
  mesh: BJS.Mesh;
  animations: AnimationEntry[];
  skeleton?: BJS.Skeleton;
  submeshRanges: Map<number, SubmeshRange>;
  itemPool?: Record<string, Promise<ItemContainer | null>>;
  textureAttributesDirtyRef: {
    value: boolean;
  };
  getItem?: (model: string, flip?: boolean) => Promise<ItemContainer | null>;
  addThinInstance: (matrix: BJS.Matrix) => number;
  removeThinInstance: (index: number) => void;
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

export class EntityCache {
  private static containers: Record<ModelKey, Promise<EntityContainer | null>> =
    {};
  private static resolvedContainers: Record<ModelKey, EntityContainer | null> =
    {};
  private static commonBasisAtlas: Record<string, BasisAtlas> = {};
  private static commonBasisAtlasLoaded = false;

  public static gameManager: GameManager;
  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private static getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName('EntityNodeContainer');
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode('EntityNodeContainer', scene);
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
        container.addToScene((m) => {
          return (
            (m instanceof BABYLON.Mesh && m.getTotalVertices() > 0) ||
            m instanceof BABYLON.Geometry ||
            m instanceof BABYLON.Skeleton ||
            m instanceof BABYLON.TransformNode
          );
        });
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
        const boundingBox = infoNode?.metadata?.gltf?.extras?.boundingBox ?? null;
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

        const submeshRanges: Map<number, SubmeshRange> = new Map();
        let i = 0;
        for (const mesh of meshes) {
          mesh.metadata ??= {};
          mesh.computeWorldMatrix(true);
          mesh.bakeTransformIntoVertices(mesh.getWorldMatrix());
          mesh.flipFaces(true);
          const { model, variation, texNum } = mesh.metadata.gltf
            .extras as any;
          let piece = mesh.metadata.gltf.extras.piece?.toLowerCase() ?? '';
          let atlasIndex = 0;
          let name = mesh.material?.name?.toLowerCase() ?? '';
          if (!name) {
            name = `${model}${piece}${variation}${texNum}`.toLowerCase();
          }
          const range = {
            name,
            textureAttributesBuffer: new Float32Array(4),
            isRobe                 : false,
            isHelm                 : false,
            atlasArray             : textureAtlas,
            metadata               : { model, piece: piece.toLowerCase(), variation, texNum },
          } as SubmeshRange;

          if (isPlayerRace(model)) {
            if (name?.toLowerCase()?.startsWith('clk')) {
              atlasIndex = 1;
              range.isRobe = true;
              range.atlasArray = EntityCache.commonBasisAtlas['clk'].atlas;
              piece = 'ch';
            } else if (
              texNum !== '01' &&
              piece === MaterialPrefixes.Helm &&
              (name?.toLowerCase()?.startsWith('helm') ||
                name?.toLowerCase()?.startsWith('chain'))
            ) {
              atlasIndex = 2;
              range.isHelm = true;
              range.atlasArray = EntityCache.commonBasisAtlas['helm'].atlas;
            }
          }

          submeshRanges.set(i, range);

          const vertexCount = mesh.getTotalVertices();
          const data = new Float32Array(vertexCount * 2);
          for (let j = 0; j < vertexCount; j++) {
            data[j * 2] = atlasIndex;
            data[j * 2 + 1] = i;
          }
          mesh.setVerticesData('submeshData', data, false, 2);
          i++;
        }
        const textureAttributesDirtyRef = {
          value: true,
        };
        const allSubmeshDataBuffers: Float32Array[] = [];
        meshes.forEach((m) => {
          const d = m.getVerticesData('submeshData')!; 
          allSubmeshDataBuffers.push(d as any);
        });
        const mergedMesh = BABYLON.Mesh.MergeMeshes(
          meshes,
          true,
          false,
          undefined,
          false,
          false,
        )!;
        mergedMesh.isPickable = true;
        mergedMesh.thinInstanceEnablePicking = false;
        mergedMesh.pointerOverDisableMeshTesting = true;
        // how many total verts?
        const totalVerts = allSubmeshDataBuffers
          .map((buf) => buf.length / 2 /* stride*/)
          .reduce((a, b) => a + b, 0);

        // flatten them into one big Float32Array (stride = 2)
        const mergedSubmeshData = new Float32Array(totalVerts * 2);
        let offsetVertices = 0;
        for (const buf of allSubmeshDataBuffers) {
          // buf.length is (#verts * 2)
          mergedSubmeshData.set(buf, offsetVertices * 2);
          offsetVertices += buf.length / 2;
        }

        // _now_ re-attach
        mergedMesh.setVerticesData(
          'submeshData',
          mergedSubmeshData,
          /* updatable*/ false,
          /* stride*/ 2,
        );

        const submeshCount = meshes.length;

        const addThinInstance = (matrix: BJS.Matrix): number => {
          const instanceIdx = mergedMesh.thinInstanceAdd(matrix, true);
          const originalBuffer = (mergedMesh.metadata?.textureAttributeArray
            ?._texture?._bufferView ?? new Float32Array()) as Float32Array;
          const newWidth = submeshCount * mergedMesh.thinInstanceCount;
          const data = new Float32Array(4 * newWidth);
          data.set(originalBuffer, 0);
          mergedMesh.thinInstanceSetAttributeAt(
            'thinInstanceIndex',
            instanceIdx,
            [instanceIdx, 0],
            true,
          );
          if (mergedMesh.metadata.textureAttributeArray) {
            mergedMesh.metadata.textureAttributeArray.dispose();
          }

          // 4) create a fresh RawTexture at the correct size
          const fresh = new BABYLON.RawTexture(
            data,
            newWidth,
            1,
            BABYLON.Constants.TEXTUREFORMAT_RGBA,
            scene,
            false,
            false,
            BABYLON.Constants.TEXTURE_NEAREST_NEAREST_MIPNEAREST,
            BABYLON.Constants.TEXTURETYPE_FLOAT,
          );

          mergedMesh.metadata.textureAttributeArray = fresh;

          return instanceIdx;
        };
        const removeThinInstance = (index: number): void => {
          // TODO remove logic for thin instances
          // const originalBuffer = textureAttributeArray._texture?._bufferView as Float32Array;
          // originalBuffer.
          // mesh.thinInstanceBufferUpdated('matrix');
          // mesh.thinInstanceSetAttributeAt('thinInstanceIndex', index, [0], true);
          // // figure out how to remove from underlying matrix buffer
          // const data = new Float32Array(4 * mesh.thinInstanceCount); // RGBA for each submesh
          // data.set(textureAttributeArrayData, 0);
          // mesh.metadata.textureAttributeArray!.update(data);
        };
        mergedMesh.metadata = {
          textureAttributesDirtyRef,
          submeshCount,
          atlasArrayTexture     : textureArray,
          cloakAtlasArrayTexture: EntityCache.commonBasisAtlas['clk'].texture,
          helmAtlasArrayTexture : EntityCache.commonBasisAtlas['helm'].texture,
          vatTexture            : manager!.texture,
        } as EntityMeshMetadata;

        mergedMesh.skeleton = container.skeletons[0] || null;
        mergedMesh.parent = bucket;
        mergedMesh.name = model;
        mergedMesh.bakedVertexAnimationManager = manager!;
        mergedMesh.parent = null;
      
        mergedMesh.position.set(0, 0, 0);
        mergedMesh.rotation.set(0, 0, 0);
        mergedMesh.scaling.set(1, 1, 1);
        mergedMesh.thinInstanceRegisterAttribute('matrix', 16);
        mergedMesh.thinInstanceRegisterAttribute('thinInstanceIndex', 2);
        mergedMesh.thinInstanceRegisterAttribute(
          'bakedVertexAnimationSettingsInstanced',
          4,
        );

        const mat = mergedMesh.material;
        if (!mat) {
          console.warn(`[EntityCache] Mesh ${mergedMesh.name} has no material`);
          // continue;
        }
        mat?.dispose(true, true);
        mergedMesh.material = shaderMaterial!;
        mergedMesh.parent = bucket;

        setTimeout(() => {
          container.skeletons.forEach((skeleton) => {
            skeleton.dispose();
            scene.removeSkeleton(skeleton);
          });
        }, 2000);

        const itemPool: Record<string, Promise<ItemContainer | null>> = {};
        const getItem = async (
          itemModel: string,
          flip: boolean = true,
        ): Promise<ItemContainer | null> => {
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
              )
                .then(res)
                .catch((e) => {
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

        container.rootNodes[0].dispose();

        EntityCache.gameManager.addToPickingList(mergedMesh as BJS.Mesh);


        return {
          container,
          model,
          textureAttributesDirtyRef,
          getItem,
          addThinInstance,
          removeThinInstance,
          submeshRanges,
          animations,
          mesh          : mergedMesh,
          skeleton      : container.skeletons[0],
          manager       : manager!,
          shaderMaterial: shaderMaterial!,
          boundingBox,
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

  public static entityInstances: Entity[] = [];
  private static renderObserver: BJS.Observer<BJS.Camera> | null = null;

  public static initialize(scene: BJS.Scene): void {
    EntityCache.renderObserver = scene.onAfterRenderCameraObservable.add((camera) => {
      const now = performance.now();
      const meshes = new Set<BJS.Mesh>();
      for (const entity of EntityCache.entityInstances) {
        if (entity.hidden) {
          continue;
        }
        if (entity.nameplate) {
          entity.nameplate.render(
            camera.getViewMatrix(),
            camera.getProjectionMatrix(),
          );
        }
        for (const mesh of entity.syncMatrix()) {
          meshes.add(mesh);
        }
      }
      for (const mesh of meshes) {
        mesh?.thinInstanceBufferUpdated('matrix');
      }
      const delta = performance.now() - now;
      (window as any).perf = delta;
      // console.log('Delta for entity sync:', delta, 'ms');
    });
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
    const entity = new Entity(
      gameManager,
      spawn,
      scene,
      container,
      this,
      parentNode!,
      entry,
    );
    EntityCache.entityInstances.push(entity);
    return entity;
  }

  public static dispose(model: ModelKey): void {
    delete EntityCache.containers[model];
  }

  public static disposeAll(scene: BJS.Scene): void {
    Entity.disposeStatics();
    if (EntityCache.renderObserver) {
      scene.onAfterCameraRenderObservable.remove(EntityCache.renderObserver);
      EntityCache.renderObserver = null;
    }
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
      c.mesh.dispose();
    });
    Object.keys(EntityCache.containers).forEach((m) => {
      delete EntityCache.containers[m];
    });
    Entity.instantiateStatics(scene);
  }
}

export default EntityCache;


(window as any).ec = EntityCache;
