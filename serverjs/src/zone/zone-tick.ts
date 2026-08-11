import type { NpcEngagementSystem, NpcPathRequest } from "../ai/npc-engagement.js";
import { OUT_OF_COMBAT_REGEN } from "../combat/combat-runtime.js";
import type { CombatEvent, MeleeCombatSystem } from "../combat/melee-combat.js";
import type { PlayerAbilitySystem } from "../combat/player-abilities.js";
import type { ZoneAbilityPort } from "../combat/zone-ability-port.js";
import { NPC } from "./entity-store.js";
import { advanceMovementRoute, type MovementRoute } from "./movement-routes.js";
import type { ZoneKernelSnapshot, ZoneSimulationKernel } from "./zone-kernel.js";

/**
 * The ordered gameplay half of a zone tick, run identically by both runtimes.
 *
 * The two tick loops had drifted, which is the failure `serverjs/CLAUDE.md` warns about
 * and is invisible until someone plays the path that is missing a step. Concretely, at
 * the time this was extracted: statuses expired and vigor regenerated in the offline
 * runtime and **not** on the live server, so the same Warrior recovered between pulls in
 * one and never in the other. The movement-route pass was a verbatim copy in both files.
 *
 * What belongs here is anything that decides what happens in the world. What stays with
 * each runtime is delivery — how a nav request is routed, how a combat event reaches a
 * client, how a snapshot is encoded and to whom. Those legitimately differ; a worker
 * posts messages and the offline backend calls listeners.
 */

export interface ZoneTickSystems {
  readonly kernel: ZoneSimulationKernel;
  readonly combat: MeleeCombatSystem;
  readonly engagement: NpcEngagementSystem;
  readonly abilities: PlayerAbilitySystem;
  readonly abilityPort: ZoneAbilityPort;
  /** Patrol routes, keyed by entity index. Mutated in place by the route advance. */
  readonly movementRoutes: ReadonlyMap<number, MovementRoute>;
  /** Indices whose route is paused because the NPC is fighting. */
  readonly suspendedMovementRoutes: Set<number>;
}

export interface ZoneTickInput {
  /** Milliseconds since the previous tick. */
  readonly deltaMs: number;
  /** Monotonic tick counter, used for threat bookkeeping and swing timing. */
  readonly tick: number;
  /** Simulation clock, used for routes, status expiry and forced attention. */
  readonly simulationTimeMs: number;
}

export interface ZoneTickResult {
  /** Paths the engagement system wants. Each runtime routes these its own way. */
  readonly pathRequests: readonly NpcPathRequest[];
  /** Swing outcomes. Each runtime publishes and turns kills into corpses and credit. */
  readonly combatEvents: readonly CombatEvent[];
  /** The arena after integration, for whoever encodes snapshots. */
  readonly snapshot: ZoneKernelSnapshot;
}

/**
 * Runs the gameplay steps in the order they must happen.
 *
 * The order is load-bearing and is the reason this is one function rather than a list of
 * helpers each runtime calls in its own sequence:
 *
 * 1. **Statuses expire** first, so a stun that ended this tick cannot suppress the
 *    action it was already too late to stop.
 * 2. **Resources regenerate** next, so an ability that becomes affordable this tick is
 *    affordable for the whole of it.
 * 3. **Engagement** decides who is chasing whom before anything moves.
 * 4. **Routes advance** only for NPCs engagement left alone, so a patrol cannot walk
 *    away from a fight it just joined.
 * 5. **Melee resolves** against positions from the previous integration, which is what
 *    makes "was in range when you swung" mean the same thing on both runtimes.
 * 6. **The kernel integrates** last, so the snapshot every client receives reflects
 *    every decision above.
 */
export function runZoneGameplayTick(
  systems: ZoneTickSystems,
  input: ZoneTickInput,
): ZoneTickResult {
  const { deltaMs, tick, simulationTimeMs } = input;

  systems.abilityPort.advance();
  systems.abilities.regenerate(deltaMs, OUT_OF_COMBAT_REGEN);

  const pathRequests = systems.engagement.tick(tick);
  advanceRoutes(systems, simulationTimeMs);
  const combatEvents = systems.combat.tick(tick);
  const snapshot = systems.kernel.tick(deltaMs);

  return { pathRequests, combatEvents, snapshot };
}

/**
 * Walks patrolling NPCs along their route, pausing any that are in combat.
 *
 * Resuming re-points the NPC at the waypoint it was heading for. Without that it would
 * keep whatever target the chase left behind and walk to wherever the fight ended.
 */
function advanceRoutes(systems: ZoneTickSystems, simulationTimeMs: number): void {
  for (const [entityIndex, route] of systems.movementRoutes) {
    const npc = systems.kernel.entities.at(entityIndex);
    if (!(npc instanceof NPC)) continue;
    if (systems.engagement.isEngaged(npc.id)) {
      systems.suspendedMovementRoutes.add(entityIndex);
      continue;
    }
    if (systems.suspendedMovementRoutes.delete(entityIndex)) {
      const target = route.points[route.targetIndex];
      if (target) npc.target.set(target.x, target.y, target.z);
    }
    advanceMovementRoute(npc, route, simulationTimeMs);
  }
}
