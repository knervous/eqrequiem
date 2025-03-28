import { Node3D, Vector3, deg_to_rad } from "godot";
import { BaseGltfModel } from "../GLTF/base";

export default class ZoneObjects {
  parent: Node3D;
  objects: any;
  constructor(parent: Node3D, objects: any) {
    this.parent = parent;
    this.objects = objects;
  }
  dispose() {
    // Clean up resources if needed.
  }
  async Load(): Promise<void> {
    try {
      // Process each key in parallel.
      const keyPromises = Object.entries(this.objects).map(
        async ([key, entries]) => {
          const objectModel = new BaseGltfModel("objects", key);
          const packedScene = await objectModel.createPackedScene();
          if (packedScene) {
            // Process each entry in parallel.
            await Promise.all(
              (entries as any[]).map(async (entry) => {
                const instance =
                  (await objectModel.instancePackedScene()) as Node3D;
                if (instance) {
                  this.parent.add_child(instance);
                  instance.position = new Vector3(-entry.x, entry.y, entry.z);
                  instance.scale = new Vector3(
                    entry.scale,
                    entry.scale,
                    entry.scale,
                  );

                  instance.rotate_x(deg_to_rad(entry.rotateX));
                  instance.rotate_y(-deg_to_rad(entry.rotateY));
                  instance.rotate_z(deg_to_rad(entry.rotateZ));
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
