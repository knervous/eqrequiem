import type { CharacterTechniqueState } from "../progression/technique-progression.js";
import type {
  CharacterCombatProjection,
  CharacterProfileProjection,
  ZoneProjection,
} from "../persist/game-data-repository.js";
import type { GameDatabase } from "../persist/game-database.js";
import type { CharacterWriteScheduler } from "./character-application-service.js";
import { radiansToEqHeading } from "./heading.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";

export interface ZoneTransitionDestination {
  readonly useSafeLocation?: boolean | undefined;
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly z?: number | undefined;
  /** Client transition headings are radians; persisted headings use EQ units. */
  readonly heading?: number | undefined;
}

export interface ZoneJoinPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

export interface ZoneJoinBind extends ZoneJoinPosition {
  readonly zoneId: number;
  readonly instanceId: number;
}

export interface ZoneJoinProjection {
  readonly zone: ZoneProjection;
  readonly character: CharacterProfileProjection;
  readonly techniques: CharacterTechniqueState;
  readonly inventoryItems: readonly Record<string, unknown>[];
  readonly combat: CharacterCombatProjection;
  readonly bind: ZoneJoinBind;
  readonly position: ZoneJoinPosition;
  readonly npcs: ZoneNpcSpawnDefinition[];
}

/**
 * Builds the database-backed half of joining a zone once for live and embedded.
 * Worker hydration and packet/event encoding intentionally remain in their adapters.
 */
export class ZoneJoinService {
  constructor(
    private readonly database: GameDatabase,
    private readonly writes: CharacterWriteScheduler,
  ) {}

  async load(
    characterName: string,
    zoneId: number,
    instanceId: number,
    transition?: ZoneTransitionDestination,
  ): Promise<ZoneJoinProjection> {
    const zone = await this.database.data.zone(zoneId);
    if (!zone) throw new Error(`zone ${zoneId} does not exist`);

    const identity = await this.database.data.characterByName(characterName);
    if (!identity) throw new Error(`character ${characterName} does not exist`);
    const characterId = Number(identity.id);
    await this.writes.flush(characterId);
    const character = await this.database.data.characterById(characterId);
    if (!character) throw new Error(`character ${characterName} does not exist`);

    const [techniques, inventoryItems, storedCombat, storedBind, npcs] =
      await Promise.all([
        this.database.techniques.load(characterId, {
          level: Number(character.level),
          classId: Number(character.class_id),
        }),
        this.database.data.inventoryItems(characterId),
        this.database.data.characterCombat(characterId),
        this.database.data.characterBind(characterId),
        this.database.data.zoneNpcSpawns(zoneId, instanceId),
      ]);
    const combat = storedCombat ?? defaultCombat(character);
    const useSafeLocation = transition?.useSafeLocation === true;
    const hasExplicitDestination = [transition?.x, transition?.y, transition?.z]
      .every((value) => typeof value === "number" && Number.isFinite(value));
    const position = {
      x: useSafeLocation
        ? Number(zone.safe_x)
        : hasExplicitDestination
        ? Number(transition!.x)
        : Number(character.x ?? zone.safe_x),
      y: useSafeLocation
        ? Number(zone.safe_y)
        : hasExplicitDestination
        ? Number(transition!.y)
        : Number(character.y ?? zone.safe_y),
      z: useSafeLocation
        ? Number(zone.safe_z)
        : hasExplicitDestination
        ? Number(transition!.z)
        : Number(character.z ?? zone.safe_z),
      heading: useSafeLocation
        ? 0
        : transition?.heading === undefined
        ? Number(character.heading ?? 0)
        : radiansToEqHeading(transition.heading),
    };
    if (transition) {
      this.writes.coalesce(characterId, "position", {
        zoneId,
        instanceId,
        ...position,
      });
      await this.writes.flush(characterId);
    }
    const joinedCharacter = transition
      ? {
          ...character,
          zone_id: zoneId,
          zone_instance: instanceId,
          ...position,
        }
      : character;
    return {
      zone,
      character: joinedCharacter,
      techniques,
      inventoryItems,
      combat,
      position,
      bind: {
        zoneId: Number(storedBind?.zone_id ?? zoneId),
        instanceId: Number(storedBind?.instance_id ?? 0),
        x: Number(storedBind?.x ?? zone.safe_x),
        y: Number(storedBind?.y ?? zone.safe_y),
        z: Number(storedBind?.z ?? zone.safe_z),
        heading: Number(storedBind?.heading ?? 0),
      },
      npcs,
    };
  }
}

function defaultCombat(
  character: CharacterProfileProjection,
): CharacterCombatProjection {
  return {
    level: Number(character.level),
    baseStrength: Number(character.str),
    baseStamina: Number(character.sta),
    baseDexterity: Number(character.dex),
    baseAgility: Number(character.agi),
    strength: Number(character.str),
    stamina: Number(character.sta),
    dexterity: Number(character.dex),
    agility: Number(character.agi),
    offense: 0,
    defense: 0,
    armorClass: 0,
    maximumHp: 1,
    weaponDamage: 2,
    attackDelayMs: 2_500,
    haste: 0,
    meleeRange: 3,
  };
}
