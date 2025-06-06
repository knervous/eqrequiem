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
};

export type AnimationEntry = {
  from: number;
  to: number;
  name: string;
};

const SLICE_INDEX_BUFFER = new BABYLON.Vector2(0, 0);
const ANIMATION_BUFFER = new BABYLON.Vector4(0, 1, 0, 60);
export class EntityCache {
  private parent: BJS.Node;
  constructor(parent: BJS.Node) {
    this.parent = parent;
  }
  public containers: Record<ModelKey, Promise<EntityContainer | null>> = {};

  async getContainer(
    model: string,
    scene: BJS.Scene,
    reuseMaterial: string | null = null, // This will tell the container to reuse material based on model like 'hum'
  ): Promise<EntityContainer | null> {
    model = model.toLowerCase();
    console.log(`[EntityCache] Loading model ${model}`);
    if (!this.containers[model]) {
      this.containers[model] = new Promise(async (res) => {
        // Automatically comes back decompressed into a .babylon file
        const bytes = await FileSystem.getFileBytes(
          `eqrequiem/babylon`,
          `${model}.babylon.gz`,
        );
        if (!bytes) {
          console.log(`[EntityCache] Failed to load model ${model}`);
          return null;
        }
        const file = new File([bytes!], `${model}.babylon`, {
          type: "application/babylon",
        });

        const container = await BABYLON.LoadAssetContainerAsync(file, scene, { name: `${model}.babylon`, pluginExtension: 'babylon' }).catch((e) => {
          console.log(`[EntityCache] Error loading model ${model}:`, e);
          return null;
        });
        if (!container) {
          console.log(`Failed to load model ${model}`);
          return null;
        }
        container.rootNodes[0].name = `container_${model}`;
        container.rootNodes[0].setParent(this.parent);
        // VAT Textures
        let manager: BJS.BakedVertexAnimationManager | null = null;
        let shaderMaterial: BJS.ShaderMaterial | null = null;
        let textureAtlas: string[] | undefined = [];
        if (reuseMaterial && (await this.containers[reuseMaterial as string])) {
          const reusedContainer =
            await this.containers[reuseMaterial as string];
          manager = reusedContainer?.manager || null;
          shaderMaterial = reusedContainer?.shaderMaterial || null;
          textureAtlas = reusedContainer?.textureAtlas || [];
        } else {
          const vatDataBytes = await FileSystem.getFileBytes(
            `eqrequiem/vat`,
            `${model}.bin.gz`,
          );
          if (!vatDataBytes) {
            console.warn(
              `[EntityCache] Failed to load VAT data for model ${model}`,
            );
            res(null);
            return null;
          }
          const vatData = new Float32Array(vatDataBytes);
          const baker = new BABYLON.VertexAnimationBaker(
            scene,
            container.skeletons[0],
          );
          manager = new BABYLON.BakedVertexAnimationManager(scene);
          const vertexTexture = baker.textureFromBakedVertexData(vatData);
          manager.texture = vertexTexture;
          const engine = scene.getEngine();
          const basisBytes = await FileSystem.getFileBytes(
            `eqrequiem/basis`,
            `${model}.basis`,
          );
          if (!basisBytes) {
            console.warn(
              `[EntityCache] Failed to load basis texture for model ${model}`,
            );
            res(null);
            return null;
          }
          const { data, layerCount, format } = await loadBasisTexture(
            engine,
            basisBytes,
          );
          const rawArr = new BABYLON.RawTexture2DArray(
            null,
            128,
            128,
            layerCount,
            format,
            scene,
            false, // generateMipMaps = false
            false, // invertY = false
            BABYLON.Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
          );
          // Never use GPU compression for now, always just update the whole block
          rawArr.update(data);

          // Shader material
          shaderMaterial = createVATShaderMaterial(
            scene,
            rawArr,
            vertexTexture,
          );
          shaderMaterial.name = `vatShader_${model}`;

          // Texture Atlas
          textureAtlas = await FileSystem.getFileJSON<string[]>(
            `eqrequiem/basis`,
            `${model}.json`,
          );
          if (!textureAtlas) {
            console.warn(
              `[EntityCache] Failed to load VAT atlas for model ${model}`,
            );
            res(null);
            return null;
          }
          const cb = () => {
            if (!manager) return;
            manager.time += scene.getEngine().getDeltaTime() / 1000.0;
          };
          scene.registerBeforeRender(cb);
          this.parent.onDisposeObservable.add(() => {
            scene.unregisterBeforeRender(cb);
          });
          
        }

        const animationRanges: BJS.AnimationRange[] = container.rootNodes[0]?.getChildTransformNodes()?.[0]?.metadata?.gltf?.extras?.animationRanges as BJS.AnimationRange[] || [];
        
        let startTime = 0;
        const animations: AnimationEntry[] = [];
        for (const r of animationRanges) {
          animations.push({
            from: r.from + startTime,
            to: Math.max(1, r.to + startTime),
            name: r.name,
          });
          startTime += r.to;
        }

        const meshes = (container.rootNodes[0]
          ?.getChildMeshes()
          .filter((m) => m.getTotalVertices() > 0) ?? []) as BJS.Mesh[];
        for (const mesh of meshes) {
          mesh.parent = this.parent;
          mesh.name = mesh.material?.name ?? "";
          mesh.registerInstancedBuffer(
            "bakedVertexAnimationSettingsInstanced",
            4,
          );
          mesh.instancedBuffers.bakedVertexAnimationSettingsInstanced =
            ANIMATION_BUFFER;
          mesh.registerInstancedBuffer("sliceIndex", 2);
          mesh.instancedBuffers.sliceIndex = SLICE_INDEX_BUFFER;
          mesh.bakedVertexAnimationManager = manager;
          mesh.parent = null; // remove any hierarchy offset
          mesh.computeWorldMatrix(true); // ensure worldMatrix is up to date
          mesh.bakeTransformIntoVertices(mesh.getWorldMatrix()); // bake transform into vertex data
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, 0, 0);
          mesh.scaling.set(1, 1, 1);
          const material = mesh.material;
          if (!material) {
            console.warn(`[EntityCache] Mesh ${mesh.name} has no material`);
            continue;
          }
          const match = material.name.match(charFileRegex);
          if (!match) {
            console.log(
              `[Player] Sub-material name ${material.name} does not match expected format`,
            );
            return;
          }

          const [, , piece, , texIdx] = match;
          mesh.metadata = {
            ...(mesh.metadata || {}),
            piece,
            texIdx: +texIdx.trim(),
          };
          mesh.material?.dispose();
          mesh.material = shaderMaterial;
        }

        container.skeletons.forEach((s) => {
          s.bones.forEach((b) => {
            b.dispose(); // remove any hierarchy offset
          });
        });
        // Dispose skeleton for perf
        container.skeletons.forEach((s) => s.dispose());

        const entityContainer: EntityContainer = {
          container: container,
          model: model,
          manager: manager || undefined,
          shaderMaterial: shaderMaterial || undefined,
          meshes: meshes,
          textureAtlas: textureAtlas,
          animations,
          secondaryMeshes: container.rootNodes[0]?.getChildTransformNodes()?.[0]?.metadata?.gltf?.extras?.secondaryMeshes ?? 0,
        };
        res(entityContainer);
      });
    }
    return this.containers[model]!;
  }

  async getInstance(spawn: Spawn, scene: BJS.Scene): Promise<Entity | null> {
    const race = spawn?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[spawn.gender ?? 0] || raceDataEntry[2];
    const container = await this.getContainer(model, scene);
    if (!container) {
      return null;
    }
    return new Entity(spawn, scene, container, this, this.parent);
  }

  dispose(model: ModelKey): void {
    if (model in this.containers) {
      // Remove from cache
      delete this.containers[model];
    }
  }

  disposeAll(): void {
    Object.keys(this.containers).forEach((model) => this.dispose(model));
  }
}

export default EntityCache;
