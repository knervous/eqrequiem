import { abilityById } from "./abilities/index.js";
import type { AbilityActorState, AbilityWorldPort } from "./ability-port.js";
import { hasTag, type CombatAbilityDefinition } from "./ability-types.js";
import { modifiersFor } from "./aspects/index.js";
import { NO_ASPECT_MODIFIERS } from "./aspects/modifiers.js";
import {
  CombatantRuntime,
  pool,
  type ActivationRefusal,
  type CombatantResources,
} from "./combat-runtime.js";
import {
  applyAbilityEffects,
  requirementMet,
  type AbilityEffectReport,
} from "./effect-runtime.js";

/**
 * The seam between the combat substrate and the game.
 *
 * `CombatantRuntime` decides whether an action may happen and charges for it;
 * `effect-runtime` decides what happens to the world through a port both runtimes share.
 * This module owns the join: one runtime per player entity, the Aspect modifiers that
 * character has bought, and the reaction windows their nodes opened.
 */

export type {
  AbilityActorState,
  AbilityDamageOutcome,
  AbilityHealOutcome,
  AbilityWorldPort,
} from "./ability-port.js";
export type { AbilityEffectReport } from "./effect-runtime.js";

export interface AbilityActivationAccepted {
  readonly ok: true;
  readonly actionId: string;
  readonly abilityId: string;
  readonly cooldownEndsAtMs: number;
  readonly recoveryEndsAtMs: number;
  readonly effects: readonly AbilityEffectReport[];
}

export interface AbilityActivationRejected {
  readonly ok: false;
  readonly abilityId: string;
  readonly reason: ActivationRefusal;
  readonly readyAtMs?: number;
}

export type AbilityActivation =
  | AbilityActivationAccepted
  | AbilityActivationRejected;

/**
 * Vigor and mana maxima.
 *
 * Health is mirrored, not authoritative: `MeleeCombatSystem` owns hit points so a swing
 * and an ability cannot disagree about how alive something is. Mana grows with level
 * because a caster's whole constraint is the pool; vigor does not, because a martial
 * class is constrained by cooldowns and would rather have the pool stay legible.
 */
export function resourcesFor(
  level: number,
  stamina: number,
  bonusMana = 0,
  bonusVigor = 0,
): CombatantResources {
  return {
    health: pool(1),
    mana: pool(50 + level * 10 + bonusMana),
    vigor: pool(100 + Math.round(Math.max(0, stamina - 75) / 5) + bonusVigor),
  };
}

/**
 * Owns one `CombatantRuntime` per player entity and runs activations against a port.
 *
 * Instances are per-shard and deliberately not persisted: cooldowns and recovery do not
 * survive a zone restart, and `combat-runtime.ts` is explicit that mixing them with the
 * character record is how a combat bug becomes a corrupted character.
 */
export class PlayerAbilitySystem {
  readonly #runtimes = new Map<number, CombatantRuntime>();
  /** Aspect points per entity, so modifiers are resolved once rather than per press. */
  readonly #modifiers = new Map<number, ReturnType<typeof modifiersFor>>();
  /** Reaction windows a node opened: entity -> abilityId -> expiry. */
  readonly #reactions = new Map<number, Map<string, number>>();

