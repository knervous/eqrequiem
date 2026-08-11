import {
  CLASS_IDS,
  type CombatAbilityDefinition,
  type StatusDefinition,
} from "../ability-types.js";
import { ASPECT_UNLOCKS } from "../aspects/index.js";
import { formulaNames } from "../formulas.js";
import { CLERIC_ABILITIES, CLERIC_STATUSES } from "./cleric.js";
import { COMMON_STATUSES } from "./common.js";
import { DRUID_ABILITIES, DRUID_STATUSES } from "./druid.js";
import { MONK_ABILITIES, MONK_STATUSES } from "./monk.js";
import { RANGER_ABILITIES, RANGER_STATUSES } from "./ranger.js";
import { WARRIOR_ABILITIES, WARRIOR_STATUSES } from "./warrior.js";
import { WIZARD_ABILITIES, WIZARD_STATUSES } from "./wizard.js";

/**
 * Every authored combat ability, and the static checks that keep the set honest.
 *
 * The design states several rules in prose that are cheap to violate by accident —
 * spell ranks creeping back in, an ordinary attack carrying both a punishing cost and a
 * long cooldown, a formula reference that does not exist, an Aspect node unlocking an
 * ability nobody wrote. `validateAbilities` turns each into a build failure, for the same
 * reason `validateQuestContent` exists. With six classes and a hundred techniques the
 * checks stopped being a nicety: nobody re-reads this much content by eye.
 */

export const ABILITIES: readonly CombatAbilityDefinition[] = [
  ...WARRIOR_ABILITIES,
  ...CLERIC_ABILITIES,
  ...RANGER_ABILITIES,
  ...DRUID_ABILITIES,
  ...MONK_ABILITIES,
  ...WIZARD_ABILITIES,
];

export const STATUSES: readonly StatusDefinition[] = [
  ...COMMON_STATUSES,
  ...WARRIOR_STATUSES,
  ...CLERIC_STATUSES,
  ...RANGER_STATUSES,
  ...DRUID_STATUSES,
  ...MONK_STATUSES,
  ...WIZARD_STATUSES,
];

const ABILITY_INDEX = new Map(ABILITIES.map((ability) => [ability.id, ability]));
const STATUS_INDEX = new Map(STATUSES.map((status) => [status.id, status]));

export function abilityById(id: string): CombatAbilityDefinition | null {
  return ABILITY_INDEX.get(id) ?? null;
}

export function statusById(id: string): StatusDefinition | null {
  return STATUS_INDEX.get(id) ?? null;
}

export function abilitiesForClass(classId: number): CombatAbilityDefinition[] {
  return ABILITIES.filter((ability) => ability.classIds.includes(classId as never));
}

/** Techniques a freshly created character of this class already knows. */
export function startingAbilities(classId: number): CombatAbilityDefinition[] {
  return abilitiesForClass(classId).filter(
    (ability) => ability.acquisition.source === "starting",
  );
}

/** Roman-numeral or trailing-digit ranks. The design forbids `Fire Bolt I/II/III`. */
const RANKED_NAME = /\b(?:[IVX]{1,4}|\d+)$/;

/** Recovery bands from §11. Anything past the heavy band reads as a cast bar. */
const MAX_RECOVERY_MS = 800;

