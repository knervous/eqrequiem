import { Camera3D, Color, Node3D, OmniLight3D, Vector3 } from "godot";
import type GameManager from "../Manager/game-manager";
import Actor from "../Actor/actor";
import { RACE_DATA } from "../Constants/race-data";
import { CLASS_DATA_NAMES } from "../Constants/class-data";
import { zoneData } from "../Constants/zone-data";
import { ZoneManager } from "./zone-manager";
import { CharacterSelectEntry } from "@game/Net/internal/api/capnp/player";

const CLASS_DATA_ENUM = {
  "Warrior": 1,
  "Cleric": 2,
  "Paladin": 3,
  "Ranger": 4,
  "Shadowknight": 5,
  "Druid": 6,
  "Monk": 7,
  "Bard": 8,
  "Rogue": 9,
  "Shaman": 10,
  "Necromancer": 11,
  "Wizard": 12,
  "Mage": 13,
  "Enchanter": 14,
  "Beastlord": 15,
  "Berserker": 16,
};

export default class CharacterSelect {
  private cameraDistance: number = 8;
  private cameraHeight: number = 3;
  private lookatOffset = new Vector3(0, 1, 0);
  private cameraPosition = new Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  private orbitAngle: number = 0; // Current angle of orbit
  private rotationSpeed: number = 1; // Radians per second; adjust as needed
  private gameManager: GameManager;
  private zoneManager: ZoneManager | null = null;
  private locations = {
    [CLASS_DATA_ENUM.Warrior]: { x: -600, y: -184, z: 1475 },
    [CLASS_DATA_ENUM.Cleric]: { x: -603.5, y: -92.5, z: -328 },
    [CLASS_DATA_ENUM.Paladin]: { x: 847, y: -184.5, z: -250 },
    [CLASS_DATA_ENUM.Ranger]: { x: 45, y: -5.5, z: 1415 },
    [CLASS_DATA_ENUM.Shadowknight]: { x: 0, y: 129.5, z: 680 },
    [CLASS_DATA_ENUM.Druid]: { x: -60, y: 507.5, z: -950 },
    [CLASS_DATA_ENUM.Monk]: { x: 0, y: 382, z: -1120 },
    [CLASS_DATA_ENUM.Bard]: { x: -60, y: -876, z: -230 },
    [CLASS_DATA_ENUM.Rogue]: { x: 790, y: -27, z: 640 },
    [CLASS_DATA_ENUM.Shaman]: { x: -2, y: -985, z: 490 },
    [CLASS_DATA_ENUM.Necromancer]: { x: 850, y: -336, z: -1275 },
    [CLASS_DATA_ENUM.Wizard]: { x: -600, y: -31.5, z: 680 },
    [CLASS_DATA_ENUM.Mage]: { x: 840, y: -209.5, z: -1274 },
    [CLASS_DATA_ENUM.Enchanter]: { x: 885, y: 156.5, z: 685 },
    [CLASS_DATA_ENUM.Beastlord]: { x: 0, y: -728, z: -260 },
  };
  public character: Actor | null = null;
  private camera: Camera3D | null = null;
  private orbitIntervalId: number | undefined;
  private worldTickInterval: number | undefined;
  public faceCam = false;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
    this.camera = gameManager.Camera;
    this.initialize();
  }

  private async initialize() {
    this.zoneManager = new ZoneManager(this.gameManager);
    this.zoneManager?.loadZone('load2', false);
    this.worldTickInterval = setInterval(() => { 
      this.zoneManager?.SkyManager?.worldTick?.();
    }, 500);
  }

  public dispose() {
    if (this.character) {
      this.character?.dispose();

    }
    if (this.zoneManager) {
      this.zoneManager.dispose();
      this.zoneManager = null;
    }
    if (this.orbitIntervalId !== undefined) {
      clearInterval(this.orbitIntervalId);
    }
    if (this.worldTickInterval !== undefined) {
      clearInterval(this.worldTickInterval);
    }
  }

  // This function updates the camera position based on the current orbit angle.
  private updateCameraPosition(node: Node3D) {
    const playerPos = node.global_position;
    const horizontalDistance = this.cameraDistance * Math.cos(this.cameraPitch);
    const verticalDistance = this.cameraDistance * Math.sin(this.cameraPitch);
    const offsetX = Math.sin(this.orbitAngle) * horizontalDistance;
    const offsetZ = Math.cos(this.orbitAngle) * horizontalDistance;

    this.cameraPosition.set(
      playerPos.x + offsetX,
      playerPos.y + this.cameraHeight + verticalDistance,
      playerPos.z + offsetZ,
    );
    if (this.camera !== null) {
      this.camera.position = this.cameraPosition;
      this.camera.look_at(playerPos.add(this.lookatOffset), Vector3.UP);
    }
  }

  // Starts a setInterval loop that updates the orbit angle and camera position.
  public startOrbiting(node: Node3D) {
    const interval = 16; // Interval in milliseconds (roughly 60 FPS)
    clearInterval(this.orbitIntervalId); // Clear any existing interval
    this.orbitIntervalId = setInterval(() => {
      const delta = interval / 3000; // Convert milliseconds to seconds
      this.orbitAngle += this.rotationSpeed * delta;
      try {
        if (this.faceCam) {
          const secondaryNode = this.character?.getHead();
          if (secondaryNode) {
            node = secondaryNode; // Use head mesh for faceCam
          } else {
            console.warn("Head mesh not found, using primary node for faceCam");
          }
          // Position camera to the right of the head (90 degrees from forward)
          this.cameraPosition = node.global_position
            .add(new Vector3(-5, 3, 0)); // Move to the right of the head

          if (this.camera !== null) {
            this.camera.position = this.cameraPosition;
            // Look at the head's position with a slight offset for framing
            this.camera.look_at(node.global_position.add(this.lookatOffset), Vector3.UP);
          }
        } else {
          this.updateCameraPosition(node);

        }

      } catch (e) {
        this.dispose();
        console.error("Error in orbiting:", e);
      }
    }, interval);
  }


  public async loadModel(player: CharacterSelectEntry | null) {
    if (this.character) {
      this.character.dispose();
    }
    if (player?.charClass === 0 || player?.race === 0) {
      player.race = 1;
      player.charClass = 1;
    }
    console.log('Loading model', player);
    const race = player?.race ?? 1;
    const raceDataEntry = RACE_DATA[race];
    const model = raceDataEntry[player?.gender ?? 0] || raceDataEntry[2];
    clearInterval(this.orbitIntervalId);
    this.character = new Actor("models", model.toLowerCase());
    const rootNode = await this.character.instantiate();
    if (rootNode && player) {
      this.character.Load("");
      this.gameManager.add_child(rootNode);
      const location = this.locations[player?.charClass ?? CLASS_DATA_ENUM.Shaman];
      rootNode.global_position = new Vector3(location.x, location.y + 3, location.z);
      console.log('PLAYER', player);
      this.character.setNameplate(player.name ? `${player.name} - Level ${player.level} ${CLASS_DATA_NAMES[player.charClass]}\n ${zoneData.find((z) => z.zone === player?.zone)?.longName ?? 'Unknown Zone'}` : 'Soandso');
      
      this.character.swapFace(player?.face ?? 0);
      // Add OmniLight3D for character illumination, positioned 1 meter in front
      const light = new OmniLight3D();
      light.set_name("CharacterLight");
      light.omni_range = 10; // Range of the light
      light.light_energy = 1.5; // Intensity of the light
      light.light_color = new Color(1, 0.95, 0.9); // Warm, soft white
      light.shadow_enabled = true; // Enable soft shadows

      // Calculate position: 1 meter in front (negative Z basis) and 2 meters above
      const forwardDirection = rootNode.global_transform.basis.z.normalized().multiplyScalar(-1); // Forward is -Z
      const lightDistance = 3; // 1 meter in front
      const lightHeight = 2; // 2 meters above character
      light.position = new Vector3(
        forwardDirection.x * lightDistance,
        lightHeight,
        forwardDirection.z * lightDistance,
      );
      light.shadow_enabled = false;
      light.light_specular = 0;
      rootNode.add_child(light); // Attach light to character's root node
      // Set initial camera position.
      this.updateCameraPosition(rootNode);
      // Start orbiting the camera around the player.
      this.startOrbiting(rootNode);
    }
  }
}
