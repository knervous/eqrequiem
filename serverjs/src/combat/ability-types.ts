/**
 * The vocabulary of combat actions.
 *
 * Abilities are data with escape hatches, the same shape the quest system settled on:
 * declarative where declarative is honest, and a `script` effect for the handful of
 * techniques that would otherwise force every future mechanic into a DSL.
 *
 * Two invariants from the design are encoded here rather than left to discipline:
 *
 * - **There is no universal GCD.** Pacing comes from per-action `recoveryMs`, and
 *   actions tagged `reaction` or `off_recovery` may fire during someone else's recovery.
 *   A single global cooldown field does not exist and should not be added.
 * - **Resources constrain sustained output; cooldowns constrain timing.** Both fields
 *   exist, but an ordinary attack spell is expected to carry one or the other, not a
 *   punishing dose of each.
 *
 * See `docs/shadows-of-eltania/07-classes-levels-aspects-and-combat.md` §11, §12, §23.
 */

/** Class identity. Numeric to match the character record's `class_id`. */
export const CLASS_IDS = {
  warrior: 1,
  cleric: 2,
  ranger: 4,
  druid: 6,
  monk: 7,
  wizard: 12,
} as const;

export type ClassId = (typeof CLASS_IDS)[keyof typeof CLASS_IDS];

export type ResourceType = "mana" | "vigor" | "health";

/** Damage/resist schools. Deliberately small; add one only when content needs it. */
export type MagicSchool =
  | "arcane"
  | "fire"
  | "cold"
  | "nature"
  | "sacred"
  | "shadow";

export type AbilityKind = "martial" | "spell" | "utility";

/**
 * Tags drive engine behavior, so they are a closed set rather than free strings.
 *
 * `reaction` and `off_recovery` are the two that matter mechanically: both let an
 * action begin while the actor is still recovering, which is what keeps reactive play
 * from being punished by the pacing system it is supposed to interrupt.
 */
export type AbilityTag =
  | "reaction"
  | "off_recovery"
  | "movement"
  | "channelled"
  | "requires_shield"
  | "requires_bow"
  | "undead_focus"
  /** Holds until changed or invalidated, rather than expiring on its own. */
  | "stance";

export type TargetKind =
  | "self"
  | "hostile_target"
  | "friendly_target"
  | "group_member"
  | "ground_point"
  | "cone"
  | "line"
  | "radius_self"
  | "radius_target"
  | "corpse";

export interface TargetDefinition {
  readonly kind: TargetKind;
  /** Metres. Omitted for `self`. */
  readonly rangeMetres?: number;
  /** For cone/line/radius shapes. */
  readonly widthMetres?: number;
  readonly maxTargets?: number;
  /** Whether the action needs line of sight. Defaults to true for anything targeted. */
  readonly requiresLineOfSight?: boolean;
}

/** A reference into the formula registry, so balance lives in one place. */
export interface FormulaRef {
  readonly formula: string;
  /** Authored scalar the formula may use, e.g. a per-ability coefficient. */
  readonly scale?: number;
}

export type StatusStacking =
  | "refresh"
  | "stack"
  | "replace_weaker"
  | "independent_by_caster"
  | "unique";

export interface StatusDefinition {
  readonly id: string;
  readonly name: string;
  readonly durationMs: number;
  readonly stacking: StatusStacking;
  /** Control statuses are what interrupts, roots and stuns are made of. */
  readonly control?: "root" | "snare" | "stun" | "silence" | "knockdown";
  /** Damage/heal per tick, on the 1s cadence the design specifies. */
  readonly tick?: { readonly everyMs: number; readonly amount: FormulaRef };
  readonly school?: MagicSchool;
  /** Whether damage removes it. Authored per status, never globally. */
  readonly breaksOnDamage?: boolean;
}

