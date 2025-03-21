import { export_ } from "godot.annotations";
import {
  Camera3D,
  InputEvent,
  InputEventAction,
  InputEventMouseButton,
  Node3D,
  Variant,
  Vector3,
  deg_to_rad,
} from "godot";
import { BaseGltfModel } from "../GLTF/base";
import { FileSystem } from "../FileSystem/filesystem";
import LightManager from "../Lights/light-manager";
import SkyManager from "../Sky/sky-manager";
import { Extensions } from "../Util/extensions";
import { Scene } from "../Scene/scene";
import Player from "../Player/player";
import ZoneObjects from "./object-pool";
export default class ZoneManager extends Node3D {
  private currentZone: Node3D | null = null;
  private camera: Camera3D | null = null;
  // Light manager
  private lightManager: LightManager | null = null;
  private skyManager: SkyManager | null = null;
  private zoneObjects: ZoneObjects | null = null;

  private player: Player | null = null;

  @export_(Variant.Type.TYPE_STRING)
  public zoneName = "qeynos2";

  _ready(): void {
    Extensions.SetRoot(this);
    this.camera = this.get_node("Camera3D") as Camera3D;
    this.camera.cull_mask = 0xfffff;

    this.loadZone(this.zoneName);
  }

  private dispose() {
    if (this.currentZone) {
      this.remove_child(this.currentZone);
      this.currentZone.queue_free();
      this.currentZone = null;
      if (this.lightManager) {
        this.lightManager.dispose();
        this.lightManager = null;
      }

      if (this.skyManager) {
        this.skyManager.dispose();
        this.skyManager = null;
      }

      if (this.zoneObjects) {
        this.zoneObjects.dispose();
        this.zoneObjects = null;
      }
      Extensions.Dispose();
    }
  }

  public async loadZone(zoneName: string): Promise<void> {
    this.dispose();
    this.zoneName = zoneName;
    const zone = new Node3D();
    this.add_child(zone);
    this.currentZone = zone;
    this.instantiateZone();
    Scene.RootNode = zone;
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
      rootNode.set_physics_process(true);
    }

    const metadataByte = await FileSystem.getFileBytes(
      `eqrequiem/zones/${this.zoneName}.json`
    );
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str);
        console.log("Got metadata", Object.keys(metadata));
        console.log("Version: ", metadata.version);
     
        this.zoneObjects = new ZoneObjects(this.currentZone, metadata.objects);
        this.lightManager = new LightManager(
          this.currentZone,
          this.camera!,
          metadata.lights
        );
        this.skyManager = new SkyManager(
          this.currentZone,
          "sky1",
          this.camera!
        );
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    this.set_process(true);
    this.set_physics_process(true);

    this.instantiatePlayer('bam');
  }

  public async instantiatePlayer(model: string) {
    if (!this.currentZone) {
      return;
    }
    if (this.player) {
      this.player.dispose();
    }
    this.player = new Player('models', model, this.camera!);
    const rootNode = await this.player.instantiate();
    if (rootNode) {
      this.player.Load('');
      this.currentZone.add_child(rootNode);
    }
  }

  input(buttonIndex: number) {
  if (this.player) {
      this.player.input(buttonIndex);
    }
  }

  input_mouse_motion(x: number, y: number) {
    if (this.player) {
      this.player.input_mouse_motion(x, y);
    }
  }

  input_pan(delta: number) {
    if (this.player) {
        this.player.input_pan(delta);
      }
    }
  
  _process(delta: number): void {
    if (this.lightManager) {
      this.lightManager.tick(delta);
    }

    if (this.player) {
      this.player.tick(delta);
    }
  }
}
