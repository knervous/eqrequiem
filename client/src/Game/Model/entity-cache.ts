// src/game/Model/entity-cache.ts

import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { FileSystem } from "@game/FileSystem/filesystem";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import RACE_DATA from "@game/Constants/race-data";
import { Entity } from "./entity";
import { loadBasisTexture } from "./basis-texture";
import { createVATShaderMaterial } from "./entity-material";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";
import type GameManager from "@game/Manager/game-manager";
import { InventorySlot } from "@game/Player/player-constants";
import { Races } from "@game/Constants/constants";

type ModelKey = string;

export type EntityContainer = {
  container: BJS.AssetContainer;
  model: ModelKey;
  manager?: BJS.BakedVertexAnimationManager;
  shaderMaterial?: BJS.ShaderMaterial;
  meshes: BJS.Mesh[];
  textureAtlas: string[];
  animations: AnimationEntry[];
  secondaryMeshes: number;
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

// Texture attributes are defined as x: texture index, y: rgba mask
const TEXTURE_ATTRIBUTE_BUFFER = new Int32Array([0, 0]);
const ANIMATION_BUFFER = new BABYLON.Vector4(0, 1, 0, 60);

export class EntityCache {
  private static containers: Record<ModelKey, Promise<EntityContainer | null>> =
    {};
  private static resolvedContainers: Record<ModelKey, EntityContainer | null> =
    {};

  /**
   * Retrieves or creates a shared parent node on the scene
   * under which all entities will be bucketed.
   */
  private static getOrCreateNodeContainer(scene: BJS.Scene): BJS.Node {
    const existing = scene.getNodeByName("entityNodeContainer");
    if (existing) {
      return existing as BJS.Node;
    }
    return new BABYLON.TransformNode("entityNodeContainer", scene);
  }

  /**
   * Loads (or returns cached) mesh/animation container for a given model.
   * @param model       model key (lowercased)
   * @param scene       Babylon scene
   * @param parentNode  parent under which to attach; defaults to shared container
   * @param reuseMaterial optional model key to reuse VAT material from
   */
  public static async getContainer(
    model: string,
    scene: BJS.Scene,
    reuseMaterial: string | null = null,
  ): Promise<EntityContainer | null> {
    model = model.toLowerCase();
    // console.log(`[EntityCache] Loading model ${model}`);

    const bucket = EntityCache.getOrCreateNodeContainer(scene);
    const baseModel = model.slice(0, 3);
    if (!EntityCache.containers[model]) {
      EntityCache.containers[model] = (async () => {
        // Load .babylon
        const bytes = await FileSystem.getFileBytes(
          `eqrequiem/babylon`,
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
        if (!container) return null;

        // Attach to bucket
        const root = container.rootNodes[0];
        root.name = `container_${model}`;
        (root as BJS.Mesh).setParent(bucket);

        // VAT setup
        let manager: BJS.BakedVertexAnimationManager | null = null;
        let shaderMaterial: BJS.ShaderMaterial | null = null;
        let textureAtlas: string[] = [];

        if (reuseMaterial && reuseMaterial in EntityCache.containers) {
          const reused = await EntityCache.containers[reuseMaterial];
          manager = reused?.manager ?? null;
          shaderMaterial = reused?.shaderMaterial ?? null;
          textureAtlas = reused?.textureAtlas ?? [];
        } else {
          // Vertex animation data
          const canUseFloat16 = scene.getEngine().getCaps().textureHalfFloat;
          const vat16 = `${model}.bin.gz`;
          const vat32 = `${model}_32.bin.gz`;
          const vatBytes = await FileSystem.getFileBytes(
            `eqrequiem/vat`,
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
            `eqrequiem/basis`,
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
          const rawArr = new BABYLON.RawTexture2DArray(
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
          rawArr.update(data);

          // Shader material
          shaderMaterial = createVATShaderMaterial(
            scene,
            rawArr,
            manager.texture!,
          );
          shaderMaterial.name = `vatShader_${model}`;

          // Atlas
          textureAtlas =
            (await FileSystem.getFileJSON<string[]>(
              `eqrequiem/basis`,
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
        }

        // Gather animations
        let animations: BJS.AnimationRange[] = [];
        const infoNode = (root as any).getChildTransformNodes()?.[0];

        const json = await FileSystem.getFileJSON(
          `eqrequiem/vat`,
          `${model}.json`,
        ) as any;
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
        for (const mesh of meshes) {
          mesh.addLODLevel(500, null);
          mesh.parent = bucket;
          mesh.name = mesh.material?.name ?? "";
          mesh.registerInstancedBuffer(
            "bakedVertexAnimationSettingsInstanced",
            4,
          );
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            ANIMATION_BUFFER;
          mesh.registerInstancedBuffer("textureAttributes", 2);
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
            continue;
          }
          mat.dispose();
          mesh.material = shaderMaterial!;
          mesh.parent = bucket;
        }
        // Clean up skeletons
        container.skeletons.forEach((s) => s.bones.forEach((b) => b.dispose()));
        container.skeletons.forEach((s) => s.dispose());

        return {
          container,
          model,
          manager: manager!,
          shaderMaterial: shaderMaterial!,
          meshes,
          textureAtlas,
          animations,
          secondaryMeshes:
            infoNode?.metadata?.gltf?.extras?.secondaryMeshes ?? 0,
          boundingBox: infoNode?.metadata?.gltf?.extras?.boundingBox ?? null,
        };
      })()
        .then((c) => {
          if (c) {
            EntityCache.resolvedContainers[model] = c;
            return c;
          } else {
            delete EntityCache.containers[model];
            return null;
          }
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
    let robed = false;
    if (spawn instanceof Spawn) {
      robed = (spawn.isNpc ? spawn.equipChest : spawn.equipment.chest) >= 10;
    } else if (spawn instanceof PlayerProfile) {
      robed =
        (spawn.inventoryItems
          ?.toArray()
          .find((i) => i.slot === InventorySlot.Chest)?.item.material ?? 0) >=
        10;
    }
    if (robed) {
      model += "01";
    }
    model = model.toLowerCase();
    const container = await EntityCache.getContainer(model, scene);
    if (!container) return null;
    return new Entity(gameManager, spawn, scene, container, this, parentNode!);
  }

  public static dispose(model: ModelKey): void {
    delete EntityCache.containers[model];
  }

  public static disposeAll(scene: BJS.Scene): void {
    Entity.disposeStatics();
    Object.keys(EntityCache.resolvedContainers).forEach((m) => {
      const c = EntityCache.resolvedContainers[m];
      if (!c) return;
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
