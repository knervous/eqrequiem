import { Node3D, StaticBody3D, Vector3, deg_to_rad } from "godot";
import ObjectMesh from "@game/Object/object-geometry";
import { BaseGltfModel } from "@game/GLTF/base";
import { createStaticCollision } from "@game/GLTF/gltf-utilities";
export default class ZoneObjects {
  parent: Node3D;
  objects: any;
  usePhysics: boolean;
  constructor(parent: Node3D, objects: any, usePhysics: boolean) {
    this.parent = parent;
    this.objects = objects;
    this.usePhysics = usePhysics;
  }
  dispose() {
    // Clean up resources if needed.
  }
  async Load(): Promise<void> {
    try {
      const objectPool = new Node3D();
      objectPool.set_name("ObjectPool");
      this.parent.add_child(objectPool);
      // Process each key in parallel.
      const keyPromises = Object.entries(this.objects).map(
        async ([key, entries]) => {
          const objectModel = new ObjectMesh("objects", key, this.usePhysics);
          const packedScene = await objectModel.createPackedScene();
          if (packedScene) {
            // Process each entry in parallel.
            await Promise.all(
              (entries as any[]).map(async (entry, idx) => {
                const instance =
                  (await objectModel.instancePackedScene(objectPool, this.usePhysics)) as Node3D;
                if (instance) {
                  instance.set_name(`${key}-${idx}`);
                  instance.position = new Vector3(-entry.x, entry.y, entry.z);
                  instance.scale = new Vector3(
                    entry.scale,
                    entry.scale,
                    entry.scale,
                  );
                  instance.rotate_x(deg_to_rad(entry.rotateX));
                  instance.rotate_y(-deg_to_rad(entry.rotateY));
                  instance.rotate_z(deg_to_rad(entry.rotateZ));
                  createStaticCollision(instance);
                  
                }
              }),
            );
          }
        },
      );
      // Wait for all keys to finish processing.
      await Promise.all(keyPromises);
    } catch (e) {
      console.log("Error loading objects", e);
    }
  }
}
