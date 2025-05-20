// src/game/Actor/ActorPool.ts
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

import { FileSystem } from "@game/FileSystem/filesystem";
import { Transform } from "@game/Zone/zone-types";

type ModelKey = string;

export default class ObjectCache {
  private usePhysics: boolean = true;
  public containers: Record<ModelKey, Promise<BJS.AssetContainer>> = {};
  private physicsBodies: Record<ModelKey, BJS.PhysicsBody | null> = {};
  private objectContainer: BJS.TransformNode | null = null;

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
    const count      = transforms.length;
    const matrixData = new Float32Array(16 * count);
  
    // build your 16-float matrices exactly as before…
    for (let i = 0; i < count; i++) {
      const { x, y, z, rotateX, rotateY, rotateZ, scale } = transforms[i];
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
      mesh.thinInstanceSetBuffer("matrix", matrixData, 16, false);
      mesh.alwaysSelectAsActiveMesh = false;

      // 3) rebuild the bounding‐info to include all instances
      mesh.thinInstanceRefreshBoundingInfo(true, false, false);

      if (usePhysics) {
        // 4) create a physics body for each instance
        // 2) attach a PhysicsBody to the base mesh
        const body = new BABYLON.PhysicsBody(
          mesh,
          BABYLON.PhysicsMotionType.STATIC, // or DYNAMIC
          false,                             // no impostor auto-sync
          scene,
        );

        // 3) give it a shape (box, sphere, etc.) matching the mesh’s bounds
        const bbox = mesh.getBoundingInfo().boundingBox.extendSize.scale(2);
        body.shape = new BABYLON.PhysicsShapeBox(
          BABYLON.Vector3.Zero(),
          BABYLON.Quaternion.Identity(),
          bbox,
          scene,
        );

        // 4) tell it to spawn one physical body *for each* thin instance
        body.updateBodyInstances();
        this.physicsBodies[model] = body;
      }
    }
    return meshes;
  }

  dispose(model: ModelKey): void {
    if (model in this.containers) {
      this.containers[model].then((container) => {
        // Dispose of physics body if it exists
        if (this.physicsBodies[model]) {
          this.physicsBodies[model]?.dispose();
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
    Object.keys(this.containers).forEach((model) => this.dispose(model));
  }
}