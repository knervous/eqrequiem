import type { CombatEffectDefinition, ResourceType } from "../ability-types.js";
import type { AspectModifier, AspectNode } from "./types.js";

/**
 * Turns spent Aspect Points into the numbers combat actually reads.
 *
 * Before this existed, every Aspect node was a sentence. Points were validated, stored
 * and displayed, and no node changed a single value in a fight — the tree was
 * documentation with a database table behind it. This module is the join: nodes carry
 * `modifiers` as data, the runtime resolves them once per activation, and a node that
 * claims Brace lasts longer makes Brace last longer.
 *
 * Multipliers compose by multiplication, so two nodes that each shorten a cooldown by a
 * fifth produce 0.64 rather than 0.6. That is deliberate — additive stacking is how a
 * tree ends up with a corner that reduces something to zero.
 */

export interface AspectReaction {
  readonly trigger: "parry" | "dodge" | "block" | "resist" | "kill" | "low_health";
  readonly grantsAbilityId: string;
  readonly windowMs: number;
}

export interface AspectModifierSet {
  cooldownMultiplier(abilityId: string): number;
  costMultiplier(abilityId: string): number;
  damageMultiplier(abilityId: string, school?: string): number;
  healingMultiplier(abilityId: string): number;
  threatMultiplier(abilityId: string): number;
  statusDurationMultiplier(statusId: string): number;
  bonusRangeMetres(abilityId: string): number;
  bonusCharges(abilityId: string): number;
  bonusResourceMaximum(resource: ResourceType): number;
  bonusResourceRegenPerSecond(resource: ResourceType): number;
  extraEffects(abilityId: string): readonly CombatEffectDefinition[];
  reactionsFor(trigger: AspectReaction["trigger"]): readonly AspectReaction[];
  /** True when no points are spent, so callers can skip work entirely. */
  readonly empty: boolean;
}

const ALL = "*";

class ResolvedAspects implements AspectModifierSet {
  readonly #cooldown = new Map<string, number>();
  readonly #cost = new Map<string, number>();
  readonly #damage = new Map<string, number>();
  readonly #healing = new Map<string, number>();
  readonly #threat = new Map<string, number>();
  readonly #statusDuration = new Map<string, number>();
  readonly #range = new Map<string, number>();
  readonly #charges = new Map<string, number>();
  readonly #resourceMax = new Map<string, number>();
  readonly #resourceRegen = new Map<string, number>();
  readonly #extraEffects = new Map<string, CombatEffectDefinition[]>();
  readonly #reactions: AspectReaction[] = [];
  #any = false;

  get empty(): boolean {
    return !this.#any;
  }

  add(modifier: AspectModifier): void {
    this.#any = true;
    switch (modifier.kind) {
      case "cooldown":
        multiply(this.#cooldown, modifier.abilityId, modifier.multiplier);
        break;
      case "cost":
        multiply(this.#cost, modifier.abilityId, modifier.multiplier);
        break;
      case "damage":
        // A node may target one ability, a whole school, or everything the character
        // does. All three are looked up on every hit and multiplied together.
        multiply(
          this.#damage,
          modifier.abilityId ?? (modifier.school ? `school:${modifier.school}` : ALL),
          modifier.multiplier,
        );
        break;
      case "healing":
        multiply(this.#healing, modifier.abilityId ?? ALL, modifier.multiplier);
        break;
      case "threat":
        multiply(this.#threat, modifier.abilityId ?? ALL, modifier.multiplier);
        break;
      case "status_duration":
        multiply(this.#statusDuration, modifier.statusId, modifier.multiplier);
        break;
      case "range":
        accumulate(this.#range, modifier.abilityId, modifier.bonusMetres);
        break;
      case "charges":
        accumulate(this.#charges, modifier.abilityId, modifier.bonus);
        break;
      case "resource_max":
        accumulate(this.#resourceMax, modifier.resource, modifier.bonus);
        break;
      case "resource_regen":
        accumulate(this.#resourceRegen, modifier.resource, modifier.perSecond);
        break;
      case "add_effect": {
        const existing = this.#extraEffects.get(modifier.abilityId) ?? [];
        existing.push(modifier.effect);
        this.#extraEffects.set(modifier.abilityId, existing);
        break;
      }
      case "reaction":
        this.#reactions.push({
          trigger: modifier.trigger,
          grantsAbilityId: modifier.grantsAbilityId,
          windowMs: modifier.windowMs,
        });
        break;
    }
  }

  cooldownMultiplier(abilityId: string): number {
    return this.#cooldown.get(abilityId) ?? 1;
  }

  costMultiplier(abilityId: string): number {
    return this.#cost.get(abilityId) ?? 1;
  }

  damageMultiplier(abilityId: string, school?: string): number {
    return (this.#damage.get(ALL) ?? 1)
      * (this.#damage.get(abilityId) ?? 1)
      * (school ? this.#damage.get(`school:${school}`) ?? 1 : 1);
  }

  healingMultiplier(abilityId: string): number {
    return (this.#healing.get(ALL) ?? 1) * (this.#healing.get(abilityId) ?? 1);
  }

  threatMultiplier(abilityId: string): number {
    return (this.#threat.get(ALL) ?? 1) * (this.#threat.get(abilityId) ?? 1);
  }

  statusDurationMultiplier(statusId: string): number {
    return this.#statusDuration.get(statusId) ?? 1;
  }

  bonusRangeMetres(abilityId: string): number {
    return this.#range.get(abilityId) ?? 0;
  }

  bonusCharges(abilityId: string): number {
    return this.#charges.get(abilityId) ?? 0;
  }

  bonusResourceMaximum(resource: ResourceType): number {
    return this.#resourceMax.get(resource) ?? 0;
  }

  bonusResourceRegenPerSecond(resource: ResourceType): number {
    return this.#resourceRegen.get(resource) ?? 0;
  }

  extraEffects(abilityId: string): readonly CombatEffectDefinition[] {
    return this.#extraEffects.get(abilityId) ?? [];
  }

  reactionsFor(trigger: AspectReaction["trigger"]): readonly AspectReaction[] {
    return this.#reactions.filter((reaction) => reaction.trigger === trigger);
  }
}

function multiply(target: Map<string, number>, key: string, value: number): void {
  target.set(key, (target.get(key) ?? 1) * value);
}

function accumulate(target: Map<string, number>, key: string, value: number): void {
  target.set(key, (target.get(key) ?? 0) + value);
}

/** A character who has spent nothing. Shared, so the common case allocates nothing. */
export const NO_ASPECT_MODIFIERS: AspectModifierSet = new ResolvedAspects();

/**
 * Resolves the modifier set for a character's spent points.
 *
 * `nodeLookup` is injected rather than imported so this module stays independent of the
 * authored content, which keeps it testable with three fake nodes instead of six classes.
 */
export function resolveAspectModifiers(
  aspectPoints: ReadonlyMap<string, number>,
  nodeLookup: (nodeId: string) => AspectNode | null,
): AspectModifierSet {
  if (aspectPoints.size === 0) return NO_ASPECT_MODIFIERS;
  const resolved = new ResolvedAspects();
  for (const [nodeId, points] of aspectPoints) {
    if (points <= 0) continue;
    const node = nodeLookup(nodeId);
    if (!node) continue;
    for (const modifier of node.modifiers ?? []) resolved.add(modifier);
  }
  return resolved;
}
