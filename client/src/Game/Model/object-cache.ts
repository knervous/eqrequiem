// src/game/Model/object-cache.ts
import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { FileSystem } from "@game/FileSystem/filesystem";
import { Transform } from "@game/Zone/zone-types";
import { fetchShadoBytes } from "@knervous/shado/preprocess/runtime";
import {
  getAssetContainerMeshes,
  getOrCreateAssetContainerRoot,
} from "./asset-container";
import { swapMaterialTexture } from "./bjs-utils";

type ModelKey = string;

type ContainerData = {
  container: BJS.AssetContainer;
  hasAnimations: boolean;
  animationRanges: BJS.Nullable<BJS.AnimationRange>[];
  physicsBodies: BJS.PhysicsBody[] | null;
  manager: BJS.BakedVertexAnimationManager | null;
  morphTargetManager: BJS.MorphTargetManager | undefined;
};
export default class ObjectCache {
  public dataContainers: Record<ModelKey, Promise<ContainerData>> = {};
  private objectContainer: BJS.TransformNode | null = null;
  private animatedMaterialNames: string[] = [];
  private managerCallbacks: (() => void)[] = [];
  private promotedMeshes = new Map<ModelKey, BJS.Mesh[]>();
  constructor(zoneContainer: BJS.TransformNode | null = null) {
    if (zoneContainer) {
      this.objectContainer = zoneContainer;
    }
  }

  async getContainer(
    model: string,
    scene: BJS.Scene,
    promotedSource?: string,
  ): Promise<ContainerData | null> {
    if (!this.dataContainers[model]) {
      let fileName = promotedSource ? "final.glb" : `${model}.babylon`;
      let bytes: ArrayBuffer | undefined;
      if (promotedSource) {
        try {
          bytes = await fetchShadoBytes(promotedSource);
        } catch {
          fileName = `${model}.glb`;
        }
      }
      bytes ??= await FileSystem.getFileBytes("eqrequiem/objects", fileName);
      if (!bytes && promotedSource) {
        fileName = `${model}.babylon`;
        bytes = await FileSystem.getFileBytes("eqrequiem/objects", fileName);
      }
      if (!bytes) {
        console.warn(`[ObjectCache] Failed to load model ${model}`);
        return null;
      }
      let result: BJS.AssetContainer;
      try {
        result = fileName.endsWith(".glb")
          ? await BABYLON.LoadAssetContainerAsync(
              new File([bytes], fileName, { type: "model/gltf-binary" }),
              scene,
            )
          : await BABYLON.loadBabylonAssetContainer(bytes, scene, {
              name: fileName,
            });
      } catch (error) {
        if (!promotedSource || fileName.endsWith(".babylon")) throw error;
        const legacyFileName = `${model}.babylon`;
        const legacyBytes = await FileSystem.getFileBytes(
          "eqrequiem/objects",
          legacyFileName,
        );
        if (!legacyBytes) throw error;
        result = await BABYLON.loadBabylonAssetContainer(
          legacyBytes,
          scene,
          { name: legacyFileName },
        );
      }
      if (!result) {
        console.error(`Failed to load model ${model}`);
        return null;
      }
      result.addAllToScene();

      const root = getOrCreateAssetContainerRoot(
        result,
        scene,
        `container_${model}`,
      );
      const modelMeshes = getAssetContainerMeshes(result);
      if (!modelMeshes.length) {
        console.warn(`[ObjectCache] Model ${model} contains no renderable meshes`);
        result.dispose();
        return null;
      }
      const { animationGroups, skeletons } = result;
      const hasAnimations = animationGroups.length > 0;

      const animationRanges: BJS.AnimationRange[] = [];
      root.setEnabled(false);

      let manager: BJS.BakedVertexAnimationManager | null = null;
      let morphTargetManager: BJS.MorphTargetManager | undefined = undefined;

      const hasMorphTargets = modelMeshes.some((m) => m.morphTargetManager);
      if (hasMorphTargets) {
        console.log(
          "[ObjectCache] Model has morph targets:",
          animationGroups,
          model,
        );
        animationGroups[0]?.play?.(true);
        morphTargetManager = modelMeshes.find(
          (m) => m.morphTargetManager,
        )?.morphTargetManager ?? undefined;
        console.log("Setting morph target manager", morphTargetManager);
      }

      if (hasAnimations && !hasMorphTargets && skeletons.length) {
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
        const vatData = (
          canUseFloat16 ? new Uint16Array(vatBytes) : new Float32Array(vatBytes)
        ) as Uint16Array | Float32Array;

        if (vatData) {
          const baker = new BABYLON.VertexAnimationBaker(
            scene,
            result.skeletons[0],
          );
          manager = new BABYLON.BakedVertexAnimationManager(scene);
          // result.skeletons[0].dispose();
          // scene.removeSkeleton(result.skeletons[0]);
          manager.texture = baker.textureFromBakedVertexData(vatData);
          const cb = () => {
            if (!manager || !manager.texture) {
              return;
            }
            manager.time += scene.getEngine().getDeltaTime() / 1000.0;
          };
          this.managerCallbacks.push(cb);
          scene.registerBeforeRender(cb);
        }
      }
      // result.rootNodes[0].dispose();

      this.dataContainers[model] = Promise.resolve({
        container: result,
        morphTargetManager,
        hasAnimations,
        animationRanges,
        manager,
        physicsBodies: [],
      });
    }
    return this.dataContainers[model]!;
  }

