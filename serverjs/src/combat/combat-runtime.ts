import {
  ignoresRecovery,
  type CombatAbilityDefinition,
  type ResourceType,
} from "./ability-types.js";
import { NO_ASPECT_MODIFIERS, type AspectModifierSet } from "./aspects/modifiers.js";
import { withinReach, type TargetSeparation } from "./reach.js";

/**
 * The ephemeral authoritative side of combat: what a character can do *right now*.
 *
 * Kept deliberately separate from persistent progression. What a character has learned,
 * prepared and spent Aspect Points on outlives the fight and belongs in the character
 * record; cooldowns, recovery and current resources do not survive a zone restart and
 * must never be written into the same place — mixing them is how a bug in combat state
 * becomes a corrupted character.
 *
 * Everything here is driven by an injected clock, so a shard restart, an offline
 * session and a test all behave identically. Nothing calls `Date.now()`.
 */

export interface ResourcePool {
  current: number;
  readonly maximum: number;
}

export interface CombatantResources {
  readonly health: ResourcePool;
  readonly mana: ResourcePool;
  readonly vigor: ResourcePool;
}

export function pool(maximum: number, current = maximum): ResourcePool {
  return { current: Math.max(0, Math.min(current, maximum)), maximum };
}

/** Why an activation was refused. The client turns these into feedback, not guesses. */
export type ActivationRefusal =
  | "unknown_ability"
  | "not_learned"
  | "not_prepared"
  | "level_too_low"
  | "wrong_class"
  | "on_cooldown"
  | "recovering"
  | "insufficient_resource"
  | "no_charges"
  | "requirement_unmet"
  | "invalid_target"
  | "out_of_range"
  | "actor_incapacitated";

export interface ActivationContext {
  readonly nowMs: number;
  readonly level: number;
  readonly classId: number;
  /** Techniques the character permanently knows. */
  readonly learned: ReadonlySet<string>;
  /** The smaller set currently on the bar. Swapping is locked in combat. */
  readonly prepared: ReadonlySet<string>;
  readonly resources: CombatantResources;
  /** Control state: a stunned actor cannot act. */
  readonly incapacitated?: boolean;
  /**
   * Gap to the chosen target, when the ability targets something.
   *
   * Split into ground-plane and height components rather than a single 3D distance:
   * see reach.ts. Folding height into the distance is what made every melee ability
   * refuse at a range auto-attack was happily swinging through.
   */
  readonly targetSeparation?: TargetSeparation;
  readonly hasTarget?: boolean;
  readonly requirementsMet?: boolean;
  /**
   * Resolved Aspect choices.
   *
   * The gate is where cost, cooldown, charges and reach are decided, so it is also the
   * only honest place to apply the nodes that change them. Applying them later would
   * charge the authored price and grant the modified one.
   */
  readonly modifiers?: AspectModifierSet;
}

export interface ActivationAccepted {
  readonly ok: true;
  /** Stable identity for dedupe and client reconciliation. */
  readonly actionId: string;
  readonly abilityId: string;
  readonly committedResource?: { readonly type: ResourceType; readonly amount: number };
  readonly cooldownEndsAtMs: number;
  readonly recoveryEndsAtMs: number;
}

export interface ActivationRejected {
  readonly ok: false;
  readonly reason: ActivationRefusal;
  /** When the refusal is timing, when it would succeed. Lets the client buffer input. */
  readonly readyAtMs?: number;
}

export type ActivationResult = ActivationAccepted | ActivationRejected;

/**
 * One combatant's live combat state.
 *
 * Cooldowns are stored as absolute end times rather than remaining durations so that
 * nothing has to be ticked down: a paused shard, a slow tick, or a reconnect all read
 * the same answer from the clock.
 */
export class CombatantRuntime {
  #recoveryEndsAtMs = 0;
  #cooldowns = new Map<string, number>();
  #sharedCooldowns = new Map<string, number>();
  #charges = new Map<string, number>();
  #sequence = 0;

  constructor(
    readonly entityId: number,
    readonly resources: CombatantResources,
  ) {}

  get recoveryEndsAtMs(): number {
    return this.#recoveryEndsAtMs;
  }

  cooldownEndsAtMs(abilityId: string): number {
    return this.#cooldowns.get(abilityId) ?? 0;
  }

  sharedCooldownEndsAtMs(category: string): number {
    return this.#sharedCooldowns.get(category) ?? 0;
  }

  chargesRemaining(ability: CombatAbilityDefinition): number {
    if (ability.charges === undefined) return Number.POSITIVE_INFINITY;
    return this.#charges.get(ability.id) ?? ability.charges;
  }

  /** Restores a charge, e.g. from a recharge timer or an Aspect node. */
  grantCharge(ability: CombatAbilityDefinition): void {
    if (ability.charges === undefined) return;
    const current = this.chargesRemaining(ability);
    this.#charges.set(ability.id, Math.min(ability.charges, current + 1));
  }

  resourceOf(type: ResourceType): ResourcePool {
    return type === "mana"
      ? this.resources.mana
      : type === "vigor"
        ? this.resources.vigor
        : this.resources.health;
  }

