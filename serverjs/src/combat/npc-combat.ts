import type { ZoneNpcSpawnDefinition } from "../zone/zone-content.js";
import type { CombatantStats } from "./melee-combat.js";

export function npcCombatantStats(
  npc: ZoneNpcSpawnDefinition,
): CombatantStats {
  return {
    level: npc.level,
    strength: npc.strength,
    stamina: npc.stamina,
    dexterity: npc.dexterity,
    agility: npc.agility,
    offense: npc.offense,
    defense: npc.defense,
    armorClass: npc.armorClass,
    maximumHp: npc.maximumHp,
    weaponDamage: npc.weaponDamage,
    attackDelayMs: npc.attackDelayMs,
    haste: npc.haste,
    meleeRange: npc.meleeRange,
  };
}
