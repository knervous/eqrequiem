import { Camera3D, Node3D, Vector3 } from "godot";
import type ZoneManager from "./zone-manager";
import Actor from "../Actor/actor";
import * as EQMessage from "../Net/message/EQMessage";
import { Extensions } from "../Util/extensions";
import { RACE_DATA } from "../Constants/race-data";
import { CLASS_DATA_NAMES } from "../Constants/class-data";
import { zoneData } from "../Constants/zone-data";

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
  private zoneManager: ZoneManager;
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
  private character: Actor | null = null;
  private camera: Camera3D | null = null;
  private orbitIntervalId: number | undefined;

  constructor(zoneManager: ZoneManager) {
    this.zoneManager = zoneManager;
    this.camera = zoneManager.Camera;
  }

  public dispose() {
    this.character?.dispose();
    if (this.orbitIntervalId !== undefined) {
      clearInterval(this.orbitIntervalId);
    }
  }

  // This function updates the camera position based on the current orbit angle.
  private updateCameraPosition(node: Node3D) {
    const playerPos = Extensions.GetPosition(node);
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
        this.updateCameraPosition(node);

      } catch (e) {
        console.error("Error in orbiting:", e);
      }
    }, interval);
  }

  public async loadModel(player: EQMessage.CharacterSelectEntry | null) {
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
    window.cc = this.character;
    if (rootNode) {
      this.character.Load("");
      this.zoneManager.add_child(rootNode);
      const location = this.locations[player?.charClass ?? CLASS_DATA_ENUM.Shaman];
      rootNode.global_position = new Vector3(location.x, location.y + 3, location.z);
      console.log('PLAYER', player);
      this.character.setNameplate(player.name ? `${player.name} - Level ${player.level} ${CLASS_DATA_NAMES[player.charClass]}\n ${zoneData.find((z) => z.zone === player?.zone)?.longName ?? 'Unknown Zone'}` : 'Soandso');
      // Set initial camera position.
      this.updateCameraPosition(rootNode);
      // Start orbiting the camera around the player.
      this.startOrbiting(rootNode);
    }
  }
}
