import type { ResourceType } from "./ability-types.js";
import type { AspectModifierSet } from "./aspects/modifiers.js";
import type { TargetSeparation } from "./reach.js";

/**
 * The seam between an ability and the world it happens in.
 *
 * Every verb here is something a runtime must be able to do for some authored effect to
 * mean anything, and nothing here knows what an ability is. Widening this interface is a
 * deliberate act: an effect that cannot be expressed through these verbs belongs in a
 * `script` handler authored beside the content, not in a port that grows a method per
 * spell.
 *
 * `ZoneAbilityPort` is the only implementation, and both the zone worker and the offline
 * runtime use it, so a Kick means the same thing in both.
 */

export interface AbilityActorState {
  readonly entityId: number;
  readonly level: number;
  readonly classId: number;
  readonly learned: ReadonlySet<string>;
  readonly prepared: ReadonlySet<string>;
  readonly strength: number;
  readonly stamina: number;
  readonly agility: number;
  readonly dexterity: number;
  readonly wisdom?: number;
  readonly intelligence?: number;
  readonly weaponDamage: number;
  /** Relevant weapon skill, feeding `martial.*` formulas. */
  readonly skill: number;
  readonly spellPower?: number;
  readonly healingPower?: number;
  readonly hasShield: boolean;
  readonly hasBow: boolean;
  readonly incapacitated: boolean;
  /** Resolved Aspect choices. Absent means the character has spent nothing. */
  readonly modifiers?: AspectModifierSet;
}

export interface AbilityDamageOutcome {
  readonly damage: number;
  readonly targetCurrentHp: number;
  readonly targetMaximumHp: number;
  readonly killed: boolean;
}

export interface AbilityHealOutcome {
  readonly healed: number;
  readonly targetCurrentHp: number;
  readonly targetMaximumHp: number;
}

export interface AbilityWorldPort {
  /**
   * True 3D metres between the two, or undefined when either is gone. Right for
   * projectile flight time; wrong for range gating — use `separationTo` for that.
   */
  distanceMetres(actorId: number, targetId: number): number | undefined;
  /**
   * Ground-plane gap and height difference, kept apart so the range gate can spend
   * one and merely tolerate the other. See reach.ts.
   */
  separationTo(actorId: number, targetId: number): TargetSeparation | undefined;
  targetExists(targetId: number): boolean;
  targetIsHostile(actorId: number, targetId: number): boolean;
  targetArmor(targetId: number): number;
  targetLevel(targetId: number): number;
  targetIsUndead(targetId: number): boolean;
  targetHealthFraction(targetId: number): number;
  hasStatus(entityId: number, statusId: string): boolean;

  applyDamage(actorId: number, targetId: number, amount: number): AbilityDamageOutcome | null;
  applyHeal(actorId: number, targetId: number, amount: number): AbilityHealOutcome | null;
  /**
   * `durationMultiplier` carries the Aspect modifier; the port owns the clock.
   *
   * `sourceEntityId` is who applied it, and it is not optional in spirit: a
   * damage-over-time resolves its ticks against the caster, so a status that forgets its
   * source ticks forever and damages nothing.
   */
  applyStatus(
    targetId: number,
    statusId: string,
    durationMultiplier?: number,
    sourceEntityId?: number,
  ): void;
  removeStatus(targetId: number, statusId: string | undefined, count: number): string[];
  interrupt(targetId: number): boolean;

  /** Position the actor at the top of the target's hate list for a moment. */
  forceAttention(actorId: number, targetId: number, seconds: number): void;
  addThreat(actorId: number, targetId: number, amount: number): void;

  restoreResource(entityId: number, resource: ResourceType, amount: number): number;
  consumeResource(entityId: number, resource: ResourceType, amount: number): number;

  /** Closes distance toward the target, capped at `metres`. Returns metres travelled. */
  moveToward(actorId: number, targetId: number, metres: number): number;
  /** Pushes or pulls the target relative to the actor. Returns metres displaced. */
  displace(actorId: number, targetId: number, metres: number): number;
  /** Repositions the actor along its own facing. Returns metres travelled. */
  teleport(actorId: number, metres: number): number;

  /** Everything hostile to the actor within `radius` of a point of interest. */
  entitiesWithin(
    actorId: number,
    centreEntityId: number,
    radiusMetres: number,
    filter: "hostile" | "friendly",
    maxTargets: number,
  ): number[];

  /** Runs `onLand` after the projectile's flight time. */
  scheduleProjectile(
    actorId: number,
    targetId: number,
    speedMetresPerSecond: number,
    onLand: () => void,
  ): number;
  /** Registers a persisting area that ticks once per second until it expires. */
  spawnArea(
    actorId: number,
    centreEntityId: number,
    radiusMetres: number,
    durationMs: number,
    filter: "hostile" | "friendly",
    onTick: (targetId: number) => void,
  ): void;

  /** Opens a window in which a granted technique may be used off-cooldown. */
  openReaction(actorId: number, abilityId: string, windowMs: number): void;
  revive(actorId: number, corpseId: number, resourcePercent: number): boolean;
  /** Authored escape hatch. Returns whether the handler existed and ran. */
  runScript(handler: string, actorId: number, targetId: number): boolean;
}
