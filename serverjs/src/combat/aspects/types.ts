import type { ClassId, CombatEffectDefinition, ResourceType } from "../ability-types.js";

/**
 * Aspects: two thematic tracks per class that shape emphasis without replacing role.
 *
 * The line the design draws, and the one this module exists to enforce: an Aspect is
 * **not a subclass**. A Ranger with every point in Warden is still a Ranger; a Cleric
 * who goes all-in on Judgment is still the best healer in the group. So no node may
 * grant or remove a class's defining verbs — they modify, unlock situational tools, or
 * open reactions, and that is all.
 *
 * Points are spent freely across both tracks. There is no "pick a spec" gate, because
 * the moment one exists players stop reading nodes and start copying builds. What forces
 * a decision instead is arithmetic: a level-25 character holds 24 points and the two
 * tracks together cost far more than that, so depth in one is breadth given up in the
 * other.
 *
 * Every node carries `modifiers` as data rather than prose. A node whose only content is
 * an `effect` string is a node that does nothing, which is the state this whole system
 * was in before: authored, persisted, and invisible to combat.
 */

export type AspectNodeKind = "passive" | "modifier" | "active" | "reaction";

/**
 * What a node actually changes.
 *
 * Deliberately a closed set. Anything that cannot be said with one of these belongs in
 * an `active` unlock — a real ability with a real cost — rather than a bespoke passive
 * that only one node understands.
 */
export type AspectModifier =
  /** Scales an ability's cooldown. 0.8 = 20% shorter. */
  | { readonly kind: "cooldown"; readonly abilityId: string; readonly multiplier: number }
  /** Scales an ability's resource cost. */
  | { readonly kind: "cost"; readonly abilityId: string; readonly multiplier: number }
  /** Scales damage, either for one ability or for a whole school. */
  | {
      readonly kind: "damage";
      readonly abilityId?: string;
      readonly school?: string;
      readonly multiplier: number;
    }
  /** Scales healing the character does. */
  | { readonly kind: "healing"; readonly abilityId?: string; readonly multiplier: number }
  /** Scales threat the character generates. */
  | { readonly kind: "threat"; readonly abilityId?: string; readonly multiplier: number }
  /** Scales how long a status the character applies lasts. */
  | { readonly kind: "status_duration"; readonly statusId: string; readonly multiplier: number }
  /** Extends an ability's reach. */
  | { readonly kind: "range"; readonly abilityId: string; readonly bonusMetres: number }
  /** Grants an extra charge. */
  | { readonly kind: "charges"; readonly abilityId: string; readonly bonus: number }
  /** Raises a resource ceiling. */
  | { readonly kind: "resource_max"; readonly resource: ResourceType; readonly bonus: number }
  /** Adds regeneration, per second, that applies in and out of combat. */
  | { readonly kind: "resource_regen"; readonly resource: ResourceType; readonly perSecond: number }
  /** Staples an extra effect onto an existing ability. */
  | {
      readonly kind: "add_effect";
      readonly abilityId: string;
      readonly effect: CombatEffectDefinition;
    }
  /**
   * Opens a reaction window when something happens to the character.
   *
   * The window is what the design calls for: rewarding when read correctly, never
   * mandatory for basic competence.
   */
  | {
      readonly kind: "reaction";
      readonly trigger: "parry" | "dodge" | "block" | "resist" | "kill" | "low_health";
      readonly grantsAbilityId: string;
      readonly windowMs: number;
    };

export interface AspectNode {
  readonly id: string;
  readonly name: string;
  /** What it actually does, in the words a player would read. */
  readonly effect: string;
  readonly kind: AspectNodeKind;
  /** Points already spent in this track before the node may be taken. */
  readonly requiresTrackDepth: number;
  /** Points this node costs. Kept at 1 unless a node is genuinely a capstone. */
  readonly cost: number;
  /** Ability this node modifies, when it modifies one. */
  readonly modifies?: string;
  /** Ability this node unlocks, for `active` nodes. */
  readonly unlocks?: string;
  /** The mechanical content. An empty list is only honest for an `active` unlock. */
  readonly modifiers?: readonly AspectModifier[];
}

export interface AspectTrack {
  readonly id: string;
  readonly name: string;
  /** One line on what playing into this track feels like. */
  readonly focus: string;
  readonly nodes: readonly AspectNode[];
}

export interface ClassAspects {
  readonly classId: ClassId;
  readonly tracks: readonly [AspectTrack, AspectTrack];
  /** The verbs this class keeps no matter how points are spent. */
  readonly neverLost: readonly string[];
}

/** Aspect Points are granted one per level from level 2. */
export function aspectPointsForLevel(level: number): number {
  return Math.max(0, Math.trunc(level) - 1);
}
