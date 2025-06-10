// src/game/Actor/ActorPool.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import RACE_DATA from "@game/Constants/race-data";
import { Entity } from "./entity";
import { loadBasisTexture } from "./basis-texture";
import { createVATShaderMaterial } from "./entity-material";
import { charFileRegex } from "@game/Constants/constants";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";

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
  boundingBox?: { min: number[]; max: number[]; center: number[] } | null;
};

export type AnimationEntry = {
  from: number;
  to: number;
  name: string;
};

const SLICE_INDEX_BUFFER = new BABYLON.Vector2(0, 0);
const ANIMATION_BUFFER = new BABYLON.Vector4(0, 1, 0, 60);

export class EntityCache {
  private static containers: Record<ModelKey, Promise<EntityContainer | null>> = {};

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
    console.log(`[EntityCache] Loading model ${model}`);

    const bucket = EntityCache.getOrCreateNodeContainer(scene);

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
        const file = new File([bytes], `${model}.babylon`, { type: "application/babylon" });
        const container = await BABYLON.LoadAssetContainerAsync(
          file,
          scene,
          { name: `${model}.babylon`, pluginExtension: '.babylon' },
        ).catch((e) => { console.log(`[EntityCache] Error loading model ${model}:`, e); return null; });
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
          const vatBytes = await FileSystem.getFileBytes(`eqrequiem/vat`, `${model}.bin.gz`);
          if (!vatBytes) { console.warn(`[EntityCache] VAT data missing for ${model}`); return null; }
          const vatData = new Float32Array(vatBytes);
          const baker = new BABYLON.VertexAnimationBaker(scene, container.skeletons[0]);
          manager = new BABYLON.BakedVertexAnimationManager(scene);
          manager.texture = baker.textureFromBakedVertexData(vatData);

          // Basis textures
          const basisBytes = await FileSystem.getFileBytes(`eqrequiem/basis`, `${model}.basis`);
          if (!basisBytes) { console.warn(`[EntityCache] Basis texture missing for ${model}`); return null; }
          const { data, layerCount, format } = await loadBasisTexture(scene.getEngine(), basisBytes);
          const rawArr = new BABYLON.RawTexture2DArray(null, 128, 128, layerCount, format, scene, false, false, BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
          rawArr.update(data);

          // Shader material
          shaderMaterial = createVATShaderMaterial(scene, rawArr, manager.texture!);
          shaderMaterial.name = `vatShader_${model}`;

          // Atlas
          textureAtlas = await FileSystem.getFileJSON<string[]>(`eqrequiem/basis`, `${model}.json`) ?? [];
          if (!textureAtlas.length) { console.warn(`[EntityCache] VAT atlas missing for ${model}`); return null; }

          // Animate
          const frameUpdate = () => { manager!.time += scene.getEngine().getDeltaTime()/1000; };
          scene.registerBeforeRender(frameUpdate);
          bucket.onDisposeObservable.add(() => scene.unregisterBeforeRender(frameUpdate));
        }

        // Gather animations
        const infoNode = root.getChildTransformNodes()?.[0];
        const ranges: BJS.AnimationRange[] = infoNode?.metadata?.gltf?.extras?.animationRanges ?? [];
        let offset = 0;
        const animations: AnimationEntry[] = ranges.map((r) => {
          const entry = { from: r.from + offset, to: Math.max(1, r.to + offset), name: r.name };
          offset += r.to;
          return entry;
        });

        // Process meshes
        const meshes = container.rootNodes[0].getChildMeshes(false).filter((m) => m.getTotalVertices() > 0) as BJS.Mesh[];
        for (const mesh of meshes) {
          mesh.parent = bucket;
          mesh.name = mesh.material?.name ?? "";
          mesh.registerInstancedBuffer("bakedVertexAnimationSettingsInstanced", 4);
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced = ANIMATION_BUFFER;
          mesh.registerInstancedBuffer("sliceIndex", 2);
          mesh.instancedBuffers.sliceIndex = SLICE_INDEX_BUFFER;
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
          const match = mat.name.match(charFileRegex);
          if (!match) continue;
          const [, , piece, , texIdx] = match;
          mesh.metadata = { ...(mesh.metadata || {}), piece, texIdx: +texIdx.trim() };
          mat.dispose();
          mesh.material = shaderMaterial!;
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
          secondaryMeshes: infoNode?.metadata?.gltf?.extras?.secondaryMeshes ?? 0,
          boundingBox: infoNode?.metadata?.gltf?.extras?.boundingBox ?? null,
        };
      })();
    }
    return EntityCache.containers[model];
  }

  /**
   * Instantiates an Entity under the given parent (or shared container).
   */
  public static async getInstance(
    spawn: Spawn | PlayerProfile,
    scene: BJS.Scene,
    parentNode?: BJS.Node,
  ): Promise<Entity | null> {

    const race = spawn.race ?? 1;
    const entry = RACE_DATA[race];
    const model = entry[spawn.gender ?? 0] || entry[2];
    const container = await EntityCache.getContainer(model, scene);
    if (!container) return null;
    return new Entity(spawn, scene, container, this, parentNode!);
  }

  public static dispose(model: ModelKey): void {
    delete EntityCache.containers[model];
  }

  public static disposeAll(): void {
    Object.keys(EntityCache.containers).forEach((m) => delete EntityCache.containers[m]);
  }
}

export default EntityCache;
