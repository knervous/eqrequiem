import type { MeleeCombatSystem } from "../combat/melee-combat.js";
import {
  EntityKind,
  type Entity,
  type EntityStore,
  NPC,
} from "../zone/entity-store.js";

export interface NpcEngagementRules {
  readonly damageHateMultiplier: number;
  readonly minimumDamageHate: number;
  readonly repathIntervalTicks: number;
  readonly targetMovementRepathDistance: number;
  readonly waypointArrivalDistance: number;
  readonly directMovementWhilePathPending: boolean;
}

export const DEFAULT_NPC_ENGAGEMENT_RULES: NpcEngagementRules = Object.freeze({
  damageHateMultiplier: 1,
  minimumDamageHate: 1,
  repathIntervalTicks: 10,
  targetMovementRepathDistance: 1.5,
  waypointArrivalDistance: 0.75,
  directMovementWhilePathPending: true,
});

export interface NpcPathPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NpcPathRequest {
  readonly requestId: number;
  readonly npcId: number;
  readonly targetId: number;
  readonly start: NpcPathPoint;
  readonly end: NpcPathPoint;
}

export interface NpcHateEntrySnapshot {
  readonly entityId: number;
  readonly hate: number;
  readonly damage: number;
  readonly lastModifiedTick: number;
}

export type NpcNavigationStatus =
  | "idle"
  | "melee"
  | "path-pending"
  | "following-path"
  | "direct-fallback"
  | "no-target";

export interface NpcEngagementDiagnostic {
  readonly npcId: number;
  readonly tick: number;
  readonly engaged: boolean;
  readonly aggroTargetId: number;
  readonly position: NpcPathPoint;
  readonly movementTarget: NpcPathPoint;
  readonly moveSpeed: number;
  readonly hateList: readonly NpcHateEntrySnapshot[];
  readonly roam: {
    readonly suspended: boolean;
    readonly targetIndex: number;
    readonly pauseUntilMs: number;
    readonly path: readonly NpcPathPoint[];
  } | null;
  readonly navigation: {
    readonly status: NpcNavigationStatus;
    readonly requestId: number;
    readonly requestedAtTick: number;
    readonly nextRepathTick: number;
    readonly waypointIndex: number;
    readonly path: readonly NpcPathPoint[];
    readonly requestedDestination: NpcPathPoint | null;
    readonly error: string | null;
  };
}

interface MutableHateEntry {
  entityId: number;
  hate: number;
  damage: number;
  lastModifiedTick: number;
}

interface ChaseState {
  requestId: number;
  targetId: number;
  requestedAtTick: number;
  nextRepathTick: number;
  requestedDestination: NpcPathPoint | null;
  path: NpcPathPoint[];
  waypointIndex: number;
  status: NpcNavigationStatus;
  error: string | null;
}

const EMPTY_CHASE = (): ChaseState => ({
  requestId: 0,
  targetId: 0,
  requestedAtTick: 0,
  nextRepathTick: 0,
  requestedDestination: null,
  path: [],
  waypointIndex: 0,
  status: "idle",
  error: null,
});

/**
 * Authoritative, transport-neutral NPC engagement state.
 *
 * Hate selection, pursuit policy, and path-query lifecycle stay independent
 * from melee resolution and route content. Node workers and the embedded
 * runtime can therefore supply different pathfinding transports.
 */
export class NpcEngagementSystem {
  private readonly hateByNpc = new Map<number, Map<number, MutableHateEntry>>();
  private readonly chaseByNpc = new Map<number, ChaseState>();
  private readonly baseSpeedByNpc = new Map<number, number>();
  private nextRequestId = 1;

  constructor(
    private readonly entities: EntityStore,
    private readonly combat: MeleeCombatSystem,
    private readonly rules: NpcEngagementRules = DEFAULT_NPC_ENGAGEMENT_RULES,
  ) {
    validateRules(rules);
  }

  registerNpc(npc: NPC): void {
    this.baseSpeedByNpc.set(npc.id, npc.moveSpeed);
  }

  noteDamage(
    npcId: number,
    attackerId: number,
    damage: number,
    tick: number,
  ): void {
    const safeDamage = Math.max(0, Math.trunc(damage));
    const hate = Math.max(
      this.rules.minimumDamageHate,
      safeDamage * this.rules.damageHateMultiplier,
    );
    this.addHate(npcId, attackerId, hate, safeDamage, tick);
  }

