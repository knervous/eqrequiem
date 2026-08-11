import type { AbilityActorState, AbilityWorldPort } from "./ability-port.js";
import type {
  CombatAbilityDefinition,
  CombatEffectDefinition,
  CombatRequirement,
  FormulaRef,
} from "./ability-types.js";
import { NO_ASPECT_MODIFIERS, type AspectModifierSet } from "./aspects/modifiers.js";
import { evaluateFormula } from "./formulas.js";

/**
 * The one place an authored effect turns into something that happened.
 *
 * Every primitive in `CombatEffectDefinition` is handled here. That matters more than it
 * sounds: the previous version handled five of seventeen and silently skipped the rest,
 * so an Intercept charged its vigor, started its cooldown, and moved the Warrior
 * nowhere. A `default:` that quietly does nothing is indistinguishable from a working
 * feature until someone plays it, so this switch is exhaustive by type and the compiler
 * is what keeps it that way.
 *
 * Aspect modifiers are applied here rather than baked into the authored numbers, because
 * the authored number is the class's identity and the modifier is the player's choice.
 */

/** One thing an activation did, for the client and for tests. */
export type AbilityEffectReport =
  | ({ readonly kind: "damage"; readonly targetId: number } & {
      readonly damage: number;
      readonly targetCurrentHp: number;
      readonly targetMaximumHp: number;
      readonly killed: boolean;
    })
  | {
      readonly kind: "heal";
      readonly targetId: number;
      readonly healed: number;
      readonly targetCurrentHp: number;
      readonly targetMaximumHp: number;
    }
  | { readonly kind: "status"; readonly targetId: number; readonly statusId: string }
  | { readonly kind: "status_removed"; readonly targetId: number; readonly statusId: string }
  | { readonly kind: "interrupt"; readonly targetId: number; readonly landed: boolean }
  | { readonly kind: "taunt"; readonly targetId: number; readonly seconds: number }
  | { readonly kind: "threat"; readonly targetId: number; readonly amount: number }
  | {
      readonly kind: "resource";
      readonly targetId: number;
      readonly resource: string;
      readonly amount: number;
    }
  | {
      readonly kind: "move";
      readonly targetId: number;
      readonly metres: number;
      readonly mode: "self" | "target" | "teleport";
    }
  | {
      readonly kind: "projectile";
      readonly targetId: number;
      readonly flightMs: number;
      readonly speedMetresPerSecond: number;
    }
  | {
      readonly kind: "area";
      readonly targetId: number;
      readonly radiusMetres: number;
      readonly durationMs: number;
    }
  | { readonly kind: "reaction"; readonly abilityId: string; readonly windowMs: number }
  | { readonly kind: "revive"; readonly targetId: number; readonly resourcePercent: number }
  | { readonly kind: "script"; readonly handler: string; readonly ran: boolean };

export function modifiersOf(actor: AbilityActorState): AspectModifierSet {
  return actor.modifiers ?? NO_ASPECT_MODIFIERS;
}

/** Formula inputs shared by every effect, so one stat never feeds two curves differently. */
function formulaInput(
  actor: AbilityActorState,
  targetId: number,
  port: AbilityWorldPort,
): Parameters<typeof evaluateFormula>[1] {
  return {
    level: actor.level,
    strength: actor.strength,
    stamina: actor.stamina,
    agility: actor.agility,
    dexterity: actor.dexterity,
    ...(actor.wisdom === undefined ? {} : { wisdom: actor.wisdom }),
    ...(actor.intelligence === undefined ? {} : { intelligence: actor.intelligence }),
    skill: actor.skill,
    weaponDamage: actor.weaponDamage,
    ...(actor.spellPower === undefined ? {} : { spellPower: actor.spellPower }),
    ...(actor.healingPower === undefined ? {} : { healingPower: actor.healingPower }),
    targetArmor: port.targetArmor(targetId),
    levelDifference: actor.level - port.targetLevel(targetId),
  };
}

function amountOf(
  reference: FormulaRef,
  actor: AbilityActorState,
  targetId: number,
  port: AbilityWorldPort,
): number {
  return Math.max(1, Math.round(evaluateFormula(reference, formulaInput(actor, targetId, port))));
}