/** The deterministic primitives an ability composes. */
export type CombatEffectDefinition =
  | { readonly type: "damage"; readonly amount: FormulaRef; readonly school?: MagicSchool }
  | { readonly type: "heal"; readonly amount: FormulaRef }
  | { readonly type: "apply_status"; readonly statusId: string }
  | { readonly type: "remove_status"; readonly statusId?: string; readonly count?: number }
  | { readonly type: "interrupt" }
  | { readonly type: "taunt"; readonly forceSeconds?: number }
  | { readonly type: "modify_threat"; readonly amount: FormulaRef }
  | { readonly type: "move_self"; readonly metres: number }
  | { readonly type: "move_target"; readonly metres: number }
  | { readonly type: "restore_resource"; readonly resource: ResourceType; readonly amount: FormulaRef }
  | { readonly type: "consume_resource"; readonly resource: ResourceType; readonly amount: FormulaRef }
  | { readonly type: "spawn_projectile"; readonly speedMetresPerSecond: number; readonly onHit: readonly CombatEffectDefinition[] }
  | { readonly type: "spawn_area"; readonly radiusMetres: number; readonly durationMs: number; readonly onTick: readonly CombatEffectDefinition[] }
  | { readonly type: "trigger_reaction"; readonly reactionId: string; readonly windowMs: number }
  | { readonly type: "revive"; readonly resourcePercent: number }
  | { readonly type: "teleport"; readonly metres: number }
  | { readonly type: "dispel"; readonly count: number }
  /** The escape hatch. Authored beside the content, like a quest handler. */
  | { readonly type: "script"; readonly handler: string };

/** What must be true of the actor, beyond cost and cooldown. */
export type CombatRequirement =
  | { readonly kind: "has_shield" }
  | { readonly kind: "has_bow" }
  | { readonly kind: "target_is_undead" }
  | { readonly kind: "target_below_health_percent"; readonly percent: number }
  | { readonly kind: "actor_has_status"; readonly statusId: string }
  | { readonly kind: "actor_missing_status"; readonly statusId: string }
  /** Setup-and-payoff pairs: Shatterfrost reads the chill Frost Snap left behind. */
  | { readonly kind: "target_has_status"; readonly statusId: string }
  | { readonly kind: "target_missing_status"; readonly statusId: string };

/** How a character comes to know a technique. Eligibility, acquisition and mastery are separate. */
export interface AcquisitionDefinition {
  /** Guaranteed paths exist for every class fundamental; no role depends on RNG. */
  readonly source:
    | "starting"
    | "trainer"
    | "advanced_trainer"
    | "class_quest"
    | "manual"
    | "research"
    | "discovery"
    | "faction_mentor"
    /** Known because an Aspect node unlocked it; never taught anywhere else. */
    | "aspect";
  /** Knowledge keys required before the character may learn it. */
  readonly requiresKnowledge?: readonly string[];
  /** Techniques that must already be known. */
  readonly requiresAbilities?: readonly string[];
  readonly requiresSkill?: { readonly skillId: number; readonly value: number };
}

export interface CombatAbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly classIds: readonly ClassId[];

  readonly kind: AbilityKind;
  readonly tags?: readonly AbilityTag[];

  readonly minLevel: number;
  readonly acquisition: AcquisitionDefinition;

  readonly resource?: { readonly type: ResourceType; readonly amount: number };

  readonly cooldownMs: number;
  /** Category shared with other powers that should not stack instantly. */
  readonly sharedCooldown?: string;
  readonly charges?: number;

  /** Per-action pacing. There is no global cooldown; this is the only pacing knob. */
  readonly recoveryMs: number;
  readonly target: TargetDefinition;

  readonly requirements?: readonly CombatRequirement[];
  readonly effects: readonly CombatEffectDefinition[];
  readonly threat?: FormulaRef;
}

export function hasTag(
  ability: CombatAbilityDefinition,
  tag: AbilityTag,
): boolean {
  return ability.tags?.includes(tag) === true;
}

/** True when the action may begin while the actor is still recovering. */
export function ignoresRecovery(ability: CombatAbilityDefinition): boolean {
  return hasTag(ability, "reaction") || hasTag(ability, "off_recovery");
}
