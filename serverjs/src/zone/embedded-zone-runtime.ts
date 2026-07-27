import { encodeWorldStateDelta } from "../protocol/world-state.js";
import {
  MeleeCombatSystem,
  type CombatEvent,
  type CombatantStats,
} from "../combat/melee-combat.js";
import { npcCombatantStats } from "../combat/npc-combat.js";
import { CorpseLootSystem, type CorpseLootWindow } from "../combat/corpse-loot.js";
import { applyClientMovement } from "./client-movement.js";
import { EntityKind, NPC } from "./entity-store.js";
import {
  advanceMovementRoute,
  type MovementRoute,
} from "./movement-routes.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import { ZoneSimulationKernel } from "./zone-kernel.js";
import { eqHeadingToRadians } from "./heading.js";
import {
  DEFAULT_NPC_ENGAGEMENT_RULES,
  NpcEngagementSystem,
  type NpcEngagementDiagnostic,
  type NpcEngagementRules,
  type NpcPathPoint,
  type NpcPathRequest,
} from "../ai/npc-engagement.js";
import {
  captureZoneSnapshot,
  encodeZoneSnapshot,
  restoreZoneSnapshot,
  type ZoneSnapshot,
} from "./zone-snapshot.js";

export interface EmbeddedPlayerDefinition {
  readonly sessionId: number;
  readonly entityId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly level: number;
  readonly race: number;
  readonly gender: number;
  readonly charClass: number;
  readonly face: number;
  readonly combat: CombatantStats;
  readonly bind: {
    zoneId: number;
    instanceId: number;
    x: number;
    y: number;
    z: number;
    heading: number;
  };
}

export type ZoneKernelFactory = () => Promise<ZoneSimulationKernel>;
export interface EmbeddedDeathEvent {
  readonly victimId: number;
  readonly victimKind: "pc";
  readonly killerId: number;
  readonly corpseId: 0;
  readonly bindZoneId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

export interface EmbeddedZoneRuntimeOptions {
  readonly zoneId?: number;
  readonly instanceId?: number;
  readonly initialSnapshot?: ZoneSnapshot;
  readonly zoneKey?: string;
  readonly engagementRules?: NpcEngagementRules;
  readonly findPath?: (
    request: NpcPathRequest & { readonly zoneKey: string },
  ) => Promise<readonly NpcPathPoint[]>;
  readonly publishNpcDebug?: (
    sessionIds: readonly number[],
    diagnostic: NpcEngagementDiagnostic,
  ) => void;
}

export class EmbeddedZoneRuntime {
  private readonly movementRoutes = new Map<number, MovementRoute>();
  private readonly suspendedMovementRoutes = new Set<number>();
  private readonly playerIndices = new Map<number, number>();
  private readonly playerPositions = new Map<
    number,
    { x: number; y: number; z: number; heading: number }
  >();
  private readonly lastPlayerUpdateAt = new Map<number, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private simulationTimeMs = 0;
  private revision = 0;
  private lastTickAtMs = performance.now();
  private nextTickAtMs: number;
  private stopped = false;
  private readonly combat: MeleeCombatSystem;
  private readonly corpseLoot: CorpseLootSystem;
  private readonly playerDefinitions = new Map<number, EmbeddedPlayerDefinition>();
  private readonly npcDefinitions = new Map<number, ZoneNpcSpawnDefinition>();
  private readonly engagement: NpcEngagementSystem;

  private constructor(
    readonly kernel: ZoneSimulationKernel,
    private readonly publish: (
      sessionIds: readonly number[],
      payload: Uint8Array,
    ) => void,
    private readonly publishCombat: (
      sessionIds: readonly number[],
      event: CombatEvent,
    ) => void,
    private readonly publishDeath: (
      sessionId: number,
      event: EmbeddedDeathEvent,
    ) => void,
    private readonly tickPeriodMs: number,
    private readonly options: EmbeddedZoneRuntimeOptions,
  ) {
    this.nextTickAtMs = this.lastTickAtMs + tickPeriodMs;
    this.combat = new MeleeCombatSystem(kernel.entities, 1_000 / tickPeriodMs);
    this.engagement = new NpcEngagementSystem(
      kernel.entities,
      this.combat,
      options.engagementRules ?? DEFAULT_NPC_ENGAGEMENT_RULES,
    );
    this.corpseLoot = new CorpseLootSystem(kernel.entities);
  }