  async addThinInstances(
    model: string,
    scene: BJS.Scene,
    instanceTranslations: Transform[],
  ): Promise<BJS.AbstractMesh[]> {
    const dataContainer = await this.getContainer(model, scene);
    if (!dataContainer) {
      return [];
    }
    const {
      container,
      hasAnimations,
      animationRanges,
      manager,
      morphTargetManager,
    } = dataContainer;

    const root = getOrCreateAssetContainerRoot(
      container,
      scene,
      `container_${model}`,
    );
    const transforms = instanceTranslations;
    const count = transforms.length;
    const matrixData = new Float32Array(16 * count);
    const animParameters = hasAnimations ? new Float32Array(count * 4) : null;

    // Store physics bodies for this model
    const physicsBodies: BJS.PhysicsBody[] = [];

    const meshes = getAssetContainerMeshes(container);

    const params = new BABYLON.Vector4();

    for (let i = 0; i < count; i++) {
      transforms[i].rotateY *= -1; // Invert Y rotation for correct orientation

      const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
      if (x === 0 && y === 0 && z === 0) {
        continue;
      }

      const translation = BABYLON.Matrix.Translation(x, y, z);
      const rotation = BABYLON.Matrix.RotationYawPitchRoll(
        BABYLON.Tools.ToRadians(rotateY),
        BABYLON.Tools.ToRadians(rotateX),
        BABYLON.Tools.ToRadians(rotateZ),
      );
      const scaling = BABYLON.Matrix.Scaling(scale, scale, scale);
      const transform = scaling.multiply(rotation).multiply(translation);
      transform.copyToArray(matrixData, i * 16);

      if (animParameters && animationRanges.length) {
        const [firstAnimationRange] = animationRanges;
        params.set(
          firstAnimationRange?.from ?? 0,
          firstAnimationRange?.to ?? 0,
          0,
          60,
        );
        animParameters.set(params.asArray(), i * 4);
      }
    }
    if (!morphTargetManager) {
      const objectMesh = BABYLON.Mesh.MergeMeshes(
        meshes,
        true,
        true,
        undefined,
        false,
        true,
      ) as BJS.Mesh;
      if (!objectMesh) {
        console.warn(`[ObjectCache] No meshes found for model ${model}`);
        return [];
      }
      if (morphTargetManager) {
        console.log(
          "Setting morph target manager",
          morphTargetManager,
          "MESH",
          objectMesh,
        );
        objectMesh.morphTargetManager = morphTargetManager;
      }
      objectMesh.skeleton = container.skeletons[0] || null;
      objectMesh.setParent(this.objectContainer);
      objectMesh.isPickable = false;
      objectMesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
      objectMesh.alwaysSelectAsActiveMesh = true;
      objectMesh.thinInstanceRefreshBoundingInfo(true, false, false);
      if (manager) {
        objectMesh.bakedVertexAnimationManager = manager;
        objectMesh.thinInstanceSetBuffer(
          "bakedVertexAnimationSettingsInstanced",
          animParameters,
          4,
        );
      }

      if (!objectMesh.name?.endsWith("-passthrough")) {
        // Create a physics shape for the mesh (shared across instances)
        const physicsShape = new BABYLON.PhysicsShapeMesh(
          objectMesh as BJS.Mesh,
          scene!,
        );
        // Create a new transform node for the physics body to hold its position
        const physicsTransformNode = new BABYLON.TransformNode(
          `${objectMesh.name}_physics_${model}`,
          scene!,
        );
        physicsTransformNode.setParent(this.objectContainer);
        // Create individual physics bodies for each instance
        for (let i = 0; i < count; i++) {
          const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
          if (x === 0 && y === 0 && z === 0) {
            continue; // Skip invalid transforms
          }

          // Apply the transformation to the transform node
          const translation = BABYLON.Matrix.Translation(x, y, z);
          const rotation = BABYLON.Matrix.RotationYawPitchRoll(
            BABYLON.Tools.ToRadians(rotateY),
            BABYLON.Tools.ToRadians(rotateX),
            BABYLON.Tools.ToRadians(rotateZ),
          );
          const scaling = BABYLON.Matrix.Scaling(scale, scale, scale);
          const transformMatrix = scaling
            .multiply(rotation)
            .multiply(translation);
          physicsTransformNode.setPreTransformMatrix(transformMatrix);

          // Create a new physics body for this instance
          const physicsBody = new BABYLON.PhysicsBody(
            physicsTransformNode,
            BABYLON.PhysicsMotionType.STATIC,
            false,
            scene!,
          );
          physicsBody.shape = physicsShape; // Reuse the same shape for efficiency
          physicsBody.setMassProperties({ mass: 0 }); // Static body

          // Store the physics body
          physicsBodies.push(physicsBody);
        }
      }
      for (const mesh of objectMesh.subMeshes) {
        const materialExtras = mesh.getMaterial()?.metadata?.gltf?.extras;
        if (
          materialExtras?.frames?.length &&
          materialExtras?.animationDelay &&
          !this.animatedMaterialNames.includes(mesh.getMaterial()!.name)
        ) {
          const textures = mesh.getMaterial()?.getActiveTextures();
          textures?.forEach((tex) => scene.removeTexture(tex));
          const { frames, animationDelay } = materialExtras;
          let currentFrameIndex = 0;
          let elapsedMs = 0;
          const callback = () => {
            try {
              elapsedMs += scene.getEngine().getDeltaTime();
              if (elapsedMs < animationDelay * 2) return;
              elapsedMs %= animationDelay * 2;
              currentFrameIndex = (currentFrameIndex + 1) % frames.length;
              const selectedFrame = frames[currentFrameIndex] as string;
              swapMaterialTexture(mesh.getMaterial()!, selectedFrame, true);
            } catch (error) {
              console.error(
                `[ObjectCache] Failed to swap texture for mesh ${mesh}:`,
                mesh,
                error,
              );
              scene.unregisterBeforeRender(callback);
            }
          };

          scene.registerBeforeRender(callback);
          this.managerCallbacks.push(callback);
          this.animatedMaterialNames.push(mesh.getMaterial()!.name);
        }
      }
    } else {
      for (const mesh of meshes) {
        mesh.setParent(this.objectContainer); // put it under an enabled node
        mesh.setEnabled(true);
        mesh.isPickable = false;
        mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
        mesh.alwaysSelectAsActiveMesh = false;
        mesh.thinInstanceRefreshBoundingInfo(true, false, false);
      }
    }

    root.dispose();
    // Store physics bodies for this model in the cache
    dataContainer.physicsBodies =
      physicsBodies.length > 0 ? physicsBodies : null;

    return meshes;
  }