/** Whether a requirement holds. Every kind is answered; none is assumed true. */
export function requirementMet(
  requirement: CombatRequirement,
  actor: AbilityActorState,
  targetId: number,
  port: AbilityWorldPort,
): boolean {
  switch (requirement.kind) {
    case "has_shield":
      return actor.hasShield;
    case "has_bow":
      return actor.hasBow;
    case "target_is_undead":
      return port.targetIsUndead(targetId);
    case "target_below_health_percent":
      return port.targetHealthFraction(targetId) * 100 <= requirement.percent;
    case "actor_has_status":
      return port.hasStatus(actor.entityId, requirement.statusId);
    case "actor_missing_status":
      return !port.hasStatus(actor.entityId, requirement.statusId);
    case "target_has_status":
      return port.hasStatus(targetId, requirement.statusId);
    case "target_missing_status":
      return !port.hasStatus(targetId, requirement.statusId);
  }
}

export interface EffectApplication {
  readonly ability: CombatAbilityDefinition;
  readonly actor: AbilityActorState;
  readonly targetId: number;
  readonly port: AbilityWorldPort;
}

/**
 * Applies an ability's effect list in authored order.
 *
 * Order is the author's tool: damage before threat means the hate a strike earns is
 * already counted when the authored threat lands on top of it.
 */
export function applyAbilityEffects(
  application: EffectApplication,
): AbilityEffectReport[] {
  const { ability, actor, targetId, port } = application;
  const modifiers = modifiersOf(actor);
  const reports: AbilityEffectReport[] = [];
  const selfTargeted = ability.target.kind === "self";
  const subject = selfTargeted ? actor.entityId : targetId;

  const effects = [...ability.effects, ...modifiers.extraEffects(ability.id)];
  const shape = ability.target;
  // `ground_point` is deliberately absent: an area placed on the ground does its own
  // searching every tick, so fanning the effect list over the entities already standing
  // there spawned one area per victim instead of one area.
  const spread = shape.kind === "cone"
    || shape.kind === "radius_self"
    || shape.kind === "radius_target"
    || shape.kind === "line";

  // Multi-target shapes apply the whole effect list once per victim. Resolving the
  // victims here rather than per effect keeps a cleave from hitting a different set of
  // enemies with its damage than with its debuff.
  const victims = spread
    ? port.entitiesWithin(
      actor.entityId,
      shape.kind === "radius_self" ? actor.entityId : subject,
      (shape.widthMetres ?? shape.rangeMetres ?? 8) / (shape.kind === "cone" ? 1 : 1),
      friendlyShape(ability) ? "friendly" : "hostile",
      shape.maxTargets ?? 5,
    )
    : [subject];

  for (const victim of victims.length > 0 ? victims : [subject]) {
    for (const effect of effects) {
      applyOne(effect, { ...application, targetId: victim }, reports, modifiers);
    }
  }

  if (ability.threat && !selfTargeted) {
    const amount = Math.round(
      evaluateFormula(ability.threat, { level: actor.level })
      * modifiers.threatMultiplier(ability.id),
    );
    for (const victim of victims) {
      port.addThreat(actor.entityId, victim, amount);
      reports.push({ kind: "threat", targetId: victim, amount });
    }
  }

  return reports;
}

/** A shape that lands on allies rather than enemies. Healing decides this, not the shape. */
function friendlyShape(ability: CombatAbilityDefinition): boolean {
  return ability.effects.some(
    (effect) =>
      effect.type === "heal"
      || (effect.type === "spawn_area" && effect.onTick.some((tick) => tick.type === "heal")),
  );
}

