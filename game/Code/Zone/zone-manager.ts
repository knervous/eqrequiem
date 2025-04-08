import { export_ } from "godot.annotations";
import { Area3D, BaseMaterial3D, BoxMesh, BoxShape3D, Callable, Camera3D, CollisionShape3D, Color, MeshInstance3D, Node, Node3D, OS, StandardMaterial3D, Variant, Vector3, deg_to_rad } from "godot";
import { BaseGltfModel } from "../GLTF/base";
import { FileSystem } from "../FileSystem/filesystem";
import LightManager from "../Lights/light-manager";
import SkyManager from "../Sky/sky-manager";
import { Extensions } from "../Util/extensions";
import { Scene } from "../Scene/scene";
import Player from "../Player/player";
import ZoneObjects from "./object-pool";
import Actor from "../Actor/actor";
import CharacterSelect from "./character-select";
import * as EQMessage from '../Net/message/EQMessage';
import RACE_DATA from "../Constants/race-data";
import { supportedZones } from "../Constants/supportedZones";

declare const window: Window;

export default class ZoneManager extends Node3D {
  get CurrentZone(): Node3D | null {
    return this.currentZone;
  }
  private currentZone: Node3D | null = null;
  // Light manager
  private lightManager: LightManager | null = null;
  private skyManager: SkyManager | null = null;
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

  @export_(Variant.Type.TYPE_STRING)
  public zoneName = "qeynos2";

  private camera: Camera3D | null = null;
  get Camera(): Camera3D | null {
    return this.camera;
  }

  _ready(): void {
    Extensions.SetRoot(this);
    this.camera = this.get_node("Camera3D") as Camera3D;
    this.camera.cull_mask = 0xfffff;

    // this.loadZone(this.zoneName);
  }

  private setLoading(value: boolean) {
    this.get_tree().paused = value;
    if (window.setSplash) {
      window.setSplash(value);
    }
  }
  
  public dispose() {
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
    if (this.characterSelect) {
      this.characterSelect.dispose();
      this.characterSelect = null;
    }
  }

  public async loadCharacterSelect() {
    await this.loadZone("load2", true);
    this.player = null;
    this.characterSelect = new CharacterSelect(this);
  }

  public async loadZone(zoneName: string, loadSky: boolean = true): Promise<void> {
    this.dispose();
    this.zoneName = zoneName;
    const zone = new Node3D();
    this.add_child(zone);
    this.currentZone = zone;
    this.instantiateZone(loadSky);
    Scene.RootNode = zone;
  }

  private async instantiateZone(loadSky: boolean) {
    if (!this.currentZone) {
      return;
    }
    this.setLoading(true);
    const zoneModel = new BaseGltfModel("zones", this.zoneName);
    const rootNode = await zoneModel.instantiate();
    if (rootNode) {
      this.currentZone.add_child(rootNode);
      rootNode.set_physics_process(true);
    }

    const metadataByte = await FileSystem.getFileBytes(
      `eqrequiem/zones/${this.zoneName}.json`,
    );
    if (metadataByte) {
      try {
        const str = new TextDecoder("utf-8").decode(metadataByte);
        const metadata = JSON.parse(str);
        console.log("Got metadata", Object.keys(metadata));
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
        if (loadSky) {
          this.skyManager = new SkyManager(
            this.currentZone,
            "sky1",
            this.camera!,
          );
        }
        
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

  public async instantiatePlayer(player: EQMessage.PlayerProfile = this.lastPlayer, position: {x: number, y: number, z: number} = { x: 0, y: 0, z: 0 }) {
    this.lastPlayer = player;
    if (!this.currentZone) {
      return;
    }
    if (this.player) {
      this.player.dispose();
    }
    const race = player?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[player?.gender ?? 0] || raceDataEntry[2];
    this.player = new Player("models", model, this.camera!);
    const rootNode = await this.player.instantiate();
    if (rootNode) {
      this.player.Load("");
      this.currentZone.add_child(rootNode);
      setTimeout(() => {
        rootNode.position = new Vector3(position.x, 5, position.z);
        this.player?.updateCameraPosition(this.player.getNode());
      }, 0);
    
      console.log('Setting position', position);
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
      if (region.minVertex[0] === 0 && 
          region.minVertex[1] === 0 && 
          region.minVertex[2] === 0 &&
          region.maxVertex[0] === 0 && 
          region.maxVertex[1] === 0 && 
          region.maxVertex[2] === 0) {
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

      // Create visible box
      const boxMesh = new BoxMesh();
      boxMesh.size = size;
      
      const meshInstance = new MeshInstance3D();
      meshInstance.mesh = boxMesh;
      position.x *= -1;
      meshInstance.position = position;
      
      // Create Area3D for collision detection
      const area = new Area3D();
      const collisionShape = new CollisionShape3D();
      const boxShape = new BoxShape3D();
      boxShape.size = size;
      
      collisionShape.shape = boxShape;
      area.add_child(collisionShape);
      area.position = position;
      
      // Add region type as metadata
      // area.set_meta("regionType", region.regionType);
      // if (region.zoneLineInfo) {
      //   area.set_meta("zoneLineInfo", region.zoneLineInfo);
      // }

      // Make it semi-transparent for visibility
      const material = new StandardMaterial3D();
      material.albedo_color = new Color(1, 0, 0, 0.3); // Red with 30% opacity
      material.transparency = BaseMaterial3D.Transparency.TRANSPARENCY_ALPHA;
      meshInstance.set_surface_override_material(0, material);

      this.currentZone.add_child(meshInstance);
      this.currentZone.add_child(area);
      this.regionAreas.set(index, area);

      // Connect signals for intersection detection
      area.body_entered.connect(Callable.create(this, (body) => this.onAreaEntered(index, body)));
      area.body_exited.connect(Callable.create(this, (body) => this.onAreaExited(index, body)));

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
            const zone=  this.metadata.regions[regionIndex]?.zoneLineInfo;
            console.log('Zone', zone);
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
                this.instantiatePlayer(undefined, { x: -newZone.x, y: newZone.z, z: newZone.y });
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
