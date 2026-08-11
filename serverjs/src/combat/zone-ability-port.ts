import { EntityKind, type Entity, type EntityStore } from "../zone/entity-store.js";
import { statusById } from "./abilities/index.js";
import type {
  AbilityDamageOutcome,
  AbilityHealOutcome,
  AbilityWorldPort,
} from "./ability-port.js";
import type { ResourceType } from "./ability-types.js";
import { evaluateFormula } from "./formulas.js";
import type { CombatEvent, MeleeCombatSystem } from "./melee-combat.js";
import type { PlayerAbilitySystem } from "./player-abilities.js";
import {
  DEFAULT_REACH_RULES,
  separationBetween,
  withinReach,
  type ReachRules,
  type TargetSeparation,
} from "./reach.js";
import { StatusSet } from "./status.js";
import {
  DEFAULT_THREAT_RULES,
  tauntPlan,
  type HateView,
  type ThreatPlan,
} from "./threat.js";

/**
 * The one implementation of `AbilityWorldPort` both runtimes use.
 *
 * The zone worker and the offline runtime own the same systems — an entity store, a
 * melee system, an engagement table — so writing the port twice would be two chances to
 * disagree about what Kick does. They differ only in transport, which is outside this
 * file.
 *
 * The port also owns the things an effect needs that no other system wanted: status
 * sets, projectiles in flight, persisting areas, and the script handlers a handful of
 * techniques escape into. All three are advanced from `advance()`, on simulation time,
 * so a slow shard produces the same outcome as a fast one.
 */

/** What the port needs from an engagement system, without importing the whole class. */
export interface ThreatSink extends HateView {
  addHate(
    npcId: number,
    targetId: number,
    hate: number,
    damage: number,
    tick: number,
  ): void;
  applyThreat(plan: ThreatPlan, tick: number, nowMs: number): void;
}

/**
 * An authored escape hatch, registered by name.
 *
 * Feign Death and Track are the two the design calls out: neither is a damage formula,
 * and forcing them into declarative effects would mean inventing primitives that only
 * one ability would ever use.
 */
export type AbilityScriptHandler = (context: {
  readonly actorId: number;
  readonly targetId: number;
  readonly port: ZoneAbilityPort;
  readonly nowMs: number;
}) => void;

export interface ZoneAbilityPortOptions {
  readonly entities: EntityStore;
  readonly combat: MeleeCombatSystem;
  readonly threat: ThreatSink;
  /** Simulation tick, for threat bookkeeping and combat events. */
  currentTick(): number;
  /** Simulation clock in milliseconds, for status expiry and forced attention. */
  nowMs(): number;
  /** Called for every combat event an ability produces, so clients see the damage. */
  onCombatEvent(event: CombatEvent): void;
  /** Resource pools live with the ability system; the port borrows them for effects. */
  abilities?: PlayerAbilitySystem;
  scripts?: Readonly<Record<string, AbilityScriptHandler>>;
}

interface PendingProjectile {
  landsAtMs: number;
  onLand: () => void;
}

interface ActiveArea {
  readonly actorId: number;
  readonly centre: { x: number; y: number; z: number };
  readonly radiusMetres: number;
  readonly filter: "hostile" | "friendly";
  readonly onTick: (targetId: number) => void;
  expiresAtMs: number;
  nextTickAtMs: number;
}

const AREA_TICK_MS = 1_000;

export class ZoneAbilityPort implements AbilityWorldPort {
  readonly #statuses = new Map<number, StatusSet>();
  readonly #projectiles: PendingProjectile[] = [];
  readonly #areas: ActiveArea[] = [];
  /**
   * Proximity-scan cost, counted where the scan happens.
   *
   * `#within` is reached from two directions — an activation resolving a cone, and every
   * active area once a second — and only the first goes through a public method. Counting
   * in the caller therefore measured half the work and made areas look free. Two integer
   * increments on a path that is already O(population) is not a cost worth avoiding.
   */
  #proximityQueries = 0;
  #proximityVisits = 0;

  constructor(private readonly options: ZoneAbilityPortOptions) {}

