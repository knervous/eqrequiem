// src/game/Actor/ActorPool.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import { Transform } from "@game/Zone/zone-types";
import { swapMaterialTexture } from "./bjs-utils";

type ModelKey = string;

export default class ObjectCache {
  private usePhysics: boolean = true;
  public containers: Record<ModelKey, Promise<BJS.AssetContainer>> = {};
  private physicsBodies: Record<ModelKey, BJS.PhysicsBody[] | null> = {};
  private objectContainer: BJS.TransformNode | null = null;
  private intervals: NodeJS.Timeout[] = [];
  constructor(usePhysics: boolean = true, zoneContainer: BJS.TransformNode | null = null) {
    this.usePhysics = usePhysics;
    if (zoneContainer) {
      this.objectContainer = zoneContainer;
    }
  }

  async getContainer(
    model: string,
    scene: BJS.Scene,
  ): Promise<BJS.AssetContainer | null> {
    if (!this.containers[model]) {
      const bytes = await FileSystem.getFileBytes(
        `eqrequiem/objects`,
        `${model}.glb`,
      );
      if (!bytes) {
        console.warn(`[ObjectCache] Failed to load model ${model}`);
        return null;
      }
      const file = new File([bytes!], `${model}.glb`, {
        type: "model/gltf-binary",
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
      //result.rootNodes[0].parent = this.objectContainer;
      this.containers[model] = Promise.resolve(result);
    }
    return this.containers[model]!;
  }
  async addThinInstances(
    model: string,
    scene: BJS.Scene,
    instanceTranslations: Transform[],
    usePhysics: boolean = true,
  ): Promise<BJS.AbstractMesh[]> {
    const container = await this.getContainer(model, scene);
    if (!container) { return []; }
  
    const root = container.rootNodes[0] as BJS.TransformNode;
    const transforms = instanceTranslations;
    const count = transforms.length;
    const matrixData = new Float32Array(16 * count);
    // Store physics bodies for this model
    const physicsBodies: BJS.PhysicsBody[] = [];
  
    // Build the transformation matrices for thin instances
    for (let i = 0; i < count; i++) {
      const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
      if (x === 0 && y === 0 && z === 0) {
        continue; // Skip invalid transforms
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
    }
  
    const meshes = root.getChildMeshes().filter((m) => m instanceof BABYLON.Mesh) as BJS.Mesh[];
    for (const mesh of meshes) {
      // Apply thin instance buffer
      mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
      mesh.alwaysSelectAsActiveMesh = false;
      mesh.thinInstanceRefreshBoundingInfo(true, false, false);
      
      const materialExtras = mesh?.material?.metadata?.gltf?.extras;
      if (materialExtras?.frames?.length && materialExtras?.animationDelay) {
        const { frames, animationDelay } = materialExtras;
        console.log('Ex', materialExtras);
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
  
      if (usePhysics && this.usePhysics) {
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
    }
  
    // Store physics bodies for this model in the cache
    this.physicsBodies[model] = physicsBodies.length > 0 ? physicsBodies : null;
  
    return meshes;
  }
  dispose(model: ModelKey): void {
    if (model in this.containers) {
      this.containers[model].then((container) => {
        // Dispose of physics body if it exists
        if (this.physicsBodies[model]) {
          this.physicsBodies[model]?.forEach?.((p) => p.dispose());
          delete this.physicsBodies[model];
        }
        // Dispose of the container
        container.dispose();
      });
      // Remove from cache
      delete this.containers[model];
    }
  }

  disposeAll(): void {
    this.intervals.forEach((interval) => clearInterval(interval));

    Object.keys(this.containers).forEach((model) => this.dispose(model));
  }
}