  static async create(
    definitions: readonly ZoneNpcSpawnDefinition[],
    kernelFactory: ZoneKernelFactory,
    publish: (
      sessionIds: readonly number[],
      payload: Uint8Array,
    ) => void,
    publishCombat: (
      sessionIds: readonly number[],
      event: CombatEvent,
    ) => void,
    publishDeath: (
      sessionId: number,
      event: EmbeddedDeathEvent,
    ) => void,
    tickRateHz = 10,
    options: EmbeddedZoneRuntimeOptions = {},
  ): Promise<EmbeddedZoneRuntime> {
    const kernel = await kernelFactory();
    const accepted = definitions.slice(0, kernel.capacity);
    const runtime = new EmbeddedZoneRuntime(
      kernel,
      publish,
      publishCombat,
      publishDeath,
      1000 / tickRateHz,
      options,
    );
    runtime.hydrateNpcs(accepted);
    if (options.initialSnapshot && options.zoneId !== undefined) {
      restoreZoneSnapshot(options.initialSnapshot, {
        zoneId: options.zoneId,
        instanceId: options.instanceId ?? 0,
        simulationTimeMs: runtime.simulationTimeMs,
        definitions: accepted,
        entities: runtime.kernel.entities,
        movementRoutes: runtime.movementRoutes,
        corpseLoot: runtime.corpseLoot,
      });
    }
    runtime.scheduleNextTick();
    return runtime;
  }

  joinPlayer(player: EmbeddedPlayerDefinition): void {
    this.leavePlayer(player.sessionId);
    const entity = this.kernel.entities.spawnPC({
      id: player.entityId,
      x: player.x,
      y: player.y,
      z: player.z,
    });
    const state = this.kernel.entities.publicState;
    const index = entity.index;
    state.stateLevel[index] = player.level;
    state.stateRace[index] = player.race;
    state.stateGender[index] = player.gender;
    state.stateClassId[index] = player.charClass;
    state.stateSize[index] = -1;
    state.stateFace[index] = player.face;
    entity.heading = eqHeadingToRadians(player.heading);
    entity.markDirty();
    this.combat.register(entity, player.combat);
    this.playerIndices.set(player.sessionId, index);
    this.playerPositions.set(player.sessionId, player);
    this.lastPlayerUpdateAt.set(player.sessionId, this.simulationTimeMs);
    this.playerDefinitions.set(player.sessionId, player);
    for (let visibleIndex = 0; visibleIndex < this.kernel.entities.count; visibleIndex++) {
      if (visibleIndex !== index && this.kernel.entities.at(visibleIndex)) {
        this.kernel.entities.markDirty(visibleIndex);
      }
    }
  }

  leavePlayer(sessionId: number): void {
    const index = this.playerIndices.get(sessionId);
    const entity = index === undefined ? undefined : this.kernel.entities.at(index);
    if (entity) {
      this.engagement.clearEntity(entity.id);
      this.kernel.entities.remove(entity);
    }
    this.playerIndices.delete(sessionId);
    this.playerPositions.delete(sessionId);
    this.lastPlayerUpdateAt.delete(sessionId);
    this.playerDefinitions.delete(sessionId);
  }

  applyClientUpdate(
    sessionId: number,
    position: { x: number; y: number; z: number; heading: number },
  ): void {
    const index = this.playerIndices.get(sessionId);
    const entity = index === undefined ? undefined : this.kernel.entities.at(index);
    if (!entity) return;
    const previous = this.playerPositions.get(sessionId);
    const previousAt = this.lastPlayerUpdateAt.get(sessionId) ?? this.simulationTimeMs;
    applyClientMovement(
      entity,
      previous,
      position,
      this.simulationTimeMs - previousAt,
    );
    this.playerPositions.set(sessionId, position);
    this.lastPlayerUpdateAt.set(sessionId, this.simulationTimeMs);
  }

  setAutoAttack(sessionId: number, enabled: boolean, targetId: number): void {
    const index = this.playerIndices.get(sessionId);
    const attacker = index === undefined ? undefined : this.kernel.entities.at(index);
    const event = this.combat.setAutoAttack(
      attacker?.id ?? 0,
      targetId,
      enabled,
      this.revision,
    );
    this.updateHateFromCombatEvent(event);
    this.publishCombat([sessionId], event);
  }

  lootWindow(sessionId: number, corpseId: number): CorpseLootWindow | null {
    const index = this.playerIndices.get(sessionId);
    const looter = index === undefined ? undefined : this.kernel.entities.at(index);
    return looter ? this.corpseLoot.open(looter.id, corpseId) : null;
  }

  takeLoot(
    sessionId: number,
    corpseId: number,
    lootSlot: number,
  ): Record<string, unknown> | null {
    const index = this.playerIndices.get(sessionId);
    const looter = index === undefined ? undefined : this.kernel.entities.at(index);
    return looter
      ? this.corpseLoot.take(looter.id, corpseId, lootSlot)
      : null;
  }

  restoreLoot(corpseId: number, item: Record<string, unknown>): void {
    this.corpseLoot.restore(corpseId, item);
  }