  statusesOf(entityId: number): StatusSet {
    const existing = this.#statuses.get(entityId);
    if (existing) return existing;
    const created = new StatusSet();
    this.#statuses.set(entityId, created);
    return created;
  }

  forget(entityId: number): void {
    this.#statuses.delete(entityId);
  }

  /**
   * What the port is still holding.
   *
   * Exposed for the load harness: projectiles in flight and areas on the ground are the
   * two things here that outlive the entity that made them, so a soak test needs to be
   * able to see whether they drain.
   */
  get diagnostics(): {
    readonly statusSets: number;
    readonly projectilesInFlight: number;
    readonly activeAreas: number;
    /** Proximity scans run, and entities examined by them, since construction. */
    readonly proximityQueries: number;
    readonly proximityVisits: number;
  } {
    return {
      statusSets: this.#statuses.size,
      projectilesInFlight: this.#projectiles.length,
      activeAreas: this.#areas.length,
      proximityQueries: this.#proximityQueries,
      proximityVisits: this.#proximityVisits,
    };
  }

  /**
   * Expires statuses, lands projectiles, ticks areas and applies damage-over-time.
   *
   * All four were previously either missing or dropped on the floor: statuses expired
   * but their ticks were discarded, which is why every authored DoT in the game did
   * nothing at all.
   */
  advance(): void {
    const nowMs = this.options.nowMs();

    for (const [entityId, statuses] of this.#statuses) {
      for (const tick of statuses.advance(nowMs)) {
        const definition = statusById(tick.statusId);
        const amount = definition?.tick?.amount;
        if (!amount) continue;
        const magnitude = Math.max(
          1,
          Math.round(this.#tickMagnitude(tick.sourceEntityId, amount.formula, amount.scale ?? 1)
            * tick.stacks * tick.potency),
        );
        // A healing tick and a damaging tick are the same mechanism pointed at a
        // different pool; the formula name is what says which.
        if (amount.formula.includes("heal")) {
          this.applyHeal(tick.sourceEntityId, entityId, magnitude);
        } else {
          this.applyDamage(tick.sourceEntityId, entityId, magnitude);
        }
      }
    }

    for (let index = this.#projectiles.length - 1; index >= 0; index--) {
      const projectile = this.#projectiles[index]!;
      if (projectile.landsAtMs > nowMs) continue;
      this.#projectiles.splice(index, 1);
      projectile.onLand();
    }

    for (let index = this.#areas.length - 1; index >= 0; index--) {
      const area = this.#areas[index]!;
      if (area.expiresAtMs <= nowMs) {
        this.#areas.splice(index, 1);
        continue;
      }
      while (area.nextTickAtMs <= nowMs) {
        for (const victim of this.#within(area.actorId, area.centre, area.radiusMetres, area.filter, 8)) {
          area.onTick(victim);
        }
        area.nextTickAtMs += AREA_TICK_MS;
      }
    }
  }

