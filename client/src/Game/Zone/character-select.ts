import { supportedZones } from "@game/Constants/supportedZones";
import { CharacterSelectEntry, PlayerProfile } from "@game/Net/messages";
import EntityCache from "@game/Model/entity-cache";
import Player from "@game/Player/player";
import { CLASS_DATA_NAMES } from "../Constants/class-data";
import type GameManager from "../Manager/game-manager";
import { CharacterSelectEnvironment } from "./character-select-environment";

export default class CharacterSelect {
  private gameManager: GameManager;
  private environment: CharacterSelectEnvironment;
  public character: Player | null = null;
  private _faceCam = false;
  private loadGeneration = 0;
  private disposed = false;
  private initializePromise: Promise<void> | null = null;

  constructor(gameManager: GameManager) {
    this.gameManager = gameManager;
    this.environment = new CharacterSelectEnvironment(
      gameManager.scene!,
      gameManager.Camera!,
    );
    this.disposed = false;
  }

  get faceCam(): boolean {
    return this._faceCam;
  }

  set faceCam(value: boolean) {
    this._faceCam = value;
    this.environment.applyCameraPose(value);
  }

  initialize(): Promise<void> {
    // GameManager publishes CharacterSelect before the environment GLB has
    // finished loading. React selection effects may therefore request a model
    // during that interval. One controller-owned promise makes every caller
    // wait for the same semantic-anchor initialization.
    if (!this.initializePromise) {
      // Zone loading normally installs EntityCache's render/cull observers.
      // Character select can be the first 3D scene in a fresh client, so it
      // must activate that presentation renderer itself. Without this call a
      // Shado actor may have visibleFlag=1 while its compact visible count
      // remains zero, submitting no body instances even as weapon meshes draw.
      EntityCache.initialize(this.gameManager.scene!);
      this.initializePromise = this.environment.initialize();
    }
    return this.initializePromise;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loadGeneration++;
    console.log("[CharacterSelect] Disposing character select");
    if (this.character) {
      this.character?.dispose();
      this.character = null;
    }
    this.environment.dispose();
  }

  public async loadModel(
    player: CharacterSelectEntry,
    fromCharCreate = false,
    onLoaded: () => void = () => {},
  ) {
    const generation = ++this.loadGeneration;
    if (this.character) {
      this.character.dispose();
      this.character = null;
    }

    const character = new Player(
      this.gameManager,
      this.gameManager.Camera!,
      false,
    );
    this.character = character;

    try {
      await this.initialize();
      if (
        this.disposed ||
        generation !== this.loadGeneration ||
        this.character !== character
      ) {
        character.dispose();
        return;
      }
      const location = this.environment.characterPosition;
      await character.Load(
        {
          ...player,
          // Character-select loads can overlap while a previous model is still
          // decoding. Give each preview a render-only identity so two
          // in-flight previews never reserve the same Shado actor slot.
          spawnId: (0x80000000 | generation) >>> 0,
          name: player.name,
          level: player.level,
          charClass: player.charClass,
          race: player.race,
          inventoryItems: player.items,
          zoneId: player.zone,
          face: player.face,
          scale: 1.0,
          x: location.x,
          y: location.y,
          z: location.z,
          heading: this.environment.characterHeading,
        } as unknown as PlayerProfile,
        true,
      );
      if (
        this.disposed ||
        generation !== this.loadGeneration ||
        this.character !== character
      ) {
        character.dispose();
        return;
      }
      onLoaded();
      if (!character.playerEntity) {
        console.error("Character not loaded properly");
        return;
      }

      character.setGravity(this.environment.gravityEnabled);
      character.setCollision(this.environment.collisionEnabled);
      character.playerEntity.setVelocity(0, 0, 0);
      this.environment.applyCameraPose(this.faceCam);
      character.playIdle();
      if (!fromCharCreate) {
        const className =
          typeof player?.charClass === "number"
            ? CLASS_DATA_NAMES[player.charClass]
            : "";
        const zoneName =
          typeof player?.zone === "number"
            ? supportedZones[player.zone]?.longName
            : undefined;
        await character.UpdateNameplate(
          [
            `${player?.name || "Soandso"} [Level ${player?.level} ${className || ""}]`,
            zoneName ?? "Unknown Zone",
          ].filter(Boolean),
        );
      }
    } catch (err) {
      if (this.character === character) this.character = null;
      character.dispose();
      console.error("Error loading character model:", err);
    }
  }
}