  register(
    entityId: number,
    level: number,
    stamina: number,
    aspectPoints: ReadonlyMap<string, number> = new Map(),
  ): void {
    const modifiers = modifiersFor(aspectPoints);
    this.#modifiers.set(entityId, modifiers);
    this.#runtimes.set(
      entityId,
      new CombatantRuntime(
        entityId,
        resourcesFor(
          level,
          stamina,
          modifiers.bonusResourceMaximum("mana"),
          modifiers.bonusResourceMaximum("vigor"),
        ),
      ),
    );
  }

  release(entityId: number): void {
    this.#runtimes.delete(entityId);
    this.#modifiers.delete(entityId);
    this.#reactions.delete(entityId);
  }

  runtimeFor(entityId: number): CombatantRuntime | undefined {
    return this.#runtimes.get(entityId);
  }

  modifiersFor(entityId: number) {
    return this.#modifiers.get(entityId) ?? NO_ASPECT_MODIFIERS;
  }

  /** Opens one window directly, for a `trigger_reaction` effect. */
  grantReaction(entityId: number, abilityId: string, expiresAtMs: number): void {
    const windows = this.#reactions.get(entityId) ?? new Map<string, number>();
    windows.set(abilityId, expiresAtMs);
    this.#reactions.set(entityId, windows);
  }

  /**
   * Opens the reaction windows a trigger earned.
   *
   * Called by whatever noticed the parry, dodge or kill. The window lets the granted
   * technique ignore its cooldown once, which is what makes a reaction feel like a
   * reaction rather than a button that happened to be ready.
   */
  openReactionWindows(
    entityId: number,
    trigger: Parameters<ReturnType<typeof modifiersFor>["reactionsFor"]>[0],
    nowMs: number,
  ): string[] {
    const reactions = this.modifiersFor(entityId).reactionsFor(trigger);
    if (reactions.length === 0) return [];
    const windows = this.#reactions.get(entityId) ?? new Map<string, number>();
    for (const reaction of reactions) {
      windows.set(reaction.grantsAbilityId, nowMs + reaction.windowMs);
    }
    this.#reactions.set(entityId, windows);
    return reactions.map((reaction) => reaction.grantsAbilityId);
  }

  /** Out-of-combat regeneration, driven by the caller's tick. */
  regenerate(elapsedMs: number, rates: {
    readonly healthPerSecond: number;
    readonly manaPerSecond: number;
    readonly vigorPerSecond: number;
  }): void {
    for (const [entityId, runtime] of this.#runtimes) {
      const modifiers = this.modifiersFor(entityId);
      runtime.regenerate(elapsedMs, {
        healthPerSecond: rates.healthPerSecond,
        manaPerSecond: rates.manaPerSecond + modifiers.bonusResourceRegenPerSecond("mana"),
        vigorPerSecond: rates.vigorPerSecond + modifiers.bonusResourceRegenPerSecond("vigor"),
      });
    }
  }

  activate(
    actor: AbilityActorState,
    abilityId: string,
    targetId: number,
    nowMs: number,
    port: AbilityWorldPort,
  ): AbilityActivation {
    const ability = abilityById(abilityId);
    if (!ability) return { ok: false, abilityId, reason: "unknown_ability" };

    const runtime = this.#runtimes.get(actor.entityId);
    if (!runtime) return { ok: false, abilityId, reason: "actor_incapacitated" };

    const modifiers = this.modifiersFor(actor.entityId);
    const reactionOpen = (this.#reactions.get(actor.entityId)?.get(abilityId) ?? 0) > nowMs;

    const needsTarget = ability.target.kind !== "self"
      && ability.target.kind !== "radius_self";
    const hasTarget = needsTarget
      ? port.targetExists(targetId)
        && (ability.target.kind !== "hostile_target"
          || port.targetIsHostile(actor.entityId, targetId))
      : true;

    const withModifiers: AbilityActorState = { ...actor, modifiers };
    const requirementsMet = (ability.requirements ?? []).every((requirement) =>
      requirementMet(requirement, withModifiers, targetId, port),
    );

    const separation = needsTarget
      ? port.separationTo(actor.entityId, targetId)
      : undefined;
    const gate = runtime.activate(ability, {
      nowMs,
      level: actor.level,
      classId: actor.classId,
      learned: actor.learned,
      prepared: actor.prepared,
      resources: runtime.resources,
      incapacitated: actor.incapacitated,
      hasTarget,
      requirementsMet,
      modifiers,
      ...(separation === undefined ? {} : { targetSeparation: separation }),
    });
    if (!gate.ok) {
      // An open reaction window forgives exactly one refusal, and only a timing one.
      // Forgiving a missing target or an unlearned technique would make the window a
      // bypass of the rules rather than of the clock.
      const timing = gate.reason === "on_cooldown" || gate.reason === "recovering";
      if (!reactionOpen || !timing) {
        return {
          ok: false,
          abilityId,
          reason: gate.reason,
          ...(gate.readyAtMs === undefined ? {} : { readyAtMs: gate.readyAtMs }),
        };
      }
      this.#reactions.get(actor.entityId)?.delete(abilityId);
      const effects = applyAbilityEffects({
        ability,
        actor: withModifiers,
        targetId,
        port,
      });
      return {
        ok: true,
        actionId: `${actor.entityId}:reaction:${nowMs}`,
        abilityId,
        cooldownEndsAtMs: gate.readyAtMs ?? nowMs,
        recoveryEndsAtMs: nowMs,
        effects,
      };
    }

    const effects = applyAbilityEffects({
      ability,
      actor: withModifiers,
      targetId,
      port,
    });
    return {
      ok: true,
      actionId: gate.actionId,
      abilityId: gate.abilityId,
      cooldownEndsAtMs: gate.cooldownEndsAtMs,
      recoveryEndsAtMs: gate.recoveryEndsAtMs,
      effects,
    };
  }
}

/** Whether an ability may fire during someone else's recovery. Re-exported for clients. */
export function isReaction(ability: CombatAbilityDefinition): boolean {
  return hasTag(ability, "reaction");
}