  #tickMagnitude(sourceEntityId: number, formulaName: string, scale: number): number {
    // Ticks are resolved from the caster's level alone. The alternative — carrying the
    // whole actor state into every status — would make a status outlive the character
    // record it was resolved from.
    const source = this.options.entities.get(sourceEntityId);
    const level = source
      ? this.options.entities.publicState.stateLevel[source.index] ?? 1
      : 1;
    return evaluateFormula({ formula: formulaName, scale }, { level });
  }

  distanceMetres(actorId: number, targetId: number): number | undefined {
    const actor = this.options.entities.get(actorId);
    const target = this.options.entities.get(targetId);
    if (!actor || !target) return undefined;
    return distanceBetween(actor, target);
  }

  separationTo(actorId: number, targetId: number): TargetSeparation | undefined {
    const actor = this.options.entities.get(actorId);
    const target = this.options.entities.get(targetId);
    if (!actor || !target) return undefined;
    return separationBetween(actor.position, target.position);
  }

  targetExists(targetId: number): boolean {
    const target = this.options.entities.get(targetId);
    return target !== undefined && target !== null && target.currentHp > 0;
  }

  targetIsHostile(actorId: number, targetId: number): boolean {
    const actor = this.options.entities.get(actorId);
    const target = this.options.entities.get(targetId);
    if (!actor || !target) return false;
    return actor.kind !== target.kind;
  }

  targetArmor(targetId: number): number {
    // Armour is carried by the melee profile, which the port does not own. Zero is the
    // honest default: mitigation is applied by the melee system on swings, and an
    // ability that wants it should route damage through the same resolution.
    return this.options.entities.get(targetId) ? 0 : 0;
  }

  targetLevel(targetId: number): number {
    const target = this.options.entities.get(targetId);
    return target ? this.options.entities.publicState.stateLevel[target.index] ?? 1 : 1;
  }

  targetIsUndead(targetId: number): boolean {
    const target = this.options.entities.get(targetId);
    if (!target) return false;
    // Body type is not modelled on the entity yet. Corpse-kind and the undead flag on
    // the private server flags are what exist today; anything else answers false, which
    // makes `undead_focus` abilities refuse rather than silently fire on everything.
    const flags = this.options.entities.privateServerFlags[target.index] ?? 0;
    return (flags & UNDEAD_FLAG) !== 0;
  }

  targetHealthFraction(targetId: number): number {
    const target = this.options.entities.get(targetId);
    if (!target || target.maximumHp <= 0) return 0;
    return target.currentHp / target.maximumHp;
  }

  hasStatus(entityId: number, statusId: string): boolean {
    return this.statusesOf(entityId).has(statusId);
  }

  applyDamage(
    actorId: number,
    targetId: number,
    amount: number,
  ): AbilityDamageOutcome | null {
    const event = this.options.combat.applyAbilityDamage(
      actorId,
      targetId,
      amount,
      this.options.currentTick(),
    );
    if (!event) return null;
    this.options.onCombatEvent(event);
    // Damage earns hate on its own, exactly as a swing does.
    this.options.threat.addHate(
      targetId,
      actorId,
      event.damage,
      event.damage,
      this.options.currentTick(),
    );
    if (event.damage > 0) this.statusesOf(targetId).onDamaged();
    if (event.killed) {
      this.options.abilities?.openReactionWindows(actorId, "kill", this.options.nowMs());
    }
    return {
      damage: event.damage,
      targetCurrentHp: event.targetCurrentHp,
      targetMaximumHp: event.targetMaximumHp,
      killed: event.killed,
    };
  }

  applyHeal(
    actorId: number,
    targetId: number,
    amount: number,
  ): AbilityHealOutcome | null {
    const outcome = this.options.combat.applyAbilityHeal(actorId, targetId, amount);
    if (!outcome) return null;
    // Healing generates threat with everything currently fighting the healed ally, or
    // pulling would be free for any group with a Cleric in it.
    if (outcome.healed > 0) {
      this.options.threat.addHate(
        targetId,
        actorId,
        Math.round(outcome.healed / 2),
        0,
        this.options.currentTick(),
      );
    }
    return outcome;
  }

  applyStatus(
    targetId: number,
    statusId: string,
    durationMultiplier = 1,
    sourceEntityId = targetId,
  ): void {
    const definition = statusById(statusId);
    if (!definition) return;
    this.statusesOf(targetId).apply(definition, {
      nowMs: this.options.nowMs(),
      sourceEntityId,
      durationMs: Math.round(definition.durationMs * Math.max(0.1, durationMultiplier)),
    });
  }

  removeStatus(targetId: number, statusId: string | undefined, count: number): string[] {
    const statuses = this.statusesOf(targetId);
    if (statusId) {
      return statuses.remove(statusId) ? [statusId] : [];
    }
    // A dispel takes what is harmful, never the target's own buffs.
    const removed: string[] = [];
    statuses.removeWhere((status) => {
      if (removed.length >= count) return false;
      const harmful = status.definition.control !== undefined
        || status.definition.tick !== undefined;
      if (harmful) removed.push(status.definition.id);
      return harmful;
    }, count);
    return removed;
  }

  interrupt(targetId: number): boolean {
    // NPC casting is not modelled yet, so nothing is mid-cast to break. The stagger the
    // caller usually pairs with this is what the player actually feels; returning false
    // keeps the report honest rather than claiming a landed interrupt.
    void targetId;
    return false;
  }

  forceAttention(actorId: number, targetId: number, seconds: number): void {
    const plan = tauntPlan(
      this.options.threat,
      targetId,
      actorId,
      seconds * 1000,
      DEFAULT_THREAT_RULES,
    );
    this.options.threat.applyThreat(
      plan,
      this.options.currentTick(),
      this.options.nowMs(),
    );
  }

  addThreat(actorId: number, targetId: number, amount: number): void {
    this.options.threat.addHate(
      targetId,
      actorId,
      Math.max(0, Math.round(amount)),
      0,
      this.options.currentTick(),
    );
  }

  restoreResource(entityId: number, resource: ResourceType, amount: number): number {
    const runtime = this.options.abilities?.runtimeFor(entityId);
    if (!runtime) return 0;
    const pool = runtime.resourceOf(resource);
    const before = pool.current;
    pool.current = Math.min(pool.maximum, pool.current + Math.max(0, amount));
    return pool.current - before;
  }

  consumeResource(entityId: number, resource: ResourceType, amount: number): number {
    const runtime = this.options.abilities?.runtimeFor(entityId);
    if (!runtime) return 0;
    const pool = runtime.resourceOf(resource);
    const before = pool.current;
    pool.current = Math.max(0, pool.current - Math.max(0, amount));
    return before - pool.current;
  }

  moveToward(actorId: number, targetId: number, metres: number): number {
    const actor = this.options.entities.get(actorId);
    const target = this.options.entities.get(targetId);
    if (!actor || !target) return 0;
    const gap = distanceBetween(actor, target);
    // Stop short of standing inside the target: a gap-closer that lands on top of an
    // enemy pushes both out of the world's collision in the client.
    const travel = Math.min(metres, Math.max(0, gap - 2));
    if (travel <= 0) return 0;
    const scale = travel / (gap || 1);
    actor.position.set(
      actor.position.x + (target.position.x - actor.position.x) * scale,
      actor.position.y + (target.position.y - actor.position.y) * scale,
      actor.position.z + (target.position.z - actor.position.z) * scale,
    );
    return travel;
  }

  displace(actorId: number, targetId: number, metres: number): number {
    const actor = this.options.entities.get(actorId);
    const target = this.options.entities.get(targetId);
    if (!actor || !target) return 0;
    const gap = distanceBetween(actor, target) || 1;
    // Positive metres pull the target in; the sign is the author's, not the port's.
    const scale = -metres / gap;
    target.position.set(
      target.position.x + (target.position.x - actor.position.x) * scale,
      target.position.y + (target.position.y - actor.position.y) * scale,
      target.position.z + (target.position.z - actor.position.z) * scale,
    );
    return metres;
  }

  teleport(actorId: number, metres: number): number {
    const actor = this.options.entities.get(actorId);
    if (!actor) return 0;
    const heading = actor.heading;
    actor.position.set(
      actor.position.x - Math.sin(heading) * metres,
      actor.position.y,
      actor.position.z - Math.cos(heading) * metres,
    );
    return metres;
  }

  entitiesWithin(
    actorId: number,
    centreEntityId: number,
    radiusMetres: number,
    filter: "hostile" | "friendly",
    maxTargets: number,
  ): number[] {
    const centre = this.options.entities.get(centreEntityId)
      ?? this.options.entities.get(actorId);
    if (!centre) return [];
    return this.#within(
      actorId,
      { x: centre.position.x, y: centre.position.y, z: centre.position.z },
      radiusMetres,
      filter,
      maxTargets,
    );
  }

  #within(
    actorId: number,
    centre: { x: number; y: number; z: number },
    radiusMetres: number,
    filter: "hostile" | "friendly",
    maxTargets: number,
  ): number[] {
    const actor = this.options.entities.get(actorId);
    if (!actor) return [];
    this.#proximityQueries += 1;
    const found: { id: number; distance: number }[] = [];
    for (let index = 0; index < this.options.entities.count; index++) {
      this.#proximityVisits += 1;
      const candidate = this.options.entities.at(index);
      if (!candidate || !candidate.active || candidate.currentHp <= 0) continue;
      if (candidate.kind === EntityKind.corpse) continue;
      const hostile = candidate.kind !== actor.kind;
      if (filter === "hostile" ? !hostile : hostile) continue;
      // An authored radius is a ground-plane area, so height is tolerated rather than
      // spent — the same reason the single-target gate stopped using a 3D distance.
      // No body pad here: padding a radius would widen the effect, not merely stop it
      // refusing at a range the player can already reach.
      const separation = separationBetween(candidate.position, centre);
      if (!withinReach(separation, radiusMetres, AREA_REACH_RULES)) continue;
      found.push({ id: candidate.id, distance: separation.horizontalMetres });
    }
    // Nearest first, so a capped cleave hits what the player is standing in front of.
    found.sort((left, right) => left.distance - right.distance);
    return found.slice(0, Math.max(1, maxTargets)).map((entry) => entry.id);
  }

  scheduleProjectile(
    actorId: number,
    targetId: number,
    speedMetresPerSecond: number,
    onLand: () => void,
  ): number {
    const distance = this.distanceMetres(actorId, targetId) ?? 0;
    const flightMs = Math.max(
      0,
      Math.round((distance / Math.max(1, speedMetresPerSecond)) * 1000),
    );
    if (flightMs === 0) {
      onLand();
      return 0;
    }
    this.#projectiles.push({ landsAtMs: this.options.nowMs() + flightMs, onLand });
    return flightMs;
  }

  spawnArea(
    actorId: number,
    centreEntityId: number,
    radiusMetres: number,
    durationMs: number,
    filter: "hostile" | "friendly",
    onTick: (targetId: number) => void,
  ): void {
    const centre = this.options.entities.get(centreEntityId)
      ?? this.options.entities.get(actorId);
    if (!centre) return;
    const nowMs = this.options.nowMs();
    this.#areas.push({
      actorId,
      // The area is anchored where it was cast, not to whoever was targeted: a field of
      // brambles does not follow the enemy that walked out of it.
      centre: { x: centre.position.x, y: centre.position.y, z: centre.position.z },
      radiusMetres,
      filter,
      onTick,
      expiresAtMs: nowMs + durationMs,
      nextTickAtMs: nowMs + AREA_TICK_MS,
    });
  }

  openReaction(actorId: number, abilityId: string, windowMs: number): void {
    // Reaction windows live with the ability system, which owns cooldowns; the port only
    // reports the window an effect asked for.
    this.options.abilities?.grantReaction(
      actorId,
      abilityId,
      this.options.nowMs() + windowMs,
    );
  }

  revive(actorId: number, corpseId: number, resourcePercent: number): boolean {
    const corpse = this.options.entities.get(corpseId);
    if (!corpse || corpse.kind !== EntityKind.corpse) return false;
    this.options.combat.respawn(corpseId);
    corpse.currentHp = Math.max(
      1,
      Math.round(corpse.maximumHp * Math.max(0, Math.min(100, resourcePercent)) / 100),
    );
    void actorId;
    return true;
  }

  runScript(handler: string, actorId: number, targetId: number): boolean {
    const script = this.options.scripts?.[handler];
    if (!script) return false;
    script({ actorId, targetId, port: this, nowMs: this.options.nowMs() });
    return true;
  }
}

/** Private server flag marking an entity as undead. */
const UNDEAD_FLAG = 1 << 4;

/**
 * An authored radius is already the area the author wants, so it takes the height
 * tolerance but not the body pad a single-target reach needs.
 */
const AREA_REACH_RULES: ReachRules = Object.freeze({
  bodyPaddingMetres: 0,
  maximumVerticalSeparationMetres:
    DEFAULT_REACH_RULES.maximumVerticalSeparationMetres,
});

function distanceBetween(left: Entity, right: Entity): number {
  const dx = left.position.x - right.position.x;
  const dy = left.position.y - right.position.y;
  const dz = left.position.z - right.position.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