  merchant(
    sessionId: number,
    npcId: number,
  ): ZoneNpcSpawnDefinition | null {
    const playerIndex = this.playerIndices.get(sessionId);
    const player = playerIndex === undefined
      ? undefined
      : this.kernel.entities.at(playerIndex);
    const npc = this.kernel.entities.get(npcId);
    const definition = this.npcDefinitions.get(npcId);
    if (
      !player
      || !npc
      || !definition?.merchant
      || npc.kind !== EntityKind.npc
      || npc.currentHp <= 0
      || this.engagement.isEngaged(npcId)
    ) return null;
    const distance = Math.hypot(
      player.position.x - npc.position.x,
      player.position.y - npc.position.y,
      player.position.z - npc.position.z,
    );
    return distance <= definition.merchant.interactionRange ? definition : null;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  snapshotBlob(): Uint8Array {
    const zoneId = this.options.zoneId;
    if (zoneId === undefined) {
      throw new Error("Embedded zone runtime has no persistent zone identity");
    }
    return encodeZoneSnapshot(captureZoneSnapshot({
      zoneId,
      instanceId: this.options.instanceId ?? 0,
      tick: this.revision,
      simulationTimeMs: this.simulationTimeMs,
      definitions: [...this.npcDefinitions.values()],
      entities: this.kernel.entities,
      movementRoutes: this.movementRoutes,
      corpseLoot: this.corpseLoot,
    }));
  }

  persistentIdentity(): { readonly zoneId: number; readonly instanceId: number } {
    const zoneId = this.options.zoneId;
    if (zoneId === undefined) {
      throw new Error("Embedded zone runtime has no persistent zone identity");
    }
    return { zoneId, instanceId: this.options.instanceId ?? 0 };
  }

  npcState(spawnId: number): {
    readonly kind: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly heading: number;
    readonly currentHp: number;
    readonly maximumHp: number;
  } | null {
    const entity = this.kernel.entities.get(spawnId);
    if (
      !entity
      || (entity.kind !== EntityKind.npc && entity.kind !== EntityKind.corpse)
    ) return null;
    return {
      kind: entity.kind,
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
      heading: entity.heading,
      currentHp: entity.currentHp,
      maximumHp: entity.maximumHp,
    };
  }

  private hydrateNpcs(definitions: readonly ZoneNpcSpawnDefinition[]): void {
    const state = this.kernel.entities.publicState;
    for (let index = 0; index < definitions.length; index++) {
      const spawn = definitions[index]!;
      this.npcDefinitions.set(spawn.spawnId, spawn);
      const npc = this.kernel.entities.spawnNPCAt(index, {
        id: spawn.spawnId,
        x: spawn.x,
        y: spawn.y,
        z: spawn.z,
        speed: Math.max(0, spawn.movementSpeed * 5),
      });
      state.stateArchetypeId[index] = spawn.npcArchetypeId;
      state.stateLevel[index] = spawn.level;
      state.stateRace[index] = spawn.race;
      state.stateGender[index] = spawn.gender;
      state.stateClassId[index] = spawn.charClass;
      state.stateBodyType[index] = spawn.bodyType;
      state.stateSize[index] = spawn.size;
      state.stateFace[index] = spawn.face;
      state.stateHelm[index] = spawn.helm;
      state.stateChest[index] = spawn.equipChest;
      state.statePrimary[index] = spawn.primary;
      state.stateSecondary[index] = spawn.secondary;
      npc.heading = eqHeadingToRadians(spawn.heading);
      npc.markDirty();
      this.combat.register(npc, npcCombatantStats(spawn));
      this.engagement.registerNpc(npc);
      this.corpseLoot.registerSpawn(spawn.spawnId, spawn.name, spawn.lootItems);
      if (spawn.path.length > 0) {
        const targetIndex = spawn.path.length > 1 ? 1 : 0;
        this.movementRoutes.set(index, {
          points: spawn.path,
          targetIndex,
          pauseUntilMs: 0,
        });
        const target = spawn.path[targetIndex]!;
        npc.target.set(target.x, target.y, target.z);
      }
    }
  }

  private scheduleNextTick(): void {
    if (this.stopped) return;
    this.timer = setTimeout(
      () => this.runTick(),
      Math.max(0, this.nextTickAtMs - performance.now()),
    );
  }

  private runTick(): void {
    if (this.stopped) return;
    const nowMs = performance.now();
    const deltaMs = Math.max(0, nowMs - this.lastTickAtMs);
    this.lastTickAtMs = nowMs;
    this.simulationTimeMs += deltaMs;
    this.revision += 1;

    for (const request of this.engagement.tick(this.revision)) {
      const pathfinder = this.options.findPath;
      const zoneKey = this.options.zoneKey;
      if (!pathfinder || !zoneKey) {
        this.engagement.acceptPath(
          request.requestId,
          request.npcId,
          request.targetId,
          [],
          "No embedded navmesh is available for this zone",
        );
        continue;
      }
      void pathfinder({ ...request, zoneKey }).then(
        (path) => {
          this.engagement.acceptPath(
            request.requestId,
            request.npcId,
            request.targetId,
            path,
          );
        },
        (error: unknown) => {
          this.engagement.acceptPath(
            request.requestId,
            request.npcId,
            request.targetId,
            [],
            error instanceof Error ? error.message : String(error),
          );
        },
      );
    }

    for (const event of this.combat.tick(this.revision)) {
      this.updateHateFromCombatEvent(event);
      const attacker = this.kernel.entities.get(event.attackerId);
      const owner = attacker
        ? [...this.playerIndices].find(([, index]) => index === attacker.index)
        : undefined;
      const target = this.kernel.entities.get(event.targetId);
      const targetOwner = target
        ? [...this.playerIndices].find(([, index]) => index === target.index)
        : undefined;
      const recipients = new Set<number>();
      if (owner) recipients.add(owner[0]);
      if (targetOwner) recipients.add(targetOwner[0]);
      if (recipients.size > 0) this.publishCombat([...recipients], event);
      if (event.killed) {
        if (target) {
          this.movementRoutes.delete(target.index);
          if (target.kind === EntityKind.npc) {
            this.corpseLoot.createCorpse(target);
          } else if (target.kind === EntityKind.pc && targetOwner) {
            const definition = this.playerDefinitions.get(targetOwner[0]);
            if (definition) {
              this.publishDeath(targetOwner[0], {
                victimId: target.id,
                victimKind: "pc",
                killerId: event.attackerId,
                corpseId: 0,
                bindZoneId: definition.bind.zoneId,
                x: definition.bind.x,
                y: definition.bind.y,
                z: definition.bind.z,
                heading: definition.bind.heading,
              });
              target.position.set(
                definition.bind.x,
                definition.bind.y,
                definition.bind.z,
              );
              target.heading = eqHeadingToRadians(definition.bind.heading);
              this.combat.respawn(target.id);
              this.playerPositions.set(targetOwner[0], {
                x: definition.bind.x,
                y: definition.bind.y,
                z: definition.bind.z,
                heading: definition.bind.heading,
              });
            }
          }
        }
      }
    }

    for (const [index, route] of this.movementRoutes) {
      const npc = this.kernel.entities.at(index);
      if (npc instanceof NPC) {
        if (this.engagement.isEngaged(npc.id)) {
          this.suspendedMovementRoutes.add(index);
          continue;
        }
        if (this.suspendedMovementRoutes.delete(index)) {
          const target = route.points[route.targetIndex];
          if (target) npc.target.set(target.x, target.y, target.z);
        }
        advanceMovementRoute(npc, route, this.simulationTimeMs);
      }
    }

    if (this.options.publishNpcDebug && this.revision % 2 === 0) {
      const sessionIds = [...this.playerIndices.keys()];
      for (let index = 0; index < this.kernel.entities.count; index++) {
        const npc = this.kernel.entities.at(index);
        if (!(npc instanceof NPC)) continue;
        const base = this.engagement.diagnostic(npc.id, this.revision);
        if (!base) continue;
        const route = this.movementRoutes.get(index);
        this.options.publishNpcDebug(sessionIds, {
          ...base,
          roam: route
            ? {
                suspended: this.engagement.isEngaged(npc.id),
                targetIndex: route.targetIndex,
                pauseUntilMs: route.pauseUntilMs,
                path: route.points.map((point) => ({
                  x: point.x,
                  y: point.y,
                  z: point.z,
                })),
              }
            : null,
        });
      }
    }

    const snapshot = this.kernel.tick(deltaMs);
    if (snapshot.dirtyIndices.length > 0 && this.playerIndices.size > 0) {
      for (const [sessionId, ownIndex] of this.playerIndices) {
        const indices = [...snapshot.dirtyIndices].filter(
          (index) => index !== ownIndex,
        );
        if (indices.length === 0) continue;
        this.publish(
          [sessionId],
          encodeWorldStateDelta(snapshot.state, indices, this.revision),
        );
      }
    }

    do {
      this.nextTickAtMs += this.tickPeriodMs;
    } while (this.nextTickAtMs <= performance.now());
    this.scheduleNextTick();
  }

  private updateHateFromCombatEvent(event: CombatEvent): void {
    const attacker = this.kernel.entities.get(event.attackerId);
    const target = this.kernel.entities.get(event.targetId);
    if (attacker?.kind === EntityKind.pc && target?.kind === EntityKind.npc) {
      if (event.outcome === "hit" && !event.killed) {
        this.engagement.noteDamage(target.id, attacker.id, event.damage, event.tick);
      }
    }
    if (event.killed) this.engagement.clearEntity(event.targetId);
  }
}
