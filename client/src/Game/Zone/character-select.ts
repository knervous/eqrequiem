import type * as BJS from '@babylonjs/core';
import BABYLON from '@bjs';
import { supportedZones } from '@game/Constants/supportedZones';
import {
  CharacterSelectEntry,
  PlayerProfile,
} from '@game/Net/internal/api/capnp/player';
import Player from '@game/Player/player';
import { CLASS_DATA_ENUM, CLASS_DATA_NAMES } from '../Constants/class-data';
import type GameManager from '../Manager/game-manager';
import { ZoneManager } from './zone-manager';

export default class CharacterSelect {
  private cameraDistance: number = 25;
  private cameraHeight: number = 3;
  private lookatOffset = new BABYLON.Vector3(0, 1, 0);
  private cameraPosition = new BABYLON.Vector3(0, 0, 0);
  private cameraPitch: number = 0;
  private orbitAngle: number = 0; // Current angle of orbit
  private rotationSpeed: number = 1; // Radians per second; adjust as needed
  private gameManager: GameManager;
  private zoneManager: ZoneManager | null = null;
  private readonly locations = {
    [CLASS_DATA_ENUM.Warrior]     : { x: -600, y: -184, z: 1475 },
    [CLASS_DATA_ENUM.Cleric]      : { x: -603.5, y: -92.5, z: -328 },
    [CLASS_DATA_ENUM.Paladin]     : { x: 847, y: -184.5, z: -250 },
    [CLASS_DATA_ENUM.Ranger]      : { x: 45, y: -5.5, z: 1415 },
    [CLASS_DATA_ENUM.Shadowknight]: { x: 0, y: 129.5, z: 680 },
    [CLASS_DATA_ENUM.Druid]       : { x: -60, y: 507.5, z: -950 },
    [CLASS_DATA_ENUM.Monk]        : { x: 0, y: 382, z: -1120 },
    [CLASS_DATA_ENUM.Bard]        : { x: -60, y: -876, z: -230 },
    [CLASS_DATA_ENUM.Rogue]       : { x: 790, y: -27, z: 640 },
    [CLASS_DATA_ENUM.Shaman]      : { x: -2, y: -985, z: 490 },
    [CLASS_DATA_ENUM.Necromancer] : { x: 850, y: -336, z: -1275 },
    [CLASS_DATA_ENUM.Wizard]      : { x: -600, y: -31.5, z: 680 },
    [CLASS_DATA_ENUM.Mage]        : { x: 840, y: -209.5, z: -1274 },
    [CLASS_DATA_ENUM.Enchanter]   : { x: 885, y: 156.5, z: 685 },
    [CLASS_DATA_ENUM.Beastlord]   : { x: 0, y: -728, z: -260 },
  };
  public character: Player | null = null;
  private camera: BJS.Camera | null = null;
  private orbitIntervalId: NodeJS.Timeout | undefined;
  private worldTickInterval: NodeJS.Timeout | undefined;
  public faceCam = false;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
    this.camera = gameManager.Camera!;
    this.initialize();
  }

  private async initialize() {
    this.zoneManager = new ZoneManager(this.gameManager);
    this.zoneManager?.loadZone('load2', false, true);
    this.worldTickInterval = setInterval(() => {
      this.zoneManager?.SkyManager?.worldTick?.();
    }, 500);
  }

  public dispose() {
    console.log('[CharacterSelect] Disposing character select');
    if (this.character) {
      this.character?.dispose();
    }
    if (this.zoneManager) {
      this.zoneManager.dispose(true);
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
  private updateCameraPosition(playerPos: BJS.Vector3) {
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
      this.camera.lockedTarget = playerPos.add(this.lookatOffset);

      // this.camera.look_at(playerPos.add(this.lookatOffset), BABYLON.Vector3.Up);
    }
  }

  // Starts a setInterval loop that updates the orbit angle and camera position.
  public startOrbiting(position: BJS.Vector3) {
    const interval = 16; // Interval in milliseconds (roughly 60 FPS)
    clearInterval(this.orbitIntervalId); // Clear any existing interval
    this.orbitIntervalId = setInterval(() => {
      const delta = interval / 3000; // Convert milliseconds to seconds
      this.orbitAngle += this.rotationSpeed * delta;
      try {
        if (this.faceCam) {
          this.cameraPosition = position.add(
            new BABYLON.Vector3(-7, 5, 0),
          ); // Move to the right of the head
          if (this.camera !== null) {
            this.camera.position = this.cameraPosition;
          }
        } else {
          this.updateCameraPosition(position);
        }
      } catch (e) {
        this.dispose();
        console.error('Error in orbiting:', e);
      }
    }, interval);
  }

  public async loadModel(player: CharacterSelectEntry, fromCharCreate = false, onLoaded: () => void = () => {}) {
    if (this.character) {
      await this.character?.dispose();
      this.character = null;
    }

    this.character = new Player(
      this.gameManager,
      this.gameManager.Camera!,
      false,
    );
    const location =
      this.locations[player?.charClass ?? CLASS_DATA_ENUM.Shaman];

    this.character?.Load({
      ...player,
      name          : player.name,
      level         : player.level,
      charClass     : player.charClass,
      race          : player.race,
      inventoryItems: player.items,
      zoneId        : player.zone,
      face          : player.face,
      scale         : 1.0,
      ...location,
      y             : location.y + 5.5, // Adjust Y position slightly to avoid clipping
    } as unknown as PlayerProfile, true).then(async () => {
      onLoaded();
      if (!this.character || !this.character.playerEntity) {
        console.error('Character not loaded properly');
        return;
      }

      this.updateCameraPosition(this.character.playerEntity.spawnPosition);
      this.startOrbiting(this.character.playerEntity.spawnPosition);
      this.character.playIdle();
      if (!fromCharCreate) {
        this.character.UpdateNameplate([
          `${player?.name || 'Soandso'} [Level ${player?.level} ${CLASS_DATA_NAMES[player?.charClass] || ''}]`,
          supportedZones[player?.zone]?.longName ?? 'Unknown Zone',
        ].filter(Boolean));
      }
    }).catch((err) => {
      console.error('Error loading character model:', err);

    });

    clearInterval(this.orbitIntervalId);
  }
}