  /**
   * The authoritative gate. Validates in the order the design specifies, so the first
   * refusal a player sees is the most informative one — being dead beats being out of
   * range, which beats being out of mana.
   */
  activate(
    ability: CombatAbilityDefinition,
    context: ActivationContext,
  ): ActivationResult {
    const now = context.nowMs;
    const modifiers = context.modifiers ?? NO_ASPECT_MODIFIERS;
    const cost = ability.resource
      ? Math.max(
        0,
        Math.round(ability.resource.amount * modifiers.costMultiplier(ability.id)),
      )
      : 0;
    const cooldownMs = Math.max(
      0,
      Math.round(ability.cooldownMs * modifiers.cooldownMultiplier(ability.id)),
    );
    const maxCharges = ability.charges === undefined
      ? undefined
      : ability.charges + modifiers.bonusCharges(ability.id);

    if (context.incapacitated) return { ok: false, reason: "actor_incapacitated" };
    if (!context.learned.has(ability.id)) return { ok: false, reason: "not_learned" };
    if (!context.prepared.has(ability.id)) return { ok: false, reason: "not_prepared" };
    if (context.level < ability.minLevel) return { ok: false, reason: "level_too_low" };
    if (!ability.classIds.includes(context.classId as never)) {
      return { ok: false, reason: "wrong_class" };
    }
    if (context.requirementsMet === false) {
      return { ok: false, reason: "requirement_unmet" };
    }

    const needsTarget = ability.target.kind !== "self"
      && ability.target.kind !== "radius_self";
    if (needsTarget && context.hasTarget === false) {
      return { ok: false, reason: "invalid_target" };
    }
    const authoredRange = ability.target.rangeMetres;
    const range = authoredRange === undefined
      ? undefined
      : authoredRange + modifiers.bonusRangeMetres(ability.id);
    if (needsTarget && range !== undefined && context.targetSeparation !== undefined
      && !withinReach(context.targetSeparation, range)) {
      return { ok: false, reason: "out_of_range" };
    }

    // Recovery is per-action pacing, not a global cooldown; reactions bypass it, which
    // is the whole point of tagging them.
    if (!ignoresRecovery(ability) && this.#recoveryEndsAtMs > now) {
      return { ok: false, reason: "recovering", readyAtMs: this.#recoveryEndsAtMs };
    }

    const cooldownEnd = this.cooldownEndsAtMs(ability.id);
    if (cooldownEnd > now) {
      return { ok: false, reason: "on_cooldown", readyAtMs: cooldownEnd };
    }
    if (ability.sharedCooldown) {
      const sharedEnd = this.sharedCooldownEndsAtMs(ability.sharedCooldown);
      if (sharedEnd > now) {
        return { ok: false, reason: "on_cooldown", readyAtMs: sharedEnd };
      }
    }
    if (maxCharges !== undefined
      && Math.min(this.chargesRemaining(ability), maxCharges) <= 0) {
      return { ok: false, reason: "no_charges" };
    }

    if (ability.resource) {
      const resource = this.resourceOf(ability.resource.type);
      if (resource.current < cost) {
        return { ok: false, reason: "insufficient_resource" };
      }
    }

    // Everything validated: commit. Resource first, then timing, so a thrown error
    // cannot leave an ability on cooldown that was never paid for.
    let committed: ActivationAccepted["committedResource"];
    if (ability.resource) {
      const resource = this.resourceOf(ability.resource.type);
      resource.current -= cost;
      committed = { type: ability.resource.type, amount: cost };
    }

    const cooldownEndsAtMs = now + cooldownMs;
    if (cooldownMs > 0) this.#cooldowns.set(ability.id, cooldownEndsAtMs);
    if (ability.sharedCooldown && cooldownMs > 0) {
      this.#sharedCooldowns.set(ability.sharedCooldown, cooldownEndsAtMs);
    }
    if (maxCharges !== undefined) {
      this.#charges.set(
        ability.id,
        Math.min(this.chargesRemaining(ability), maxCharges) - 1,
      );
    }

    const recoveryEndsAtMs = now + ability.recoveryMs;
    // A reaction does not extend the actor's recovery either; it slots into it.
    if (!ignoresRecovery(ability)) this.#recoveryEndsAtMs = recoveryEndsAtMs;

    this.#sequence += 1;
    return {
      ok: true,
      actionId: `${this.entityId}:${this.#sequence}`,
      abilityId: ability.id,
      ...(committed ? { committedResource: committed } : {}),
      cooldownEndsAtMs,
      recoveryEndsAtMs,
    };
  }

  /** Out-of-combat recovery. Rates are per second; callers supply elapsed time. */
  regenerate(elapsedMs: number, rates: {
    readonly healthPerSecond: number;
    readonly manaPerSecond: number;
    readonly vigorPerSecond: number;
  }): void {
    const seconds = Math.max(0, elapsedMs) / 1000;
    for (const [type, rate] of [
      ["health", rates.healthPerSecond],
      ["mana", rates.manaPerSecond],
      ["vigor", rates.vigorPerSecond],
    ] as const) {
      const resource = this.resourceOf(type);
      resource.current = Math.min(resource.maximum, resource.current + rate * seconds);
    }
  }
}

/**
 * Out-of-combat recovery rates.
 *
 * Vigor comes back fast, mana slowly. That difference is what keeps a martial class
 * ready to pull again quickly while a caster still feels sustained pushing as pressure
 * — without reproducing classic sit-and-meditate downtime.
 */
export const OUT_OF_COMBAT_REGEN = Object.freeze({
  healthPerSecond: 0.04,
  manaPerSecond: 0.03,
  vigorPerSecond: 0.15,
});

/** Seconds without hostile action before accelerated recovery begins. */
export const RECOVERY_DELAY_MS = 6_000;
