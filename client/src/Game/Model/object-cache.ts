// src/game/Model/object-cache.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import { Transform } from "@game/Zone/zone-types";
import { swapMaterialTexture } from "./bjs-utils";
import { textureFromBakedVertexDataHalfFloat } from "./vat-texture";

type ModelKey = string;

type ContainerData = {
  container: BJS.AssetContainer;
  hasAnimations: boolean;
  animationRanges: BJS.Nullable<BJS.AnimationRange>[];
  physicsBodies: BJS.PhysicsBody[] | null;
  vatData: Float32Array | null;
};

export default class ObjectCache {
  public dataContainers: Record<ModelKey, Promise<ContainerData>> = {};
  private objectContainer: BJS.TransformNode | null = null;
  private intervals: NodeJS.Timeout[] = [];
  constructor(zoneContainer: BJS.TransformNode | null = null) {
    if (zoneContainer) {
      this.objectContainer = zoneContainer;
    }
  }

  async getContainer(
    model: string,
    scene: BJS.Scene,
  ): Promise<ContainerData | null> {
    if (!this.dataContainers[model]) {
      const bytes = await FileSystem.getFileBytes(
        `eqrequiem/objects`,
        `${model}.babylon`,
      );
      if (!bytes) {
        console.warn(`[ObjectCache] Failed to load model ${model}`);
        return null;
      }
      const file = new File([bytes!], `${model}.babylon`, {
        type: "application/babylon",
      });
      const result = await BABYLON.LoadAssetContainerAsync(file, scene);
      if (!result) {
        console.error(`Failed to load model ${model}`);
        return null;
      }
      result.addAllToScene();
      // if you have a parent transform node, reparent after adding:
      if (this.objectContainer) {
        result.rootNodes[0].parent = this.objectContainer;
      }
      result.rootNodes[0].name = `container_${model}`;
      const { animationGroups, skeletons } = result;
      const hasAnimations = animationGroups.length > 0;
      let vatData: Uint16Array | null = null;
      const animationRanges: BJS.AnimationRange[] = [];
      result.rootNodes[0].setEnabled(false);
      if (hasAnimations && skeletons.length) {
        for (const ag of animationGroups) {
          const animationRange = new BABYLON.AnimationRange(ag.name, ag.from, ag.to);
          animationRanges.push(animationRange);
          ag.stop();
          ag.dispose();
        }
        result.animationGroups = [];
        const vatDataBytes = await FileSystem.getFileBytes('eqrequiem/vat', `${model}.bin.gz`);
        if (vatDataBytes) {
          vatData = new Uint16Array(vatDataBytes);
        }
      }
      result.rootNodes[0].setEnabled(true);

      this.dataContainers[model] = Promise.resolve({
        container: result,
        vatData,
        hasAnimations,
        animationRanges,
        physicsBodies: [],
      });
    }
    return this.dataContainers[model]!;
  }

  async addThinInstances(
    model: string,
    scene: BJS.Scene,
    instanceTranslations: Transform[],
    usePhysics: boolean = true,
  ): Promise<BJS.AbstractMesh[]> {
    const dataContainer = await this.getContainer(model, scene);
    if (!dataContainer) { return []; }
    const { container, vatData, hasAnimations, animationRanges } = dataContainer;

    const root = container.rootNodes[0] as BJS.TransformNode;
    const transforms = instanceTranslations;
    const count = transforms.length;
    const matrixData = new Float32Array(16 * count);
    const animParameters = hasAnimations ? new Float32Array(count * 4) : null;

    // Store physics bodies for this model
    const physicsBodies: BJS.PhysicsBody[] = [];

    const meshes = root.getChildMeshes().filter((m) => m instanceof BABYLON.Mesh) as BJS.Mesh[];
    const manager = new BABYLON.BakedVertexAnimationManager(scene);

    if (hasAnimations && vatData) {
      const vertexTexture = textureFromBakedVertexDataHalfFloat(vatData, container.skeletons[0], scene);
      scene.removeSkeleton(container.skeletons[0]);
      manager.texture = vertexTexture;
      container.animationGroups = [];
      scene.registerBeforeRender(() => {
        manager.time += scene.getEngine().getDeltaTime() / 1000.0;
      });
    }

    const params = new BABYLON.Vector4();

    for (let i = 0; i < count; i++) {
      const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
      if (x === 0 && y === 0 && z === 0) {
        continue;
      }

      const translation = BABYLON.Matrix.Translation(-x, y, z);
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
        params.set(firstAnimationRange?.from ?? 0, firstAnimationRange?.to ?? 0, 0, 60);
        animParameters.set(params.asArray(), i * 4);
      }
    }

    for (const mesh of meshes) {
      mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.thinInstanceRefreshBoundingInfo(true, false, false);
      if (vatData) {
        mesh.bakedVertexAnimationManager = manager;
        mesh.thinInstanceSetBuffer("bakedVertexAnimationSettingsInstanced", animParameters, 4);
      }
      const materialExtras = mesh?.material?.metadata?.gltf?.extras;
      if (materialExtras?.frames?.length && materialExtras?.animationDelay) {
        const { frames, animationDelay } = materialExtras;
        let currentFrameIndex = 0;
        const intervalId = setInterval(() => {
          try {
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            const selectedFrame = frames[currentFrameIndex] as string;
            swapMaterialTexture(mesh.material!, selectedFrame, true);
          } catch (error) {
            console.error(`[ObjectCache] Failed to swap texture for mesh ${mesh.name}:`, error);
            clearInterval(intervalId);
          }
        }, animationDelay * 2);

        this.intervals.push(intervalId);
      }
  
      // Create a physics shape for the mesh (shared across instances)
      const physicsShape = new BABYLON.PhysicsShapeMesh(mesh as BJS.Mesh, scene!);
  
      // Create individual physics bodies for each instance
      for (let i = 0; i < count; i++) {
        const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
        if (x === 0 && y === 0 && z === 0) {
          continue; // Skip invalid transforms
        }
  
        // Create a new transform node for the physics body to hold its position
        const physicsTransformNode = new BABYLON.TransformNode(
          `${mesh.name}_physics_${i}`,
            scene!,
        );
        physicsTransformNode.parent = container.rootNodes[0].parent;
  
        // Apply the transformation to the transform node
        const translation = BABYLON.Matrix.Translation(-x, y, z);
        const rotation = BABYLON.Matrix.RotationYawPitchRoll(
          BABYLON.Tools.ToRadians(rotateY),
          BABYLON.Tools.ToRadians(rotateX),
          BABYLON.Tools.ToRadians(rotateZ),
        );
        const scaling = BABYLON.Matrix.Scaling(scale, scale, scale);
        const transformMatrix = scaling.multiply(rotation).multiply(translation);
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
  
    // Store physics bodies for this model in the cache
    dataContainer.physicsBodies = physicsBodies.length > 0 ? physicsBodies : null;
  
    return meshes;
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
    this.intervals.forEach((interval) => clearInterval(interval));

    Object.keys(this.dataContainers).forEach((model) => this.dispose(model));
  }
}