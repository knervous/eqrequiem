import {
  Node3D,
  Vector3,
  deg_to_rad,
  Camera3D,
  Input,
} from "godot";

import Player from "../Player/player";
import Actor from "../Actor/actor";
import CharacterSelect from "../Zone/character-select";
import * as EQMessage from "../Net/message/EQMessage";
import { supportedZones } from "../Constants/supportedZones";
import MusicManager from "@game/Music/music-manager";
import { ZoneManager } from "@game/Zone/zone-manager";
import { DisplayServer } from "godot";
import { InputEventMouseButton } from "godot";
import { MouseButton } from "godot";
import { InputEventMouseMotion } from "godot";
import { InputEventPanGesture } from "godot";

declare const window: Window;

export default class GameManager extends Node3D {
  get MusicManager(): MusicManager | null {
    return this.musicManager;
  }
  private musicManager: MusicManager | null = null;

  private worldTickInterval: number = -1;
  private lastPlayer: EQMessage.PlayerProfile | null = null;
  private player: Player | null = null;

  get CharacterSelect(): CharacterSelect | null {
    return this.characterSelect;
  }
  private characterSelect: CharacterSelect | null = null;

  get ZoneManager(): ZoneManager | null {
    return this.zoneManager;
  }
  private zoneManager: ZoneManager | null = null;

  public zoneName = "qeynos2";

  private camera: Camera3D | null = null;
  get Camera(): Camera3D | null {
    return this.camera;
  }

  public static instance: GameManager;

  _ready(): void {
    this.camera = new Camera3D();
    this.get_tree().root.add_child(this.camera);
    this.camera.cull_mask = 0xfffff;
    this.set_name("GameManager");
    this.zoneManager = new ZoneManager(this);
    GameManager.instance = this;
  }

  public setLoading(value: boolean) {
    this.get_tree().paused = value;
    if (window.setSplash) {
      window.setSplash(value);
    }
  }

  public dispose() {
    clearInterval(this.worldTickInterval);
    if (this.zoneManager) {
      this.zoneManager.dispose();
    }
    if (this.musicManager) {
      this.musicManager.dispose();
    }
    if (this.player) {
      this.player.dispose();
    }
    if (this.characterSelect) {
      this.characterSelect.dispose();
      this.characterSelect = null;
    }
  }

  public async loadCharacterSelect() {
    await this.loadZone("load2");
    this.player = null;
    this.characterSelect = new CharacterSelect(this);
  }

  public async loadZoneId(zoneId: number): Promise<void> {
    const zoneName = supportedZones[zoneId?.toString()]?.shortName;
    console.log('Loading zone: ', zoneId, zoneName);
    if (zoneName) {
      await this.loadZone(zoneName);
    } else {
      console.error(`Zone ID ${zoneId} not found in supported zones.`);
    }
  }

  public async loadZone(zoneName: string): Promise<void> {
    this.dispose();
    this.zoneManager?.loadZone(zoneName);
  }

  public async spawnModel(model: string) {
    const objectModel = new Actor("models", model);
    const instance = await objectModel.instantiate();
    if (instance && this.player?.getNode() !== undefined) {
      this.zoneManager?.ZoneContainer!.add_child(instance);
      instance.position = this.player?.getPlayerPosition()!;
      instance.scale = new Vector3(1, 1, 1);
      instance.rotate_x(deg_to_rad(0));
      instance.rotate_y(-deg_to_rad(0));
      instance.rotate_z(deg_to_rad(0));
    }
  }

  public async instantiatePlayer(
    player: EQMessage.PlayerProfile = this.lastPlayer,
    position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
  ) {
    this.lastPlayer = player;
    if (this.player) {
      this.player.dispose();
    }

    this.player = new Player(player, this.camera!);
    const rootNode = await this.player.instantiate();
    if (rootNode) {
      this.player.Load("");
      this.add_child(rootNode);
      setTimeout(() => {
        rootNode.position = new Vector3(position.x, 5, position.z);
        this.player?.updateCameraPosition(this.player.getNode());
      }, 0);

      console.log("Setting position", position);
      this.player.swapFace(player.face);
      rootNode.scale = new Vector3(1.5, 1.5, 1.5);
      rootNode.rotate_x(deg_to_rad(0));
      rootNode.rotate_y(-deg_to_rad(0));
      rootNode.rotate_z(deg_to_rad(0));
    }
  }

  _input(event: InputEvent) {
    if (!this.player) {
      return;
    }
    switch (true) {
      case event instanceof InputEventMouseButton: {
        this.player.input(event.button_index);
        if (event.button_index === MouseButton.MOUSE_BUTTON_RIGHT) {
          DisplayServer.mouse_set_mode(
            event.pressed
              ? Input.MouseMode.MOUSE_MODE_CAPTURED
              : Input.MouseMode.MOUSE_MODE_VISIBLE,
          );
        }
        break;
      }
      case event instanceof InputEventMouseMotion: {
        this.player.input_mouse_motion(event.relative.x, event.relative.y);
        break;
      }
      case event instanceof InputEventPanGesture: {
        this.player.input_pan(event.delta.y);
        break;
      }
      default:
        break;
    }
  }


  _physics_process(delta: number): void {
    if (this.player) {
      this.player.tick(delta);
    }
  }

  _process(delta: number): void {
    this.zoneManager?.tick(delta);
  }
}
