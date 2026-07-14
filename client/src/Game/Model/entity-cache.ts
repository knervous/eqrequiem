// src/game/Model/entity-cache.ts

import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import {
  isPlayerRace,
  MaterialPrefixes,
  Races,
} from "@game/Constants/constants";
import RACE_DATA from "@game/Constants/race-data";
import { FileSystem } from "@game/FileSystem/filesystem";
import type GameManager from "@game/Manager/game-manager";
import { PlayerProfile, Spawn } from "@game/Net/messages";
import type { NullableItemInstance } from "@game/Player/player-constants";
import { ShadoDynamicEntityNameplateLayer } from "shader-object/render";
import { loadBasisTexture } from "./basis-texture";
import { Entity } from "./entity";
import {
  createVATPickingMaterial,
  createVATShaderMaterial,
} from "./entity-material";
import { EntityMeshMetadata } from "./entity-types";
import ItemCache, { ItemContainer } from "./item-cache";
import { ShadoEntityPool } from "./shado-entity-pool";

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
  pickingMaterial?: BJS.ShaderMaterial;
  mesh: BJS.Mesh;
  animations: AnimationEntry[];
  skeleton?: BJS.Skeleton;
  submeshRanges: Map<number, SubmeshRange>;
  itemPool?: Record<string, Promise<ItemContainer | null>>;
  textureAttributesDirtyRef: {
    value: boolean;
  };
  getItem?: (model: string, flip?: boolean) => Promise<ItemContainer | null>;
  attachmentBoneIndices: Readonly<Record<string, number>>;
  shadoPool: ShadoEntityPool;
  addThinInstance: (matrix: BJS.Matrix, entityId: number) => number;
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
  private static readonly initialEntityCullDistance = 250;
  private static containers: Record<ModelKey, Promise<EntityContainer | null>> =
    {};
  private static resolvedContainers: Record<ModelKey, EntityContainer | null> =
    {};
  private static commonBasisAtlas: Record<string, BasisAtlas> = {};
  private static commonBasisAtlasLoaded = false;
  private static commonBasisAtlasPromise: Promise<void> | null = null;
  private static generation = 0;
  private static activePools = new Set<ShadoEntityPool>();

  public static gameManager: GameManager;
  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private static getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName("EntityNodeContainer");
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode("EntityNodeContainer", scene);
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
    const requestGeneration = EntityCache.generation;
    if (!EntityCache.commonBasisAtlasLoaded) {
      if (!EntityCache.commonBasisAtlasPromise) {
        const promise = EntityCache.loadCommonBasisAtlas(
          scene,
          requestGeneration,
        );
        EntityCache.commonBasisAtlasPromise = promise;
        void promise.then(
          () => {
            if (EntityCache.commonBasisAtlasPromise === promise) {
              EntityCache.commonBasisAtlasPromise = null;
            }
          },
          () => {
            if (EntityCache.commonBasisAtlasPromise === promise) {
              EntityCache.commonBasisAtlasPromise = null;
            }
          },
        );
      }
      await EntityCache.commonBasisAtlasPromise;
    }
    if (
      requestGeneration !== EntityCache.generation ||
      !EntityCache.commonBasisAtlasLoaded
    ) {
      return null;
    }

    const bucket = EntityCache.getOrCreateNodeContainer(scene);
    const baseModel = model.slice(0, 3);
    if (!EntityCache.containers[model]) {
      const generation = EntityCache.generation;
      EntityCache.containers[model] = (async () => {
        // Load .babylon
        const bytes = await FileSystem.getFileBytes(
          "eqrequiem/babylon",
          `${model}.babylon.gz`,
        );
        if (!bytes) {
          console.log(`[EntityCache] Failed to load model ${model}`);
          return null;
        }
        const file = new File([bytes], `${model}.babylon`, {
          type: "application/babylon",
        });
        const container = await BABYLON.LoadAssetContainerAsync(file, scene, {
          name: `${model}.babylon`,
          pluginExtension: ".babylon",
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
        let pickingMaterial: BJS.ShaderMaterial | null = null;
        let textureAtlas: string[] = [];
        const shadoPool = await ShadoEntityPool.create(scene.getEngine());

        // Vertex animation data
        const canUseFloat16 = scene.getEngine().getCaps().textureHalfFloat;
        const vat16 = `${model}.bin.gz`;
        const vat32 = `${model}_32.bin.gz`;
        const vatBytes = await FileSystem.getFileBytes(
          "eqrequiem/vat",
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
          "eqrequiem/basis",
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
        shaderMaterial = createVATShaderMaterial(scene, shadoPool, model);
        pickingMaterial = createVATPickingMaterial(scene, shadoPool, model);

        // Atlas
        textureAtlas =
          (await FileSystem.getFileJSON<string[]>(
            "eqrequiem/basis",
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
        const boundingBox =
          infoNode?.metadata?.gltf?.extras?.boundingBox ?? null;
        const json = (await FileSystem.getFileJSON(
          "eqrequiem/vat",
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
              to: Math.max(0, r.to + offset),
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
          const { model, variation, texNum } = mesh.metadata.gltf.extras as any;
          let piece = mesh.metadata.gltf.extras.piece?.toLowerCase() ?? "";
          let atlasIndex = 0;
          let name = mesh.material?.name?.toLowerCase() ?? "";
          if (!name) {
            name = `${model}${piece}${variation}${texNum}`.toLowerCase();
          }
          const range = {
            name,
            textureAttributesBuffer: new Float32Array(4),
            isRobe: false,
            isHelm: false,
            atlasArray: textureAtlas,
            metadata: { model, piece: piece.toLowerCase(), variation, texNum },
          } as SubmeshRange;

          if (isPlayerRace(model)) {
            if (name?.toLowerCase()?.startsWith("clk")) {
              atlasIndex = 1;
              range.isRobe = true;
              range.atlasArray = EntityCache.commonBasisAtlas["clk"].atlas;
              piece = "ch";
            } else if (
              texNum !== "01" &&
              piece === MaterialPrefixes.Helm &&
              (name?.toLowerCase()?.startsWith("helm") ||
                name?.toLowerCase()?.startsWith("chain"))
            ) {
              atlasIndex = 2;
              range.isHelm = true;
              range.atlasArray = EntityCache.commonBasisAtlas["helm"].atlas;
            }
          }

          submeshRanges.set(i, range);

          const vertexCount = mesh.getTotalVertices();
          const data = new Float32Array(vertexCount * 2);
          for (let j = 0; j < vertexCount; j++) {
            data[j * 2] = atlasIndex;
            data[j * 2 + 1] = i;
          }
          mesh.setVerticesData("submeshData", data, false, 2);
          i++;
        }
        const textureAttributesDirtyRef = {
          value: true,
        };
        const allSubmeshDataBuffers: Float32Array[] = [];
        meshes.forEach((m) => {
          const d = m.getVerticesData("submeshData")!;
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
          "submeshData",
          mergedSubmeshData,
          /* updatable*/ false,
          /* stride*/ 2,
        );

        const submeshCount = meshes.length;
        const freeThinInstances: number[] = [];
        const addThinInstance = (
          matrix: BJS.Matrix,
          entityId: number,
        ): number => {
          const shadoSlot = shadoPool.acquire(entityId, submeshCount);
          shadoPool.commit();
          const reusableIndex = freeThinInstances.pop();
          if (reusableIndex !== undefined) {
            if (reusableIndex !== shadoSlot.index) {
              throw new Error(
                "Shado and Babylon instance pools lost index alignment",
              );
            }
            mergedMesh.thinInstanceSetMatrixAt(reusableIndex, matrix, true);
            return shadoSlot.index;
          }
          const instanceIdx = mergedMesh.thinInstanceAdd(matrix, true);
          if (instanceIdx !== shadoSlot.index) {
            throw new Error(
              "Shado and Babylon instance pools lost index alignment",
            );
          }
          return shadoSlot.index;
        };
        const removeThinInstance = (index: number): void => {
          if (freeThinInstances.includes(index)) return;
          mergedMesh.thinInstanceSetMatrixAt(
            index,
            BABYLON.Matrix.Zero(),
            true,
          );
          shadoPool.release(index);
          freeThinInstances.push(index);
        };
        mergedMesh.metadata = {
          textureAttributesDirtyRef,
          shadoPool,
          submeshCount,
          atlasArrayTexture: textureArray,
          cloakAtlasArrayTexture: EntityCache.commonBasisAtlas["clk"].texture,
          helmAtlasArrayTexture: EntityCache.commonBasisAtlas["helm"].texture,
          vatTexture: manager!.texture,
          vatTextureSizeInverted: new BABYLON.Vector2(
            1 / manager!.texture.getSize().width,
            1 / manager!.texture.getSize().height,
          ),
          gpuPickingMaterial: pickingMaterial,
        } as EntityMeshMetadata;

        mergedMesh.skeleton = container.skeletons[0] || null;
        mergedMesh.parent = bucket;
        mergedMesh.name = model;
        mergedMesh.bakedVertexAnimationManager = manager!;
        mergedMesh.parent = null;

        mergedMesh.position.set(0, 0, 0);
        mergedMesh.rotation.set(0, 0, 0);
        mergedMesh.scaling.set(1, 1, 1);
        mergedMesh.thinInstanceRegisterAttribute("matrix", 16);
        const mat = mergedMesh.material;
        if (!mat) {
          console.warn(`[EntityCache] Mesh ${mergedMesh.name} has no material`);
          // continue;
        }
        mat?.dispose(true, true);
        mergedMesh.material = shaderMaterial!;
        mergedMesh.parent = bucket;

        const attachmentBoneIndices = Object.fromEntries(
          (container.skeletons[0]?.bones ?? []).map((bone) => [
            bone.name,
            bone.getIndex(),
          ]),
        );

        const itemPool: Record<string, Promise<ItemContainer | null>> = {};
        const getItem = async (
          itemModel: string,
          flip: boolean = true,
        ): Promise<ItemContainer | null> => {
          itemModel = itemModel.toLowerCase();
          const itemKey = `${itemModel}:${flip ? "flipped" : "raw"}`;
          if (!itemPool[itemKey]) {
            itemPool[itemKey] = new Promise<ItemContainer | null>((res) => {
              ItemCache.getContainer(
                itemModel,
                model,
                scene,
                manager,
                container.skeletons[0] ?? null,
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
          return itemPool[itemKey];
        };

        container.rootNodes[0].dispose();

        EntityCache.gameManager.addToPickingList(mergedMesh as BJS.Mesh);

        return {
          container,
          model,
          textureAttributesDirtyRef,
          getItem,
          shadoPool,
          addThinInstance,
          removeThinInstance,
          submeshRanges,
          attachmentBoneIndices,
          animations,
          mesh: mergedMesh,
          skeleton: container.skeletons[0],
          manager: manager!,
          shaderMaterial: shaderMaterial!,
          pickingMaterial: pickingMaterial!,
          boundingBox,
        };
      })()
        .then((c) => {
          if (generation !== EntityCache.generation) {
            EntityCache.disposeContainer(c);
            return null;
          }
          if (c) {
            EntityCache.resolvedContainers[model] = c;
            EntityCache.activePools.add(c.shadoPool);
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

  public static entityInstances = new Set<Entity>();
  private static renderObserver: BJS.Observer<BJS.Camera> | null = null;
  private static cullObserver: BJS.Observer<BJS.Scene> | null = null;
  private static observerScene: BJS.Scene | null = null;
  private static nameplateLayer: ShadoDynamicEntityNameplateLayer | null = null;

  public static initialize(scene: BJS.Scene): void {
    if (EntityCache.renderObserver) {
      EntityCache.observerScene?.onAfterRenderCameraObservable.remove(
        EntityCache.renderObserver,
      );
    }
    if (EntityCache.cullObserver) {
      EntityCache.observerScene?.onBeforeRenderObservable.remove(
        EntityCache.cullObserver,
      );
    }
    EntityCache.observerScene = scene;
    EntityCache.nameplateLayer?.dispose();
    EntityCache.nameplateLayer = new ShadoDynamicEntityNameplateLayer(scene, {
      color: "#00ffff",
      depthTest: true,
      // Alpha-blended nameplates render after opaque geometry in group 0 and
      // retain that group's depth buffer. Later groups clear depth by default.
      renderingGroupId: 0,
      worldScale: 1 / 32,
    });
    EntityCache.cullObserver = scene.onBeforeRenderObservable.add(() => {
      const camera = scene.activeCamera;
      if (!camera) return;
      for (const pool of EntityCache.activePools) {
        pool.cull(camera, 5, EntityCache.initialEntityCullDistance);
      }
      for (const entity of EntityCache.entityInstances) {
        entity.applyReducedVisibility();
      }
    });
    EntityCache.renderObserver = scene.onAfterRenderCameraObservable.add(() => {
      const now = performance.now();
      for (const entity of EntityCache.entityInstances) {
        if (entity.lifecycleDisposed || entity.isDisposed()) {
          EntityCache.entityInstances.delete(entity);
          continue;
        }
        try {
          entity.syncMatrix();
        } catch (error) {
          console.warn("[EntityCache] Entity matrix sync skipped", error);
        }
      }
      EntityCache.nameplateLayer?.sync(
        [...EntityCache.entityInstances].map((entity) => ({
          id: `${entity.spawn.name}:${(entity.spawn as Spawn).spawnId ?? "player"}`,
          text: entity.nameplateLines.join("\n"),
          x: entity.spawnPosition.x,
          y: entity.spawnPosition.z,
          z:
            entity.spawnPosition.y +
            (4 + entity.nameplateLines.length * 1.5) * entity.spawnScale,
          visible:
            !entity.hidden &&
            !entity.lifecycleDisposed &&
            Boolean(entity.meshInstance?.actor.visibleFlag),
        })),
      );
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
    itemResolver?: (slot: number) => NullableItemInstance,
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
      itemResolver,
    );
    try {
      await entity.ready;
    } catch (error) {
      // setup() acquires a Shado/thin-instance slot before loading optional
      // appearance assets. Never leave a visible, unregistered partial entity.
      entity.dispose();
      throw error;
    }
    EntityCache.entityInstances.add(entity);
    return entity;
  }

  public static unregister(entity: Entity): void {
    EntityCache.entityInstances.delete(entity);
  }

  public static dispose(model: ModelKey): void {
    delete EntityCache.containers[model];
  }

  public static disposeAll(scene: BJS.Scene): void {
    EntityCache.generation++;
    for (const entity of [...EntityCache.entityInstances]) entity.dispose();
    EntityCache.entityInstances.clear();
    Entity.disposeStatics();
    if (EntityCache.renderObserver) {
      EntityCache.observerScene?.onAfterRenderCameraObservable.remove(
        EntityCache.renderObserver,
      );
      EntityCache.renderObserver = null;
    }
    if (EntityCache.cullObserver) {
      EntityCache.observerScene?.onBeforeRenderObservable.remove(
        EntityCache.cullObserver,
      );
      EntityCache.cullObserver = null;
    }
    EntityCache.observerScene = null;
    EntityCache.commonBasisAtlasLoaded = false;
    EntityCache.commonBasisAtlasPromise = null;
    for (const key in EntityCache.commonBasisAtlas) {
      const atlas = EntityCache.commonBasisAtlas[key];
      if (atlas.texture) {
        atlas.texture.dispose();
      }
    }
    EntityCache.commonBasisAtlas = {};
    EntityCache.nameplateLayer?.dispose();
    EntityCache.nameplateLayer = null;
    Object.keys(EntityCache.resolvedContainers).forEach((m) => {
      const c = EntityCache.resolvedContainers[m];
      if (!c) {
        return;
      }
      EntityCache.disposeContainer(c);
      delete EntityCache.resolvedContainers[m];
    });
    Object.keys(EntityCache.containers).forEach((m) => {
      delete EntityCache.containers[m];
    });
    Entity.instantiateStatics(scene);
    EntityCache.resolvedContainers = {};
    EntityCache.activePools.clear();
  }

  private static disposeContainer(c: EntityContainer | null): void {
    if (!c) return;
    EntityCache.activePools.delete(c.shadoPool);
    c.manager?.dispose();
    c.shadoPool.dispose();
    c.shaderMaterial?.dispose(true, true);
    c.pickingMaterial?.dispose(true, true);
    if (!c.mesh.isDisposed()) c.mesh.dispose();
    c.container.dispose();
  }

  private static async loadCommonBasisAtlas(
    scene: BJS.Scene,
    generation: number,
  ): Promise<void> {
    const loaded: Record<string, BasisAtlas> = {};
    let published = false;
    try {
      for (const entry of ["clk", "helm"]) {
        const bytes = await FileSystem.getFileBytes(
          "eqrequiem/basis",
          `${entry}.basis`,
        );
        if (!bytes) {
          throw new Error(`Common basis texture missing for ${entry}`);
        }
        const { data, layerCount, format } = await loadBasisTexture(
          scene.getEngine(),
          bytes,
        );
        const texture = new BABYLON.RawTexture2DArray(
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
        texture.update(data);
        const atlas =
          (await FileSystem.getFileJSON<string[]>(
            "eqrequiem/basis",
            `${entry}.json`,
          )) ?? [];
        if (!atlas.length) {
          texture.dispose();
          throw new Error(`Common basis atlas missing for ${entry}`);
        }
        loaded[entry] = { texture, atlas };
      }
      if (generation !== EntityCache.generation) return;
      EntityCache.commonBasisAtlas = loaded;
      EntityCache.commonBasisAtlasLoaded = true;
      published = true;
    } finally {
      if (!published) {
        for (const entry of Object.values(loaded)) entry.texture.dispose();
      }
    }
  }
}

export default EntityCache;

(window as any).ec = EntityCache;