export function validateAbilities(
  abilities: readonly CombatAbilityDefinition[] = ABILITIES,
  statuses: readonly StatusDefinition[] = STATUSES,
): void {
  const ids = new Set<string>();
  const statusIds = new Set<string>();
  const formulas = new Set(formulaNames());

  for (const status of statuses) {
    if (statusIds.has(status.id)) throw new Error(`duplicate status id: ${status.id}`);
    statusIds.add(status.id);
    if (status.durationMs <= 0) throw new Error(`${status.id} has no duration`);
    if (status.tick && !formulas.has(status.tick.amount.formula)) {
      throw new Error(`${status.id} ticks an unknown formula: ${status.tick.amount.formula}`);
    }
  }

  for (const ability of abilities) {
    if (ids.has(ability.id)) throw new Error(`duplicate ability id: ${ability.id}`);
    ids.add(ability.id);

    if (RANKED_NAME.test(ability.name)) {
      throw new Error(
        `${ability.id} looks like a ranked spell ("${ability.name}"). Use a distinct `
        + "verb instead — Cinder, Flame Lance, Combust — and let the formula scale.",
      );
    }
    if (ability.classIds.length === 0) {
      throw new Error(`${ability.id} belongs to no class`);
    }
    if (ability.minLevel < 1) throw new Error(`${ability.id} has a level below 1`);
    if (ability.recoveryMs <= 0) {
      throw new Error(`${ability.id} has no recovery; pacing comes from recovery alone`);
    }
    if (ability.recoveryMs > MAX_RECOVERY_MS) {
      throw new Error(
        `${ability.id} recovers in ${ability.recoveryMs}ms; the heavy band tops out at `
        + `${MAX_RECOVERY_MS}ms, beyond which the action reads as a cast bar`,
      );
    }

    // "Resources constrain sustained output. Cooldowns constrain timing." An ordinary
    // action should lean on one. Anything genuinely major is expected to declare a
    // shared cooldown category, which is how the design marks it as major.
    const expensive = (ability.resource?.amount ?? 0) >= 10;
    const longCooldown = ability.cooldownMs >= 30_000;
    if (expensive && longCooldown && !ability.sharedCooldown && ability.charges === undefined) {
      throw new Error(
        `${ability.id} is both expensive and long-cooldown without being declared a `
        + "major power; give it a sharedCooldown or relax one of the two",
      );
    }

    for (const status of collectStatusIds(ability)) {
      if (!statusIds.has(status)) {
        throw new Error(`${ability.id} applies unknown status: ${status}`);
      }
    }
    for (const name of collectFormulaNames(ability)) {
      if (!formulas.has(name)) {
        throw new Error(`${ability.id} references unknown formula: ${name}`);
      }
    }
    for (const requirement of ability.requirements ?? []) {
      if (
        (requirement.kind === "actor_has_status"
          || requirement.kind === "actor_missing_status"
          || requirement.kind === "target_has_status"
          || requirement.kind === "target_missing_status")
        && !statusIds.has(requirement.statusId)
      ) {
        throw new Error(`${ability.id} requires unknown status: ${requirement.statusId}`);
      }
    }

    // Tags are presentation; requirements are what the server enforces. Letting them
    // drift produces an ability that looks gated in the UI and is not gated in play.
    assertTagMatchesRequirement(ability, "requires_shield", "has_shield");
    assertTagMatchesRequirement(ability, "requires_bow", "has_bow");

    if (ability.acquisition.source === "aspect" && !ASPECT_UNLOCKS.has(ability.id)) {
      throw new Error(
        `${ability.id} is acquired from an Aspect but no node unlocks it; either wire the `
        + "node or give the ability a real acquisition path",
      );
    }
    for (const prerequisite of ability.acquisition.requiresAbilities ?? []) {
      if (!abilities.some((candidate) => candidate.id === prerequisite)) {
        throw new Error(`${ability.id} requires unknown ability: ${prerequisite}`);
      }
    }

    // Anything the player aims needs a reach. A targeted ability with no range would
    // silently pass the range gate at any distance.
    const needsRange = ability.target.kind !== "self" && ability.target.kind !== "radius_self";
    if (needsRange && ability.target.rangeMetres === undefined) {
      throw new Error(`${ability.id} targets ${ability.target.kind} without a range`);
    }
  }

  for (const abilityId of ASPECT_UNLOCKS) {
    const unlocked = ABILITY_INDEX.get(abilityId);
    if (!unlocked) {
      throw new Error(`an Aspect node unlocks ${abilityId}, which no class file defines`);
    }
    if (unlocked.acquisition.source !== "aspect") {
      throw new Error(
        `${abilityId} is unlocked by an Aspect node but claims to be acquired from `
        + `"${unlocked.acquisition.source}"; one of the two is wrong`,
      );
    }
  }

  // Every playable class must be playable from the first minute, and must keep gaining
  // something across the whole 1–25 band the demo now covers.
  for (const [name, classId] of Object.entries(CLASS_IDS)) {
    const kit = abilities.filter((ability) => ability.classIds.includes(classId as never));
    if (kit.length === 0) throw new Error(`${name} has no abilities`);
    if (!kit.some((ability) => ability.acquisition.source === "starting")) {
      throw new Error(
        `${name} has nothing to press at level 1; no class may wait for a trainer to `
        + "become itself",
      );
    }
    for (const [low, high] of [[1, 10], [11, 18], [19, 25]] as const) {
      const inBand = kit.some(
        (ability) =>
          ability.acquisition.source !== "aspect"
          && ability.minLevel >= low
          && ability.minLevel <= high,
      );
      if (!inBand) {
        throw new Error(`${name} gains nothing between levels ${low} and ${high}`);
      }
    }
  }
}

function assertTagMatchesRequirement(
  ability: CombatAbilityDefinition,
  tag: "requires_shield" | "requires_bow",
  kind: "has_shield" | "has_bow",
): void {
  const tagged = ability.tags?.includes(tag) === true;
  const required = ability.requirements?.some((requirement) => requirement.kind === kind) === true;
  if (tagged && !required) {
    throw new Error(
      `${ability.id} is tagged ${tag} but does not require one; the tag is presentation, `
      + "the requirement is what the server enforces",
    );
  }
  if (required && !tagged) {
    throw new Error(
      `${ability.id} requires ${kind} but is not tagged ${tag}; the UI would not warn the `
      + "player before they pressed it",
    );
  }
}

function collectStatusIds(ability: CombatAbilityDefinition): string[] {
  const found: string[] = [];
  const walk = (effects: readonly CombatAbilityDefinition["effects"][number][]): void => {
    for (const effect of effects) {
      if (effect.type === "apply_status") found.push(effect.statusId);
      if (effect.type === "remove_status" && effect.statusId) found.push(effect.statusId);
      if (effect.type === "spawn_projectile") walk(effect.onHit);
      if (effect.type === "spawn_area") walk(effect.onTick);
    }
  };
  walk(ability.effects);
  return found;
}

function collectFormulaNames(ability: CombatAbilityDefinition): string[] {
  const found: string[] = [];
  if (ability.threat) found.push(ability.threat.formula);
  const walk = (effects: readonly CombatAbilityDefinition["effects"][number][]): void => {
    for (const effect of effects) {
      if ("amount" in effect && effect.amount && typeof effect.amount === "object") {
        found.push(effect.amount.formula);
      }
      if (effect.type === "spawn_projectile") walk(effect.onHit);
      if (effect.type === "spawn_area") walk(effect.onTick);
    }
  };
  walk(ability.effects);
  return found;
}
