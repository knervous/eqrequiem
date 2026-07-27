import type { NPC } from "./entity-store.js";
import type { ZonePathPoint } from "./zone-content.js";

export interface MovementRoute {
  readonly points: readonly ZonePathPoint[];
  targetIndex: number;
  pauseUntilMs: number;
}

const ARRIVAL_DISTANCE_SQUARED = 0.0001;

/**
 * Advances one route against elapsed simulation time.
 *
 * The movement kernel owns integration. This phase only changes its target
 * when an NPC arrives or a waypoint pause expires.
 */
export function advanceMovementRoute(
  npc: NPC,
  route: MovementRoute,
  simulationTimeMs: number,
): void {
  if (route.points.length === 0) return;

  if (route.pauseUntilMs > 0) {
    if (simulationTimeMs < route.pauseUntilMs) return;
    route.pauseUntilMs = 0;
    const next = route.points[route.targetIndex]!;
    npc.target.set(next.x, next.y, next.z);
    return;
  }

  const target = route.points[route.targetIndex];
  if (!target) return;
  const dx = target.x - npc.position.x;
  const dy = target.y - npc.position.y;
  const dz = target.z - npc.position.z;
  if (dx * dx + dy * dy + dz * dz > ARRIVAL_DISTANCE_SQUARED) return;

  route.targetIndex = (route.targetIndex + 1) % route.points.length;
  const pauseMs = Math.max(0, target.pauseSeconds) * 1000;
  if (pauseMs > 0) {
    route.pauseUntilMs = simulationTimeMs + pauseMs;
    npc.target.set(npc.position.x, npc.position.y, npc.position.z);
    return;
  }

  const next = route.points[route.targetIndex]!;
  npc.target.set(next.x, next.y, next.z);
}
