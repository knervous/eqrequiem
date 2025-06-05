import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import { Transform } from "@game/Zone/zone-types";

type ModelKey = string;

export type ObjectTranslation = {
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
};

export default class AssetContainer {
  protected usePhysics: boolean = true;
  protected assetPath: string = "models";
  protected physicsBodies: Record<ModelKey, BJS.PhysicsBody | null> = {};
  protected containers: Record<ModelKey, Promise<BJS.AssetContainer>> = {};

  constructor(assetPath = 'models', usePhysics: boolean = true) {
    this.assetPath = assetPath;
    this.usePhysics = usePhysics;
  }

  async getContainer(
    model: string,
    scene: BJS.Scene,
  ): Promise<BJS.AssetContainer | null> {
    if (!this.containers[model]) {
      let bytes = await FileSystem.getFileBytes(
        `eqrequiem/${this.assetPath}`,
        `${model}.glb`,
      );
      if (!bytes) {
        console.warn(`[ObjectCache] Failed to load model ${model}`);
        bytes = await FileSystem.getFileBytes(
          `eqrequiem/${this.assetPath}`,
          `hum.glb`,
        );
      }
      const file = new File([bytes!], `${model}.glb`, {
        type: "model/gltf-binary",
      });
      const result = await BABYLON.LoadAssetContainerAsync(file, scene);
      if (!result) {
        console.error(`Failed to load model ${model}`);
        return null;
      }

      this.containers[model] = Promise.resolve(result);
    }
    return this.containers[model]!;
  }


  protected getMergedMesh(container: BJS.AssetContainer): BJS.Mesh | null {
    const meshes = [] as BJS.Mesh[];
    for (const mesh of container.rootNodes[0]?.getChildMeshes() ?? []) {
      if (mesh.getTotalVertices() > 0) {
        meshes.push(mesh as BJS.Mesh);
      }
    }
    if (meshes.length === 0) {
      console.warn(`No valid meshes found in container ${container.rootNodes[0]?.name}`);
      return null;
    }
    try {
      const mergedMesh = BABYLON.Mesh.MergeMeshes(
        meshes,
        true, // dispose source meshes
        true, // allow 32-bit indices
        undefined, // mesh subclass
        true, // merge materials
        true, // multi-material
      );
      if (!mergedMesh) {
        throw new Error("MergeMeshes returned null");
      }
      mergedMesh.name = `merged_${container.rootNodes[0]?.name || "unknown"}`;
      return mergedMesh;
    } catch (e) {
      console.warn(`[ObjectCache] Warning merging object ${container.rootNodes[0]?.name}:`, e);
      return null;
    }
  }

  async addThinInstances(
    model: string,
    scene: BJS.Scene,
    instanceTranslations: Transform[],
  ): Promise<BJS.AbstractMesh[]> {
    const container = await this.getContainer(model, scene);
    if (!container) {
      console.warn(`[ObjectCache] No container for model ${model}`);
      return [];
    }

    const mesh = this.getMergedMesh(container);
    if (!mesh) {
      console.warn(`[ObjectCache] Failed to merge meshes for ${model}`);
      return [];
    }

    // Optimize mesh for thin instances
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isVisible = true;

    // Create transformation matrices for thin instances
    const instanceCount = instanceTranslations.length;
    const matrices = new Float32Array(16 * instanceCount);

    for (let i = 0; i < instanceCount; i++) {
      const { x, y, z, rotateX, rotateY, rotateZ, scale } = instanceTranslations[i];

      // Create transformation matrix: scale * rotation * translation
      const translation = BABYLON.Matrix.Translation(x, y, z);
      const rotation = BABYLON.Matrix.RotationYawPitchRoll(
        rotateY, // yaw (Y)
        rotateX, // pitch (X)
        rotateZ, // roll (Z)
      );
      const scaling = BABYLON.Matrix.Scaling(scale, scale, scale);
      const transform = scaling.multiply(rotation).multiply(translation);
      transform.copyToArray(matrices, i * 16);
    }

    // Assign thin instances buffer
    mesh.thinInstanceSetBuffer("matrix", matrices, 16);

    // Add physics if enabled and scene has physics engine
    if (this.usePhysics && scene.getPhysicsEngine()) {
      try {
        const physicsBody = new BABYLON.PhysicsBody(
          mesh,
          BABYLON.PhysicsMotionType.DYNAMIC,
          false,
          scene,
        );

        // Create a physics shape (box, sized based on mesh bounds)
        const boundingInfo = mesh.getBoundingInfo();
        const size = boundingInfo.boundingBox.extendSize.scale(2); // Approximate size
        const physicsShape = new BABYLON.PhysicsShapeBox(
          new BABYLON.Vector3(0, 0, 0),
          BABYLON.Quaternion.Identity(),
          size,
          scene,
        );

        // Set physics material (matching playground example)
        physicsShape.material = { friction: 0.2, restitution: 0.3 };

        // Assign shape and mass
        physicsBody.shape = physicsShape;
        physicsBody.setMassProperties({ mass: 1 });

        // Store physics body for cleanup
        this.physicsBodies[model] = physicsBody;

        // Synchronize physics instances
        physicsBody.updateBodyInstances();
      } catch (e) {
        console.warn(`[ObjectCache] Failed to initialize physics for ${model}:`, e);
      }
    }

    // Add the container to the scene
    container.addAllToScene();

    // Return the mesh with thin instances
    return [mesh];
  }

  disposeModel(model: ModelKey): void {
    if (model in this.containers) {
      this.containers[model].then((container) => {
        container.dispose();
      });
      // Remove from cache
      delete this.containers[model];
    }
  }

  disposeAll(): void {
    Object.keys(this.containers).forEach((model) => this.disposeModel(model));
  }
}