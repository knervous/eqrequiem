import {
  Area3D,
  BoxShape3D,
  Callable,
  CollisionShape3D,
  Node3D,
  Vector3,
  deg_to_rad,
  Camera3D,
  MouseButton,
  DisplayServer,
  InputEvent,
  InputEventMouseMotion,
  Input,
  InputEventMouseButton,
  InputEventPanGesture,
  Node,
} from "godot";
import { BaseGltfModel } from "../GLTF/base";
import { FileSystem } from "../FileSystem/filesystem";
import LightManager from "../Lights/light-manager";
import SkyManager from "../Sky/sky-manager";
import { Scene } from "../Scene/scene";
import Player from "../Player/player";
import ZoneObjects from "../Zone/object-pool";
import Actor from "../Actor/actor";
import CharacterSelect from "../Zone/character-select";
import * as EQMessage from "../Net/message/EQMessage";
import { supportedZones } from "../Constants/supportedZones";
import MusicManager from "@game/Music/music-manager";

declare const window: Window;

export default class GameManager extends Node3D {
  get CurrentZone(): Node3D | null {
    return this.currentZone;
  }
  private currentZone: Node3D | null = null;
  private areaContainer: Node3D | null = null;
  get LightManager(): LightManager | null {
    return this.lightManager;
  }
  private lightManager: LightManager | null = null;

  get SkyManager(): SkyManager | null {
    return this.skyManager;
  }
  private skyManager: SkyManager | null = null;

  get MusicManager(): MusicManager | null {
    return this.musicManager;
  }
  private musicManager: MusicManager | null = null;

  private worldTickInterval: number = -1;
  private zoneObjects: ZoneObjects | null = null;
  private lastPlayer: EQMessage.PlayerProfile | null = null;
  private player: Player | null = null;
  private metadata: any = {};

  // Add a map to store region areas
  private regionAreas: Map<number, Area3D> = new Map();
  // Add a property to track active regions
  private activeRegions: Set<number> = new Set();

  get CharacterSelect(): CharacterSelect | null {
    return this.characterSelect;
  }
  private characterSelect: CharacterSelect | null = null;

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
    this.areaContainer = new Node3D();
    this.areaContainer.set_name("AreaContainer");
    this.set_name("GameManager");
    this.add_child(this.areaContainer);
    GameManager.instance = this;

