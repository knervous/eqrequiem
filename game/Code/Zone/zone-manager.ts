import { export_ } from "godot.annotations";
import { Camera3D, Color, Node3D, OmniLight3D, Variant, Vector3 } from "godot";
import { BaseGltfModel } from "../GLTF/base";
import { FileSystem } from "../FileSystem/filesystem";

export default class ZoneManager extends Node3D {
  private currentZone: Node3D | null = null;

  @export_(Variant.Type.TYPE_STRING)
  public zoneName = "gfaydark";

  _ready(): void {
    const camera = this.get_node("Camera3D") as Camera3D;
    camera.cull_mask = 0xfffff; // See all layers (default)
    this.loadZone(this.zoneName);
  }

  public async loadZone(zoneName: string): Promise<void> {
    // Clean up the current zone
    if (this.currentZone) {
      this.remove_child(this.currentZone);
      this.currentZone.queue_free();
      this.currentZone = null;
    }

    this.zoneName = zoneName;
    const zone = new Node3D();
    this.add_child(zone);
    this.currentZone = zone;
    this.instantiateZone();
  }

  private async instantiateZone() {
    if (!this.currentZone) {
      return;
    }
    this.set_process(false);
    this.set_physics_process(false);

    const zoneModel = new BaseGltfModel("zones", this.zoneName);
    const rootNode = await zoneModel.instantiate();
    if (rootNode) {
      this.currentZone.add_child(rootNode);
    }

    const metadataByte = await FileSystem.getFileBytes(`eqsage/zones/${this.zoneName}.json`);
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str);
        console.log("Got metadata", Object.keys(metadata));
        console.log("Version: ", metadata.version);

        for (const [key, entries] of Object.entries(metadata.objects)) {
          const objectModel = new BaseGltfModel("objects", key);
          const packedScene = await objectModel.createPackedScene();
          if (packedScene) {
            for (const entry of entries) {
              const instance = (await objectModel.instancePackedScene()) as Node3D;
              if (instance) {
                this.currentZone.add_child(instance);
                instance.position = new Vector3(-entry.x, entry.y, entry.z);
                instance.scale = new Vector3(entry.scale, entry.scale, entry.scale);
              }
            }
          }
        }

        for (const light of metadata.lights) {
          const lightNode = new OmniLight3D();
          this.currentZone.add_child(lightNode);
          lightNode.position = new Vector3(-light.x, light.y, light.z);
          const r = light.r > 1 ? light.r / 255 : light.r;
          const g = light.g > 1 ? light.g / 255 : light.g;
          const b = light.b > 1 ? light.b / 255 : light.b;
          lightNode.light_color = new Color(r, g, b, 1.0);
          lightNode.light_energy = 2.0;
          lightNode.omni_range = 150.0;
          lightNode.layers = 1 << 0;
        }
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    this.set_process(true);
    this.set_physics_process(true);
  }
}