  addHate(
    npcId: number,
    targetId: number,
    hate: number,
    damage: number,
    tick: number,
  ): void {
    const npc = this.entities.get(npcId);
    const target = this.entities.get(targetId);
    if (
      !(npc instanceof NPC)
      || npc.currentHp <= 0
      || target?.kind !== EntityKind.pc
      || target.currentHp <= 0
    ) {
      return;
    }
    const list = this.hateByNpc.get(npcId) ?? new Map<number, MutableHateEntry>();
    const entry = list.get(targetId) ?? {
      entityId: targetId,
      hate: 0,
      damage: 0,
      lastModifiedTick: tick,
    };
    entry.hate += Math.max(0, hate);
    entry.damage += Math.max(0, damage);
    entry.lastModifiedTick = tick;
    list.set(targetId, entry);
    this.hateByNpc.set(npcId, list);
  }

  clearEntity(entityId: number): void {
    this.clearNpc(entityId);
    for (const [npcId, list] of this.hateByNpc) {
      if (!list.delete(entityId)) continue;
      if (list.size === 0) this.clearNpc(npcId);
    }
  }

  clearNpc(npcId: number): void {
    this.hateByNpc.delete(npcId);
    this.chaseByNpc.delete(npcId);
    const npc = this.entities.get(npcId);
    if (npc instanceof NPC) {
      npc.aggroTargetId = 0;
      this.combat.stopNpcCombat(npcId);
    }
  }

  isEngaged(npcId: number): boolean {
    return (this.hateByNpc.get(npcId)?.size ?? 0) > 0;
  }

  tick(currentTick: number): NpcPathRequest[] {
    const requests: NpcPathRequest[] = [];
    for (const [npcId, list] of this.hateByNpc) {
      const npc = this.entities.get(npcId);
      if (!(npc instanceof NPC) || npc.currentHp <= 0) {
        this.clearNpc(npcId);
        continue;
      }
      this.pruneInvalidTargets(list);
      const top = topHateEntry(list);
      if (!top) {
        this.clearNpc(npcId);
        continue;
      }
      const target = this.entities.get(top.entityId);
      if (!target) continue;

      const chase = this.chaseByNpc.get(npcId) ?? EMPTY_CHASE();
      if (chase.targetId !== target.id) {
        invalidatePath(chase, target.id);
      }
      npc.aggroTargetId = target.id;
      npc.moveSpeed = this.baseSpeedByNpc.get(npcId) ?? npc.moveSpeed;
      this.combat.engageNpcTarget(npcId, target.id, currentTick);

      if (this.combat.isWithinMeleeReach(npcId, target.id)) {
        chase.status = "melee";
        chase.error = null;
        npc.target.set(npc.position.x, npc.position.y, npc.position.z);
        this.chaseByNpc.set(npcId, chase);
        continue;
      }

      advanceWaypoint(npc, chase, this.rules.waypointArrivalDistance);
      if (
        chase.path.length > 0
        && chase.waypointIndex >= chase.path.length
      ) {
        chase.path = [];
        chase.waypointIndex = 0;
      }
      const waypoint = chase.path[chase.waypointIndex];
      if (waypoint) {
        chase.status = "following-path";
        npc.target.set(waypoint.x, waypoint.y, waypoint.z);
      } else if (this.rules.directMovementWhilePathPending) {
        npc.target.set(target.position.x, target.position.y, target.position.z);
        if (chase.status !== "path-pending") chase.status = "direct-fallback";
      }

      if (shouldRequestPath(chase, target, currentTick, this.rules)) {
        const requestId = this.allocateRequestId();
        chase.requestId = requestId;
        chase.requestedAtTick = currentTick;
        chase.nextRepathTick = currentTick + this.rules.repathIntervalTicks;
        chase.requestedDestination = pointOf(target);
        chase.status = "path-pending";
        chase.error = null;
        requests.push({
          requestId,
          npcId,
          targetId: target.id,
          start: pointOf(npc),
          end: pointOf(target),
        });
      }
      this.chaseByNpc.set(npcId, chase);
    }
    return requests;
  }

  acceptPath(
    requestId: number,
    npcId: number,
    targetId: number,
    path: readonly NpcPathPoint[],
    error?: string,
  ): boolean {
    const chase = this.chaseByNpc.get(npcId);
    if (
      !chase
      || chase.requestId !== requestId
      || chase.targetId !== targetId
    ) {
      return false;
    }
    chase.requestId = 0;
    chase.error = error ?? null;
    chase.path = error ? [] : path.filter(isFinitePoint).map(copyPoint);
    chase.waypointIndex = 0;
    chase.status = chase.path.length > 0 ? "following-path" : "direct-fallback";
    return true;
  }

