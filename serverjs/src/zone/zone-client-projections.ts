import type { WorldSpawnInput } from "../protocol/world-state.js";
import { EntityKind } from "./entity-store.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import type { ZoneJoinProjection } from "./zone-join-service.js";

export function newZoneProjection(
  join: ZoneJoinProjection,
  zoneId: number,
  instanceId: number,
) {
  return {
    zoneId,
    zoneIdNumber: zoneId,
    instanceId,
    shortName: join.zone.key,
    longName: join.zone.name,
    zonePoints: [],
  };
}

export function playerProfileProjection(
  join: ZoneJoinProjection,
  zoneId: number,
  instanceId: number,
) {
  const { character, combat, position } = join;
  return {
    name: character.name,
    level: Number(character.level),
    charClass: Number(character.class_id),
    race: Number(character.race_id),
    gender: Number(character.gender),
    deity: Number(character.deity_id),
    face: Number(character.face),
    zoneId,
    zoneInstance: instanceId,
    ...position,
    str: Number(character.str),
    sta: Number(character.sta),
    dex: Number(character.dex),
    agi: Number(character.agi),
    intel: Number(character.intelligence),
    wis: Number(character.wis),
    cha: Number(character.cha),
    curHp: combat.maximumHp,
    maxHp: combat.maximumHp,
    inventoryItems: join.inventoryItems,
  };
}

export function playerSpawnProjection(
  join: ZoneJoinProjection,
  entityId: number,
): WorldSpawnInput & { readonly isNpc: false; x: number; y: number; z: number } {
  const { character, combat, position } = join;
  return {
    id: Number(character.id),
    spawnId: entityId,
    name: character.name,
    level: Number(character.level),
    race: Number(character.race_id),
    gender: Number(character.gender),
    charClass: Number(character.class_id),
    face: Number(character.face),
    isNpc: false,
    size: -1,
    ...position,
    currentHp: combat.maximumHp,
    maximumHp: combat.maximumHp,
    equipment: { head: 0, chest: 0, primary: 0, secondary: 0 },
  };
}

export interface MutableNpcClientSpawn {
  id: number;
  spawnId: number;
  name: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  kind: number;
  race: number;
  gender: number;
  level: number;
  isNpc: true;
  modelKey: string | null;
  size: number;
  face: number;
  helm: number;
  equipChest: number;
  equipment: {
    head: number;
    chest: number;
    primary: number;
    secondary: number;
  };
  charClass: number;
  bodytype: number;
  currentHp: number;
  maximumHp: number;
}

export function npcSpawnProjection(
  spawn: ZoneNpcSpawnDefinition,
): MutableNpcClientSpawn {
  return {
    id: spawn.npcArchetypeId,
    spawnId: spawn.spawnId,
    name: spawn.name,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    heading: spawn.heading,
    kind: Number(EntityKind.npc),
    race: spawn.race,
    gender: spawn.gender,
    level: spawn.level,
    isNpc: true,
    modelKey: spawn.modelKey,
    size: spawn.size,
    face: spawn.face,
    helm: spawn.helm,
    equipChest: spawn.equipChest,
    equipment: {
      head: spawn.helm,
      chest: spawn.equipChest,
      primary: spawn.primary,
      secondary: spawn.secondary,
    },
    charClass: spawn.charClass,
    bodytype: spawn.bodyType,
    currentHp: spawn.maximumHp,
    maximumHp: spawn.maximumHp,
  };
}
