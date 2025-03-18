import { export_ } from "godot.annotations";
import { Camera3D, Color, Node3D, OmniLight3D, Variant, Vector3 } from "godot";
import { BaseGltfModel } from "../GLTF/base";
import { FileSystem } from "../FileSystem/filesystem";
import LightManager from "../Lights/light-manager";
import SkyManager from "../Sky/sky-manager";
export default class ZoneManager extends Node3D {
  private currentZone: Node3D | null = null;
  private camera: Camera3D | null = null;
  // Light manager
  private lightManager: LightManager | null = null;
  private skyManager: SkyManager | null = null;

  @export_(Variant.Type.TYPE_STRING)
  public zoneName = "qeynos2";

  _ready(): void {
    this.camera = this.get_node("Camera3D") as Camera3D;
    this.camera.cull_mask = 0xfffff;

    this.loadZone(this.zoneName);
  }

  public async loadZone(zoneName: string): Promise<void> {
    // Clean up the current zone
    if (this.currentZone) {
      this.remove_child(this.currentZone);
      this.currentZone.queue_free();
      this.currentZone = null;
      this.lightManager = null;
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

    const metadataByte = await FileSystem.getFileBytes(`eqrequiem/zones/${this.zoneName}.json`);
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
        this.lightManager = new LightManager(this.currentZone, this.camera!, metadata.lights);
        this.skyManager = new SkyManager(this.currentZone, 'sky1', this.camera);
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    this.set_process(true);
    this.set_physics_process(true);
  }

  _process(delta: number): void {
    if (this.lightManager) {
      this.lightManager.tick(delta);
    }
  }
}