function applyOne(
  effect: CombatEffectDefinition,
  application: EffectApplication,
  reports: AbilityEffectReport[],
  modifiers: AspectModifierSet,
): void {
  const { ability, actor, targetId, port } = application;

  switch (effect.type) {
    case "damage": {
      const amount = Math.max(
        1,
        Math.round(
          amountOf(effect.amount, actor, targetId, port)
          * modifiers.damageMultiplier(ability.id, effect.school),
        ),
      );
      const outcome = port.applyDamage(actor.entityId, targetId, amount);
      if (outcome) reports.push({ kind: "damage", targetId, ...outcome });
      break;
    }
    case "heal": {
      const amount = Math.max(
        1,
        Math.round(
          amountOf(effect.amount, actor, targetId, port)
          * modifiers.healingMultiplier(ability.id),
        ),
      );
      const outcome = port.applyHeal(actor.entityId, targetId, amount);
      if (outcome) reports.push({ kind: "heal", targetId, ...outcome });
      break;
    }
    case "apply_status": {
      port.applyStatus(
        targetId,
        effect.statusId,
        modifiers.statusDurationMultiplier(effect.statusId),
        actor.entityId,
      );
      reports.push({ kind: "status", targetId, statusId: effect.statusId });
      break;
    }
    case "remove_status": {
      const removed = port.removeStatus(targetId, effect.statusId, effect.count ?? 1);
      for (const statusId of removed) {
        reports.push({ kind: "status_removed", targetId, statusId });
      }
      break;
    }
    case "dispel": {
      const removed = port.removeStatus(targetId, undefined, effect.count);
      for (const statusId of removed) {
        reports.push({ kind: "status_removed", targetId, statusId });
      }
      break;
    }
    case "interrupt": {
      const landed = port.interrupt(targetId);
      reports.push({ kind: "interrupt", targetId, landed });
      break;
    }
    case "taunt": {
      const seconds = effect.forceSeconds ?? 3;
      port.forceAttention(actor.entityId, targetId, seconds);
      reports.push({ kind: "taunt", targetId, seconds });
      break;
    }
    case "modify_threat": {
      const amount = Math.round(
        evaluateFormula(effect.amount, { level: actor.level })
        * modifiers.threatMultiplier(ability.id),
      );
      port.addThreat(actor.entityId, targetId, amount);
      reports.push({ kind: "threat", targetId, amount });
      break;
    }
    case "restore_resource": {
      const amount = port.restoreResource(
        actor.entityId,
        effect.resource,
        amountOf(effect.amount, actor, targetId, port),
      );
      reports.push({
        kind: "resource",
        targetId: actor.entityId,
        resource: effect.resource,
        amount,
      });
      break;
    }
    case "consume_resource": {
      const amount = port.consumeResource(
        actor.entityId,
        effect.resource,
        amountOf(effect.amount, actor, targetId, port),
      );
      reports.push({
        kind: "resource",
        targetId: actor.entityId,
        resource: effect.resource,
        amount: -amount,
      });
      break;
    }
    case "move_self": {
      const metres = port.moveToward(actor.entityId, targetId, effect.metres);
      reports.push({ kind: "move", targetId: actor.entityId, metres, mode: "self" });
      break;
    }
    case "move_target": {
      const metres = port.displace(actor.entityId, targetId, effect.metres);
      reports.push({ kind: "move", targetId, metres, mode: "target" });
      break;
    }
    case "teleport": {
      const metres = port.teleport(actor.entityId, effect.metres);
      reports.push({ kind: "move", targetId: actor.entityId, metres, mode: "teleport" });
      break;
    }
    case "spawn_projectile": {
      // The activation is instant; the effect is not. Committing cost and cooldown up
      // front and landing the damage on arrival is exactly the §10 contract.
      const flightMs = port.scheduleProjectile(
        actor.entityId,
        targetId,
        effect.speedMetresPerSecond,
        () => {
          for (const onHit of effect.onHit) {
            applyOne(onHit, application, reports, modifiers);
          }
        },
      );
      reports.push({
        kind: "projectile",
        targetId,
        flightMs,
        speedMetresPerSecond: effect.speedMetresPerSecond,
      });
      break;
    }
    case "spawn_area": {
      const heals = effect.onTick.some((tick) => tick.type === "heal");
      port.spawnArea(
        actor.entityId,
        targetId,
        effect.radiusMetres,
        effect.durationMs,
        heals ? "friendly" : "hostile",
        (victim) => {
          for (const tick of effect.onTick) {
            applyOne(tick, { ...application, targetId: victim }, reports, modifiers);
          }
        },
      );
      reports.push({
        kind: "area",
        targetId,
        radiusMetres: effect.radiusMetres,
        durationMs: effect.durationMs,
      });
      break;
    }
    case "trigger_reaction": {
      port.openReaction(actor.entityId, effect.reactionId, effect.windowMs);
      reports.push({
        kind: "reaction",
        abilityId: effect.reactionId,
        windowMs: effect.windowMs,
      });
      break;
    }
    case "revive": {
      const revived = port.revive(actor.entityId, targetId, effect.resourcePercent);
      if (revived) {
        reports.push({ kind: "revive", targetId, resourcePercent: effect.resourcePercent });
      }
      break;
    }
    case "script": {
      const ran = port.runScript(effect.handler, actor.entityId, targetId);
      reports.push({ kind: "script", handler: effect.handler, ran });
      break;
    }
  }
}
