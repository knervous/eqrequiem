import type { CombatantStats } from "../combat/melee-combat.js";
import type {
  QuestNpcSnapshot,
  QuestPlayerSnapshot,
} from "./quest-types.js";
import type { ZoneJoinProjection } from "./zone-join-service.js";

/** The transport-neutral player state consumed by either zone runtime host. */
export interface ZoneRuntimePlayerDefinition {
  readonly sessionId: number;
  readonly entityId: number;
  readonly characterId: number;
  readonly characterName: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly level: number;
  readonly race: number;
  readonly gender: number;
  readonly charClass: number;
  readonly face: number;
  readonly combat: CombatantStats;
  readonly learned: readonly string[];
  readonly prepared: readonly string[];
  readonly bind: {
    readonly zoneId: number;
    readonly instanceId: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly heading: number;
  };
}

export function zoneRuntimePlayerProjection(
  join: ZoneJoinProjection,
  sessionId: number,
  entityId: number,
): ZoneRuntimePlayerDefinition {
  const { character, position, combat, techniques, bind } = join;
  return {
    sessionId,
    entityId,
    characterId: Number(character.id),
    characterName: character.name,
    ...position,
    level: Number(character.level),
    race: Number(character.race_id),
    gender: Number(character.gender),
    charClass: Number(character.class_id),
    face: Number(character.face),
    combat,
    learned: [...techniques.learned],
    prepared: [...techniques.prepared.values()],
    bind: { ...bind },
  };
}

export function questPlayerProjection(
  player: ZoneRuntimePlayerDefinition,
): QuestPlayerSnapshot {
  return {
    kind: "player",
    sessionId: player.sessionId,
    characterId: player.characterId,
    id: player.entityId,
    name: player.characterName,
    level: player.level,
    classId: player.charClass,
    raceId: player.race,
    gender: player.gender,
    position: {
      x: player.x,
      y: player.y,
      z: player.z,
      heading: player.heading,
    },
  };
}

interface QuestNpcProjectionInput {
  readonly spawnId: number;
  readonly npcArchetypeId?: number;
  readonly id?: number;
  readonly name: string;
  readonly level: number;
  readonly race?: number;
  readonly gender?: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

export function questNpcProjection(
  npc: QuestNpcProjectionInput,
  npcIndex: number,
): QuestNpcSnapshot {
  return {
    kind: "npc",
    id: npc.spawnId,
    ...((npc.npcArchetypeId ?? npc.id) === undefined
      ? {}
      : { npcId: npc.npcArchetypeId ?? npc.id }),
    npcIndex,
    name: npc.name,
    level: npc.level,
    ...(npc.race === undefined ? {} : { raceId: npc.race }),
    ...(npc.gender === undefined ? {} : { gender: npc.gender }),
    position: {
      x: npc.x,
      y: npc.y,
      z: npc.z,
      heading: npc.heading,
    },
  };
}