  /**
   * Upload final Babylon-space matrices produced by a Shado world package.
   * Unlike the legacy Transform path, these matrices must not receive any
   * coordinate-system or yaw correction in the client.
   */
  async setPromotedThinInstances(
    model: string,
    source: string,
    scene: BJS.Scene,
    matrixData: Float32Array,
  ): Promise<BJS.Mesh[]> {
    let renderMeshes = this.promotedMeshes.get(model);
    if (!renderMeshes) {
      const dataContainer = await this.getContainer(model, scene, source);
      if (!dataContainer) return [];

      const { container, manager, morphTargetManager } = dataContainer;
      const root = getOrCreateAssetContainerRoot(
        container,
        scene,
        `container_${model}`,
      );
      const sourceMeshes = getAssetContainerMeshes(container);

      if (morphTargetManager) {
        renderMeshes = sourceMeshes;
      } else {
        const merged = BABYLON.Mesh.MergeMeshes(
          sourceMeshes,
          true,
          true,
          undefined,
          false,
          true,
        ) as BJS.Mesh | null;
        if (!merged) {
          console.warn(`[ObjectCache] No meshes found for promoted model ${model}`);
          return [];
        }
        merged.skeleton = container.skeletons[0] || null;
        if (manager) merged.bakedVertexAnimationManager = manager;
        renderMeshes = [merged];
      }

      for (const mesh of renderMeshes) {
        mesh.setParent(this.objectContainer);
        mesh.setEnabled(true);
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
      }
      this.promotedMeshes.set(model, renderMeshes);
      root.dispose();
    }

    for (const mesh of renderMeshes) {
      mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
      mesh.thinInstanceRefreshBoundingInfo(true, false, false);
    }
    return renderMeshes;
  }
  dispose(model: ModelKey): void {
    if (model in this.dataContainers) {
      this.dataContainers[model].then((container) => {
        // Dispose of physics body if it exists
        if (container.physicsBodies) {
          container.physicsBodies[model]?.forEach?.((p) => p.dispose());
          container.physicsBodies = [];
        }
        // Dispose of the container
        container.container.dispose();
      });
      // Remove from cache
      delete this.dataContainers[model];
    }
  }

  disposeAll(): void {
    const scene = BABYLON.EngineStore.LastCreatedScene;
    if (scene) {
      for (const cb of this.managerCallbacks) {
        scene.unregisterBeforeRender(cb);
      }
    }

    for (const meshes of this.promotedMeshes.values()) {
      for (const mesh of meshes) {
        if (!mesh.isDisposed()) mesh.dispose();
      }
    }
    Object.keys(this.dataContainers).forEach((model) => this.dispose(model));
    this.managerCallbacks = [];
    this.animatedMaterialNames = [];
    this.promotedMeshes.clear();
  }
}
