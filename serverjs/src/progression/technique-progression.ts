import type { CombatAbilityDefinition } from "../combat/ability-types.js";
import { abilityById, abilitiesForClass } from "../combat/abilities/index.js";
import {
  ASPECTS_BY_CLASS,
  aspectNode,
  aspectPointsForLevel,
  aspectsForClass,
  trackOfNode,
  type AspectNode,
  type ClassAspects,
} from "../combat/aspects/index.js";

/**
 * What a character knows, carries, and has chosen — the persistent half of progression.
 *
 * The design separates three things that are easy to blur, so this module keeps them
 * apart deliberately:
 *
 * - **Eligibility** is whether a character *could* learn something. Level and class ask
 *   this question; it is not the same as knowing it.
 * - **Acquisition** is how they actually learned it — a trainer, a class quest, a
 *   recovered manual. Levelling never silently fills the hotbar.
 * - **Mastery** is how well it performs, which lives in formulas and skills, not here.
 *
 * Every function is pure or repository-shaped so the offline backend and the live server
 * call exactly the same rules.
 */

export { ASPECTS_BY_CLASS, aspectNode, aspectsForClass };
export type { AspectNode, ClassAspects };

/** The demo loadout from §8: six primary, two reaction, one consumable. */
export const LOADOUT = Object.freeze({
  primarySlots: 6,
  reactionSlots: 2,
  consumableSlots: 1,
  get totalSlots(): number {
    return this.primarySlots + this.reactionSlots + this.consumableSlots;
  },
});

export type LearnRefusal =
  | "unknown_ability"
  | "wrong_class"
  | "level_too_low"
  | "already_known"
  | "missing_prerequisite_ability"
  | "missing_knowledge";

export interface CharacterTechniqueState {
  readonly level: number;
  readonly classId: number;
  readonly learned: ReadonlySet<string>;
  readonly knowledge: ReadonlySet<string>;
  /** Ability id per bar slot; sparse. */
  readonly prepared: ReadonlyMap<number, string>;
  /** Points spent per Aspect node id. */
  readonly aspectPoints: ReadonlyMap<string, number>;
}

/** Whether the character could learn this, ignoring how they would learn it. */
export function eligibilityOf(
  ability: CombatAbilityDefinition,
  state: CharacterTechniqueState,
): LearnRefusal | null {
  if (!ability.classIds.includes(state.classId as never)) return "wrong_class";
  if (state.level < ability.minLevel) return "level_too_low";
  for (const required of ability.acquisition.requiresAbilities ?? []) {
    if (!state.learned.has(required)) return "missing_prerequisite_ability";
  }
  for (const key of ability.acquisition.requiresKnowledge ?? []) {
    if (!state.knowledge.has(key)) return "missing_knowledge";
  }
  return null;
}

export function canLearn(
  abilityId: string,
  state: CharacterTechniqueState,
): LearnRefusal | null {
  const ability = abilityById(abilityId);
  if (!ability) return "unknown_ability";
  if (state.learned.has(abilityId)) return "already_known";
  return eligibilityOf(ability, state);
}

/**
 * Techniques the character could learn right now but has not.
 *
 * This is what a trainer mentions and what the journal records — the design is explicit
 * that a level-up should not hand out abilities, but it should let the world tell you
 * something became possible.
 */
export function newlyLearnable(
  state: CharacterTechniqueState,
): CombatAbilityDefinition[] {
  return abilitiesForClass(state.classId).filter(
    (ability) => canLearn(ability.id, state) === null,
  );
}

/** What a fresh character of this class already knows, with no trainer visit. */
export function startingTechniques(classId: number): string[] {
  return abilitiesForClass(classId)
    .filter((ability) => ability.acquisition.source === "starting")
    .map((ability) => ability.id);
}

// ---------------------------------------------------------------------------
// Prepared loadout
// ---------------------------------------------------------------------------

export type PrepareRefusal =
  | "not_learned"
  | "invalid_slot"
  | "already_prepared"
  | "in_combat";

/**
 * Swapping is locked in combat for the demo, so a loadout is a decision made before
 * the fight rather than a menu opened during one.
 */