    // Add a map to store region areas
    this.regionAreas = new Map();
    // Add a property to track active regions
    this.activeRegions = new Set();
    //this.loadZone(this.zoneName);
  }

  private setLoading(value: boolean) {
    this.get_tree().paused = value;
    if (window.setSplash) {
      window.setSplash(value);
    }
  }

  public dispose() {
    clearInterval(this.worldTickInterval);
    if (this.currentZone) {
      this.remove_child(this.currentZone);
      this.currentZone.queue_free();
      this.currentZone = null;
      if (this.lightManager) {
        this.lightManager.dispose();
        this.lightManager = null;
      }
      if (this.musicManager) {
        this.musicManager.dispose();
        this.musicManager = null;
      }

      if (this.skyManager) {
        this.skyManager?.dispose?.();
        this.skyManager = null;
      }

      if (this.zoneObjects) {
        this.zoneObjects.dispose();
        this.zoneObjects = null;
      }
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
    this.zoneName = zoneName;
    const zone = new Node3D();
    zone.set_name(zoneName);
    this.add_child(zone);
    this.currentZone = zone;
    this.instantiateZone();
    Scene.RootNode = zone;
  }

  private async instantiateZone() {
    if (!this.currentZone) {
      return;
    }
    this.setLoading(true);
    const zoneModel = new BaseGltfModel("zones", this.zoneName);
    zoneModel.LoaderOptions.doCull = false;
    const rootNode = await zoneModel.instantiate();
    if (rootNode) {
      this.currentZone.add_child(rootNode);
      rootNode.set_physics_process(true);
    }
    console.log('Zone name', this.zoneName);
    const metadataByte = await FileSystem.getFileBytes(
      `eqrequiem/zones`, `${this.zoneName}.json`,
    );
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str);
        console.log("Got metadata", metadata);
        this.metadata = metadata;
        console.log("Version: ", metadata.version);
        this.instantiateRegions(metadata.regions);
        this.zoneObjects = new ZoneObjects(this.currentZone, metadata.objects);
        this.zoneObjects.Load().catch((e) => {
          console.log("Failed to load zone objects", e);
        });
        this.lightManager = new LightManager(
          this.currentZone,
          this.camera!,
          metadata.lights,
        );

        // this.musicManager = new MusicManager(
        //   this,
        //   metadata.sounds,
        // );

        this.skyManager = new SkyManager(
          this.currentZone,
          "sky1",
          this.camera!,
        );

        this.worldTickInterval = setInterval(() => {
          this.skyManager?.worldTick();
        }, 100) as unknown as number;
      } catch (e) {
        console.log("Error parsing zone metadata", e);
      }
    }
    //await this.instantiatePlayer("bam");
    this.setLoading(false);
  }

  public async spawnModel(model: string) {
    if (!this.currentZone) {
      return;
    }
    const objectModel = new Actor("models", model);
    const instance = await objectModel.instantiate();
    if (instance && this.player?.getNode() !== undefined) {
      this.currentZone.add_child(instance);
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
    if (!this.currentZone) {
      return;
    }
    if (this.player) {
      this.player.dispose();
    }

    this.player = new Player(player, this.camera!);
    const rootNode = await this.player.instantiate();
    if (rootNode) {
      this.player.Load("");
      this.currentZone.add_child(rootNode);
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

  private instantiateRegions(regions: any[]) {
    if (!this.currentZone) return;

    regions.forEach((region, index) => {
      // Skip invalid regions
      if (
        region.minVertex[0] === 0 &&
        region.minVertex[1] === 0 &&
        region.minVertex[2] === 0 &&
        region.maxVertex[0] === 0 &&
        region.maxVertex[1] === 0 &&
        region.maxVertex[2] === 0
      ) {
        return;
      }

      // Calculate size and position
      const size = new Vector3(
        region.maxVertex[0] - region.minVertex[0],
        region.maxVertex[1] - region.minVertex[1],
        region.maxVertex[2] - region.minVertex[2],
      );

      const position = new Vector3(
        region.minVertex[0] + size.x / 2,
        region.minVertex[1] + size.y / 2,
        region.minVertex[2] + size.z / 2,
      );
      position.x *= -1;

      // Create Area3D for collision detection
      const area = new Area3D();
      const collisionShape = new CollisionShape3D();
      const boxShape = new BoxShape3D();
      boxShape.size = size;

      collisionShape.shape = boxShape;
      area.add_child(collisionShape);
      area.position = position;

      this.areaContainer?.add_child(area);

      this.regionAreas.set(index, area);

      // Connect signals for intersection detection
      area.body_entered.connect(
        Callable.create(this, (body) => this.onAreaEntered(index, body)),
      );
      area.body_exited.connect(
        Callable.create(this, (body) => this.onAreaExited(index, body)),
      );

      // area.body_entered.connect((body: Node) => this.onAreaEntered(index, body));
      // area.body_exited.connect((body: Node) => this.onAreaExited(index, body));
    });
  }

  private onAreaEntered(regionIndex: number, body: Node) {
    if (body === this.player?.getNode()) {
      this.activeRegions.add(regionIndex);
      const area = this.regionAreas.get(regionIndex);
      if (area) {
        const regionType = this.metadata.regions[regionIndex]?.regionType;
        console.log(`Entered region ${regionIndex} of type ${regionType}`);

        // Handle different region types
        switch (regionType) {
          case 1: // Example: Water
            console.log("Player entered water zone");
            break;
          case 4: // Example: Zone line
            const zone = this.metadata.regions[regionIndex]?.zoneLineInfo;
            console.log("Zone", zone);
            const newZone = {
              x: -1,
              y: -1,
              z: -1,
              zoneIndex: -1,
            };
            switch (+zone.type) {
              // Reference
              case 0:
                const refZone = supportedZones[zone.index.toString()];
                newZone.x = refZone.target_y;
                newZone.y = refZone.target_x;
                newZone.z = refZone.target_z;
                newZone.zoneIndex = refZone.target_zone_id;
                break;
              // Absolute
              default:
                newZone.x = zone.x;
                newZone.y = zone.y;
                newZone.z = zone.z;
                newZone.zoneIndex = zone.zoneIndex;
                break;
            }
            if (newZone.zoneIndex > -1) {
              const magicNumber = 999999;
              if (newZone.x === magicNumber) {
                newZone.x = this.player.getNode()?.position.x ?? 0;
              }
              if (newZone.y === magicNumber) {
                newZone.y = this.player.getNode()?.position.y ?? 0;
              }
              if (newZone.z === magicNumber) {
                newZone.z = this.player.getNode()?.position.z ?? 0;
              }
              // Teleport within zone
              // const newLoc = eqtoBabylonVector(newZone.y, newZone.x, newZone.z);
              // // newLoc.x *= -1;
              // if (newLoc.x === magicNumber) {
              //   newLoc.x = this.CameraController.camera.globalPosition.x;
              // }
              // if (newLoc.y === magicNumber) {
              //   newLoc.y = this.CameraController.camera.globalPosition.y;
              // }
              // if (newLoc.z === magicNumber) {
              //   newLoc.z = this.CameraController.camera.globalPosition.z;
              // }

              // if (newZone.zoneIndex === this.state.zoneInfo.zone) {

              // } else { // Zone to another zone
              const z = supportedZones[newZone.zoneIndex];
              // this.actions.setZoneInfo({ ...z, zone: newZone.zoneIndex });
              //this.zone(z.shortName, newLoc);

              this.loadZone(z.shortName).then(() => {
                this.instantiatePlayer(undefined, {
                  x: -newZone.x,
                  y: newZone.z,
                  z: newZone.y,
                });
              });
              return;
              // }
            }
            break;
          // Add more cases as needed
        }
      }
    }
  }

  private onAreaExited(regionIndex: number, body: Node) {
    if (body === this.player?.getNode()) {
      this.activeRegions.delete(regionIndex);
      const area = this.regionAreas.get(regionIndex);
      if (area) {
        const regionType = this.metadata.regions[regionIndex]?.regionType;
        console.log(`Exited region ${regionIndex} of type ${regionType}`);
      }
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

  _process(delta: number): void {
    if (this.lightManager) {
      this.lightManager.tick(delta);
    }

    if (this.skyManager) {
      this.skyManager.tick(delta);
    }

    if (this.player) {
      this.player.tick(delta);
    }
  }
}