  diagnostic(npcId: number, tick: number): NpcEngagementDiagnostic | null {
    const npc = this.entities.get(npcId);
    if (!(npc instanceof NPC)) return null;
    const chase = this.chaseByNpc.get(npcId) ?? EMPTY_CHASE();
    return {
      npcId,
      tick,
      engaged: this.isEngaged(npcId),
      aggroTargetId: npc.aggroTargetId,
      position: pointOf(npc),
      movementTarget: {
        x: npc.target.x,
        y: npc.target.y,
        z: npc.target.z,
      },
      moveSpeed: npc.moveSpeed,
      hateList: sortedHate(this.hateByNpc.get(npcId)),
      roam: null,
      navigation: {
        status: chase.status,
        requestId: chase.requestId,
        requestedAtTick: chase.requestedAtTick,
        nextRepathTick: chase.nextRepathTick,
        waypointIndex: chase.waypointIndex,
        path: chase.path.map(copyPoint),
        requestedDestination: chase.requestedDestination
          ? copyPoint(chase.requestedDestination)
          : null,
        error: chase.error,
      },
    };
  }

  private pruneInvalidTargets(list: Map<number, MutableHateEntry>): void {
    for (const targetId of list.keys()) {
      const target = this.entities.get(targetId);
      if (target?.kind !== EntityKind.pc || target.currentHp <= 0) {
        list.delete(targetId);
      }
    }
  }

  private allocateRequestId(): number {
    const value = this.nextRequestId;
    this.nextRequestId = value === 0xffff_ffff ? 1 : value + 1;
    return value;
  }
}

function topHateEntry(
  list: ReadonlyMap<number, MutableHateEntry>,
): MutableHateEntry | null {
  return sortedHate(list)[0] ?? null;
}

function sortedHate(
  list: ReadonlyMap<number, MutableHateEntry> | undefined,
): NpcHateEntrySnapshot[] {
  return [...(list?.values() ?? [])]
    .sort(
      (a, b) =>
        b.hate - a.hate
        || b.damage - a.damage
        || a.entityId - b.entityId,
    )
    .map((entry) => ({ ...entry }));
}

function shouldRequestPath(
  chase: ChaseState,
  target: Entity,
  tick: number,
  rules: NpcEngagementRules,
): boolean {
  if (chase.requestId !== 0 || tick < chase.nextRepathTick) return false;
  if (!chase.requestedDestination || chase.path.length === 0) return true;
  return horizontalDistanceSquared(chase.requestedDestination, target.position)
    >= rules.targetMovementRepathDistance ** 2;
}

function advanceWaypoint(
  npc: NPC,
  chase: ChaseState,
  arrivalDistance: number,
): void {
  const distanceSquared = arrivalDistance ** 2;
  while (chase.waypointIndex < chase.path.length) {
    const point = chase.path[chase.waypointIndex]!;
    if (distanceSquared3d(point, npc.position) > distanceSquared) break;
    chase.waypointIndex += 1;
  }
}

function distanceSquared3d(
  a: { readonly x: number; readonly y: number; readonly z: number },
  b: { readonly x: number; readonly y: number; readonly z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function invalidatePath(chase: ChaseState, targetId: number): void {
  chase.requestId = 0;
  chase.targetId = targetId;
  chase.requestedAtTick = 0;
  chase.nextRepathTick = 0;
  chase.requestedDestination = null;
  chase.path = [];
  chase.waypointIndex = 0;
  chase.status = "no-target";
  chase.error = null;
}

function horizontalDistanceSquared(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function pointOf(entity: Entity): NpcPathPoint {
  return {
    x: entity.position.x,
    y: entity.position.y,
    z: entity.position.z,
  };
}

function copyPoint(point: NpcPathPoint): NpcPathPoint {
  return { x: point.x, y: point.y, z: point.z };
}

function isFinitePoint(point: NpcPathPoint): boolean {
  return [point.x, point.y, point.z].every(Number.isFinite);
}

function validateRules(rules: NpcEngagementRules): void {
  const nonnegative = [
    rules.damageHateMultiplier,
    rules.minimumDamageHate,
    rules.repathIntervalTicks,
    rules.targetMovementRepathDistance,
    rules.waypointArrivalDistance,
  ];
  if (!nonnegative.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new RangeError("NPC engagement rules must be finite and nonnegative");
  }
  if (rules.repathIntervalTicks < 1 || rules.waypointArrivalDistance <= 0) {
    throw new RangeError("NPC repath interval and waypoint radius must be positive");
  }
}