export function canPrepare(
  abilityId: string,
  slot: number,
  state: CharacterTechniqueState,
  inCombat: boolean,
): PrepareRefusal | null {
  if (inCombat) return "in_combat";
  if (!Number.isInteger(slot) || slot < 0 || slot >= LOADOUT.totalSlots) {
    return "invalid_slot";
  }
  if (!state.learned.has(abilityId)) return "not_learned";
  for (const [occupied, prepared] of state.prepared) {
    if (prepared === abilityId && occupied !== slot) return "already_prepared";
  }
  return null;
}

/** Slots 0–5 are primary, 6–7 reaction, 8 consumable. */
export function slotKind(slot: number): "primary" | "reaction" | "consumable" | null {
  if (slot < 0) return null;
  if (slot < LOADOUT.primarySlots) return "primary";
  if (slot < LOADOUT.primarySlots + LOADOUT.reactionSlots) return "reaction";
  if (slot < LOADOUT.totalSlots) return "consumable";
  return null;
}

// ---------------------------------------------------------------------------
// Aspects
// ---------------------------------------------------------------------------

export type AspectRefusal =
  | "unknown_node"
  | "wrong_class"
  | "no_points_remaining"
  | "track_too_shallow"
  | "already_taken";

/** Points spent in the track a node belongs to. Depth gates read this, not total spend. */
export function trackDepth(
  trackId: string,
  aspectPoints: ReadonlyMap<string, number>,
): number {
  let depth = 0;
  for (const aspects of ASPECTS_BY_CLASS) {
    const track = aspects.tracks.find((entry) => entry.id === trackId);
    if (!track) continue;
    for (const node of track.nodes) depth += aspectPoints.get(node.id) ?? 0;
  }
  return depth;
}

export function spentPoints(aspectPoints: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const points of aspectPoints.values()) total += points;
  return total;
}

export function availablePoints(state: CharacterTechniqueState): number {
  return aspectPointsForLevel(state.level) - spentPoints(state.aspectPoints);
}

export function canSpendAspectPoint(
  nodeId: string,
  state: CharacterTechniqueState,
): AspectRefusal | null {
  const node = aspectNode(nodeId);
  if (!node) return "unknown_node";
  const track = trackOfNode(nodeId);
  const aspects = aspectsForClass(state.classId);
  if (!track || !aspects?.tracks.some((entry) => entry.id === track.id)) {
    return "wrong_class";
  }
  if ((state.aspectPoints.get(nodeId) ?? 0) >= node.cost) return "already_taken";
  if (availablePoints(state) < node.cost) return "no_points_remaining";
  if (trackDepth(track.id, state.aspectPoints) < node.requiresTrackDepth) {
    return "track_too_shallow";
  }
  return null;
}

/**
 * Abilities unlocked purely by Aspect choices, so the loadout can offer them.
 *
 * These are still *learned* techniques rather than free power: the node is what makes
 * them known, and they occupy a bar slot like anything else.
 */
export function aspectUnlockedAbilities(
  aspectPoints: ReadonlyMap<string, number>,
): string[] {
  const unlocked: string[] = [];
  for (const [nodeId, points] of aspectPoints) {
    if (points <= 0) continue;
    const node = aspectNode(nodeId);
    if (node?.unlocks) unlocked.push(node.unlocks);
  }
  return unlocked;
}

/**
 * What a level-up actually produces.
 *
 * Not abilities. A level grants capability — points, higher caps, new eligibility — and
 * the world is where techniques are learned. Returning the newly-eligible list lets a
 * trainer say something without the hotbar filling itself in.
 */
export interface LevelUpOutcome {
  readonly level: number;
  readonly previousLevel: number;
  readonly aspectPointsGained: number;
  readonly newlyEligible: readonly string[];
}

export function levelUpOutcome(
  previousLevel: number,
  level: number,
  state: CharacterTechniqueState,
): LevelUpOutcome {
  const before = new Set(
    abilitiesForClass(state.classId)
      .filter((ability) => canLearn(ability.id, { ...state, level: previousLevel }) === null)
      .map((ability) => ability.id),
  );
  const newlyEligible = newlyLearnable({ ...state, level })
    .map((ability) => ability.id)
    .filter((id) => !before.has(id));
  return {
    level,
    previousLevel,
    aspectPointsGained:
      aspectPointsForLevel(level) - aspectPointsForLevel(previousLevel),
    newlyEligible,
  };
}
