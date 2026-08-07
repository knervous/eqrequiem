import { parentPort, workerData } from "node:worker_threads";

import { OP } from "../protocol/opcodes.js";
import { MeleeCombatSystem, type CombatEvent } from "../combat/melee-combat.js";
import { npcCombatantStats } from "../combat/npc-combat.js";
import { CorpseLootSystem } from "../combat/corpse-loot.js";
import {
  NpcEngagementSystem,
  type NpcEngagementRules,
} from "../ai/npc-engagement.js";
import {
  type RenderSnapshotNetBatchView,
} from "../protocol/generated/net-structs.js";
import { encodeWorldStateDelta } from "../protocol/world-state.js";
import { decodeSidecar, SIDECAR_SCHEMA } from "../protocol/sidecar-codec.js";
import type {
  ZoneWorkerInboundMessage,
  ZoneWorkerOutboundMessage,
} from "./worker-types.js";
import { EntityKind, NPC } from "./entity-store.js";
import { ZoneSimulationKernel } from "./zone-kernel.js";
import { loadZoneSimulationKernel } from "./zone-kernel-node.js";
import { QuestManager } from "./quest-manager.js";
import {
  isPersistentQuestEffect,
  type QuestDefinition,
  type QuestEffect,
  type QuestPersistentEffect,
} from "./quest-types.js";
import { questDefinitionsForZone, questRegistryForZone } from "./quest-zone-registry.js";
import { combatExperience, splitGroupExperience } from "./quest-progression.js";
import { worldHourAt } from "./world-clock.js";
import { ZoneSpatialIndex } from "./spatial-index.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import {
  advanceMovementRoute,
  type MovementRoute,
} from "./movement-routes.js";
import { applyClientMovement } from "./client-movement.js";
import { eqHeadingToRadians } from "./heading.js";
import {
  captureZoneSnapshot,
  decodeZoneSnapshot,
  encodeZoneSnapshot,
  restoreZoneSnapshot,
  ZONE_SNAPSHOT_FORMAT_VERSION,
} from "./zone-snapshot.js";

interface WorkerBootstrap {
  zoneId: number;
  instanceId: number;
  tickRateHz: number;
  workBudgetMs: number;
  questDefinitions: QuestDefinition[];
  questRevision: number;
  engagementRules: NpcEngagementRules;
  devDiagnostics: boolean;
}

const port = parentPort;
if (!port) {
  process.exit(1);
}
const workerPort = port;

const {
  zoneId,
  instanceId,
  tickRateHz,
  workBudgetMs,
  questDefinitions,
  questRevision,
  engagementRules,
  devDiagnostics,
} = workerData as WorkerBootstrap;
type QueuedZoneWorkerMessage = Exclude<
  ZoneWorkerInboundMessage,
  { type: "shutdown_commit" }
>;
const queue: QueuedZoneWorkerMessage[] = [];
const opcodeCounters = new Map<number, number>();
const positions = new Map<
  number,
  { x: number; y: number; z: number; heading: number }
>();
const clientJoins = new Map<
  number,
  Extract<ZoneWorkerInboundMessage, { type: "client_join" }>
>();
const clientEntityIndices = new Map<number, number>();
const entityOwnerSessions = new Map<number, number>();
const lastClientUpdateAt = new Map<number, number>();
const chatRing: Array<{ sessionId: number; message: string }> = [];
const clientNames = new Map<number, string>();
const spatial = new ZoneSpatialIndex(300, 1);
const visibleEntitiesBySession = new Map<number, Set<number>>();
const pendingAoiChanges = new Map<number, { entered: Set<number>; exited: Set<number> }>();
const movementRoutes = new Map<number, MovementRoute>();
const npcSpawnsByIndex = new Map<number, ZoneNpcSpawnDefinition>();
const suspendedMovementRoutes = new Set<number>();
let stopping = false;
let kernel: ZoneSimulationKernel | null = null;
let combat: MeleeCombatSystem | null = null;
let corpseLoot: CorpseLootSystem | null = null;
let engagement: NpcEngagementSystem | null = null;
let pendingNpcs: readonly ZoneNpcSpawnDefinition[] | null = null;
let pendingSnapshotBlob: Uint8Array | undefined;
let zoneKey = "";
let contentHydrated = false;
let npcCount = 0;
let tick = 0;
let simulationTimeMs = 0;
let lastTickAtMs = performance.now();
const zoneQuestRegistry = questRegistryForZone(zoneId);
const quests = new QuestManager(
  zoneId,
  instanceId,
  zoneQuestRegistry?.zone.shortName ?? null,
  { tickRateHz },
);
quests.replace([...questDefinitionsForZone(zoneId), ...questDefinitions], questRevision);

void loadZoneSimulationKernel()
  .then((loaded) => {
    kernel = loaded;
    combat = new MeleeCombatSystem(loaded.entities, tickRateHz);
    engagement = new NpcEngagementSystem(loaded.entities, combat, engagementRules);
    corpseLoot = new CorpseLootSystem(loaded.entities);
    if (pendingNpcs) hydrateNpcs(pendingNpcs, pendingSnapshotBlob);
    ensureClientEntities();
    applyQuestEffects(quests.dispatch({ type: "zone_start", tick }));
    post({
      type: "log",
      level: "info",
      zoneId,
      instanceId,
      message: "Precompiled AssemblyScript zone kernel ready",
      meta: { capacity: loaded.capacity, npcCount, cellSize: spatial.cellSize },
    });
  })
  .catch((error: unknown) => {
    post({
      type: "log",
      level: "error",
      zoneId,
      instanceId,
      message: "Failed to load zone kernel",
      meta: { error: error instanceof Error ? error.message : String(error) },
    });
  });

workerPort.on("message", (message: ZoneWorkerInboundMessage) => {
  if (message.type === "shutdown_commit") {
    post({
      type: "log",
      level: message.persisted ? "info" : "warn",
      zoneId,
      instanceId,
      message: message.persisted
        ? "Zone snapshot persisted; worker exiting"
        : "Zone snapshot persistence failed; worker exiting",
    });
    process.exit(message.persisted ? 0 : 1);
    return;
  }
  queue.push(message);
});

const tickPeriodMs = 1000 / tickRateHz;
let nextTickAtMs = lastTickAtMs + tickPeriodMs;
let timer: NodeJS.Timeout;

function scheduleNextTick(): void {
  timer = setTimeout(runZoneTick, Math.max(0, nextTickAtMs - performance.now()));
}

function runZoneTick(): void {
  tick += 1;
  const start = Date.now();
  let processed = 0;

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) {
      break;
    }

    if (item.type === "shutdown") {
      stopping = true;
      break;
    }

    if (item.type === "quest_update") {
      quests.replace([...questDefinitionsForZone(zoneId), ...item.definitions], item.revision);
      post({
        type: "log",
        level: "info",
        zoneId,
        instanceId,
        message: "Zone quests reloaded",
        meta: quests.status,
      });
      continue;
    }

    if (item.type === "quest_hydrate") {
      quests.hydrate({ npcs: item.npcs });
      continue;
    }

    if (item.type === "quest_character") {
      quests.attachCharacter(item.sessionId, item.snapshot);
      continue;
    }

    if (item.type === "quest_progression") {
      quests.setCharacterProgression(item.sessionId, item.experience, item.level);
      if (item.leveled) {
        applyQuestEffects(quests.dispatchLevelUp({
          tick,
          sessionId: item.sessionId,
          level: item.level,
          previousLevel: item.previousLevel,
        }));
      }
      continue;
    }

    if (item.type === "zone_hydrate") {
      zoneKey = item.zoneKey;
      pendingNpcs = item.npcs;
      pendingSnapshotBlob = item.snapshotBlob;
      if (kernel) hydrateNpcs(item.npcs, item.snapshotBlob);
      continue;
    }

    if (item.type === "nav_path_result") {
      engagement?.acceptPath(
        item.requestId,
        item.npcId,
        item.targetId,
        item.path,
        item.error,
      );
      continue;
    }

    if (item.type === "loot_restore") {
      corpseLoot?.restore(item.corpseId, item.item);
      continue;
    }

    if (item.type === "client_join") {
      clientJoins.set(item.sessionId, item);
      positions.set(item.sessionId, {
        x: item.x,
        y: item.y,
        z: item.z,
        heading: item.heading,
      });
      clientNames.set(item.sessionId, item.characterName);
      spatial.upsertSession(item.sessionId, item);
      const visibleEntities = new Set(spatial.entitiesForSession(item.sessionId));
      visibleEntitiesBySession.set(item.sessionId, visibleEntities);
      ensureClientEntity(item.sessionId);
      applyQuestEffects(quests.dispatch({
        type: "player_enter",
        tick,
        sessionId: item.sessionId,
        actorName: item.characterName,
        actor: {
          kind: "player",
          sessionId: item.sessionId,
          name: item.characterName,
          position: { x: item.x, y: item.y, z: item.z, heading: item.heading },
        },
      }));
      continue;
    }

    if (item.type === "client_leave") {
      removeClient(item.sessionId);
      continue;
    }

    processed += 1;
    opcodeCounters.set(item.opcode, (opcodeCounters.get(item.opcode) ?? 0) + 1);
    handleZoneOpcode(item.opcode, item.sessionId, item.payload);

    if (Date.now() - start >= workBudgetMs) {
      break;
    }
  }

  const nowMs = performance.now();
  const deltaMs = Math.max(0, nowMs - lastTickAtMs);
  lastTickAtMs = nowMs;
  simulationTimeMs += deltaMs;

  quests.setWorldContext({ timeOfDay: worldHourAt(Date.now()) });
  applyQuestEffects(quests.dispatch({ type: "npc_tick", tick }));
  applyQuestEffects(quests.advanceTimers(tick));
  for (const request of engagement?.tick(tick) ?? []) {
    if (!zoneKey) continue;
    post({
      type: "nav_path_request",
      zoneKey,
      zoneId,
      instanceId,
      request,
    });
  }
  advanceMovementRoutes();
  for (const event of combat?.tick(tick) ?? []) {
    updateHateFromCombatEvent(event);
    publishCombatEvent(event);
  }
  if (devDiagnostics && tick % Math.max(1, Math.round(tickRateHz / 5)) === 0) {
    publishNpcDiagnostics();
  }

  const snapshot = kernel?.tick(deltaMs);
  if (snapshot && snapshot.dirtyIndices.length > 0) {
    const state = snapshot.state;
    const indicesBySession = new Map<number, number[]>();
    for (const index of snapshot.dirtyIndices) {
      const offset = index * 3;
      const previousRecipients = spatial.recipientsForEntity(index);
      if (state.stateKind[index] === 0) {
        spatial.removeEntity(index);
      } else {
        spatial.upsertEntity(index, {
          x: state.statePosition[offset]!,
          y: state.statePosition[offset + 1]!,
          z: state.statePosition[offset + 2]!,
        });
      }
      const recipients = spatial.recipientsForEntity(index);
      syncEntityVisibility(index, previousRecipients, recipients);
      const ownerSessionId = entityOwnerSessions.get(index);
      for (const sessionId of recipients) {
        if (sessionId === ownerSessionId) continue;
        const indices = indicesBySession.get(sessionId) ?? [];
        indices.push(index);
        indicesBySession.set(sessionId, indices);
      }
    }
    const recipientGroups = new Map<string, { indices: number[]; sessionIds: number[] }>();
    for (const [sessionId, indices] of indicesBySession) {
      const key = indices.join(",");
      const group = recipientGroups.get(key) ?? { indices, sessionIds: [] };
      group.sessionIds.push(sessionId);
      recipientGroups.set(key, group);
    }
    // AOI spawn/delete control packets must be queued before a delta for the
    // same entity. Worker messages preserve this order.
    flushAoiChanges();
    for (const group of recipientGroups.values()) {
      post({
        type: "snapshot",
        zoneId,
        instanceId,
        sessionIds: group.sessionIds,
        payload: packSnapshot(state, group.indices),
      });
    }
  }
  else {
    flushAoiChanges();
  }

  post({
    type: "metrics",
    zoneId,
    instanceId,
    queueDepth: queue.length,
    processedThisTick: processed,
    tick,
    npcCount,
    sessionCount: positions.size,
    questRevision: quests.status.revision,
    questCount: quests.status.questCount,
  });

  if (stopping) {
    clearTimeout(timer);
    try {
      const loaded = kernel;
      if (!loaded || !pendingNpcs) {
        post({
          type: "persistent_snapshot",
          zoneId,
          instanceId,
          formatVersion: ZONE_SNAPSHOT_FORMAT_VERSION,
        });
        return;
      }
      const blobData = encodeZoneSnapshot(captureZoneSnapshot({
        zoneId,
        instanceId,
        tick,
        simulationTimeMs,
        definitions: pendingNpcs ?? [],
        entities: loaded.entities,
        movementRoutes,
        corpseLoot: corpseLoot!,
      }));
      post({
        type: "persistent_snapshot",
        zoneId,
        instanceId,
        formatVersion: ZONE_SNAPSHOT_FORMAT_VERSION,
        blobData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      post({
        type: "log",
        level: "error",
        zoneId,
        instanceId,
        message: "Zone snapshot capture failed",
        meta: { error: message },
      });
      post({
        type: "persistent_snapshot",
        zoneId,
        instanceId,
        formatVersion: ZONE_SNAPSHOT_FORMAT_VERSION,
        error: message,
      });
    }
    return;
  }

  do {
    nextTickAtMs += tickPeriodMs;
  } while (nextTickAtMs <= performance.now());
  scheduleNextTick();
}

scheduleNextTick();

function handleZoneOpcode(
  opcode: number,
  sessionId: number,
  payload: Uint8Array,
): void {
  switch (opcode) {
    case OP.REQUEST_CLIENT_ZONE_CHANGE:
    case OP.ANIMATION:
    case OP.CAMP:
    case OP.GM_COMMAND:
    case OP.MOVE_ITEM:
    case OP.DELETE_ITEM:
      return;
    case OP.CLIENT_UPDATE:
      handleClientUpdate(sessionId, payload);
      return;
    case OP.AUTO_ATTACK:
      handleAutoAttack(sessionId, payload);
      return;
    case OP.LOOT_REQUEST:
      handleLootRequest(sessionId, payload);
      return;
    case OP.LOOT_ITEM:
      handleLootItem(sessionId, payload);
      return;
    case OP.MERCHANT_OPEN:
      handleMerchantIntent("open", sessionId, payload);
      return;
    case OP.MERCHANT_BUY:
      handleMerchantIntent("buy", sessionId, payload);
      return;
    case OP.MERCHANT_SELL:
      handleMerchantIntent("sell", sessionId, payload);
      return;
    case OP.CHANNEL_MESSAGE:
      handleChannelMessage(sessionId, payload);
      return;
    default:
      post({
        type: "log",
        level: "warn",
        zoneId,
        instanceId,
        message: "Unhandled opcode reached worker",
        meta: { opcode, sessionId },
      });
  }
}

function handleMerchantIntent(
  action: "open" | "buy" | "sell",
  sessionId: number,
  payload: Uint8Array,
): void {
  const schema = action === "open"
    ? SIDECAR_SCHEMA.MERCHANT_OPEN
    : action === "buy"
    ? SIDECAR_SCHEMA.MERCHANT_BUY
    : SIDECAR_SCHEMA.MERCHANT_SELL;
  const value = decodeSidecar<Record<string, unknown>>(schema, payload);
  const npcId = Number(value?.npcId);
  const join = clientJoins.get(sessionId);
  const playerIndex = clientEntityIndices.get(sessionId);
  const player = playerIndex === undefined ? undefined : kernel?.entities.at(playerIndex);
  const npc = Number.isSafeInteger(npcId) ? kernel?.entities.get(npcId) : undefined;
  const definition = pendingNpcs?.find((spawn) => spawn.spawnId === npcId);
  const merchant = definition?.merchant;
  const reject = (message: string) => post({
    type: "merchant_error",
    zoneId,
    instanceId,
    sessionId,
    npcId: Number.isSafeInteger(npcId) ? npcId : 0,
    message,
  });
  if (!value || !join || !player || !npc || !definition || !merchant) {
    reject("That NPC is not available as a merchant.");
    return;
  }
  if (
    npc.kind !== EntityKind.npc
    || npc.currentHp <= 0
    || engagement?.isEngaged(npc.id)
  ) {
    reject("That merchant is busy right now.");
    return;
  }
  const distance = Math.hypot(
    player.position.x - npc.position.x,
    player.position.y - npc.position.y,
    player.position.z - npc.position.z,
  );
  if (distance > merchant.interactionRange) {
    reject("You are too far away from that merchant.");
    return;
  }
  const message = {
    type: "merchant_intent" as const,
    zoneId,
    instanceId,
    sessionId,
    characterId: join.characterId,
    npcId,
    npcArchetypeId: definition.npcArchetypeId,
    merchantName: definition.name,
    action,
  };
  if (action === "buy") {
    const merchantSlot = Number(value.merchantSlot);
    const quantity = Number(value.quantity);
    if (!Number.isSafeInteger(merchantSlot) || !Number.isSafeInteger(quantity)) {
      reject("Invalid merchant purchase.");
      return;
    }
    post({ ...message, merchantSlot, quantity });
    return;
  }
  if (action === "sell") {
    const slot = Number(value.slot);
    const bag = Number(value.bag);
    const quantity = Number(value.quantity);
    if (
      !Number.isSafeInteger(slot)
      || !Number.isSafeInteger(bag)
      || !Number.isSafeInteger(quantity)
    ) {
      reject("Invalid merchant sale.");
      return;
    }
    post({ ...message, slot, bag, quantity });
    return;
  }
  post(message);
}

function handleLootRequest(sessionId: number, payload: Uint8Array): void {
  const value = decodeSidecar<{ corpseId?: unknown }>(
    SIDECAR_SCHEMA.LOOT_REQUEST,
    payload,
  );
  const corpseId = Number(value?.corpseId);
  const index = clientEntityIndices.get(sessionId);
  const looter = index === undefined ? undefined : kernel?.entities.at(index);
  if (!Number.isSafeInteger(corpseId) || !looter) return;
  const window = corpseLoot?.open(looter.id, corpseId);
  if (!window) return;
  post({
    type: "loot_window",
    zoneId,
    instanceId,
    sessionId,
    corpseId,
    corpseName: window.corpseName,
    items: [...window.items],
  });
}

function handleLootItem(sessionId: number, payload: Uint8Array): void {
  const value = decodeSidecar<{
    corpseId?: unknown;
    lootSlot?: unknown;
  }>(SIDECAR_SCHEMA.LOOT_ITEM, payload);
  const corpseId = Number(value?.corpseId);
  const lootSlot = Number(value?.lootSlot);
  const index = clientEntityIndices.get(sessionId);
  const looter = index === undefined ? undefined : kernel?.entities.at(index);
  const join = clientJoins.get(sessionId);
  if (
    !Number.isSafeInteger(corpseId)
    || !Number.isSafeInteger(lootSlot)
    || !looter
    || !join
  ) return;
  const item = corpseLoot?.take(looter.id, corpseId, lootSlot);
  if (!item) return;
  post({
    type: "loot_award",
    zoneId,
    instanceId,
    sessionId,
    characterId: join.characterId,
    looterId: looter.id,
    corpseId,
    item,
  });
  const remaining = corpseLoot?.open(looter.id, corpseId);
  post({
    type: "loot_window",
    zoneId,
    instanceId,
    sessionId,
    corpseId,
    corpseName: remaining?.corpseName ?? "Corpse",
    items: [...(remaining?.items ?? [])],
  });
}

function handleAutoAttack(sessionId: number, payload: Uint8Array): void {
  const value = decodeSidecar<{
    enabled?: unknown;
    targetId?: unknown;
  }>(SIDECAR_SCHEMA.AUTO_ATTACK, payload);
  const targetId = Number(value?.targetId);
  const entityIndex = clientEntityIndices.get(sessionId);
  const attacker = entityIndex === undefined
    ? undefined
    : kernel?.entities.at(entityIndex);
  if (
    !value
    || typeof value.enabled !== "boolean"
    || !Number.isSafeInteger(targetId)
    || targetId < 0
    || targetId > 0xffff_ffff
  ) {
    return;
  }
  const event = combat?.setAutoAttack(
    attacker?.id ?? 0,
    targetId,
    value.enabled,
    tick,
  );
  if (event) {
    updateHateFromCombatEvent(event);
    publishCombatEvent(event, sessionId);
  }
}

function updateHateFromCombatEvent(event: CombatEvent): void {
  const loaded = kernel;
  if (!loaded || !engagement) return;
  const attacker = loaded.entities.get(event.attackerId);
  const target = loaded.entities.get(event.targetId);
  if (attacker?.kind === EntityKind.pc && target?.kind === EntityKind.npc) {
    if (event.outcome === "hit" && !event.killed) {
      engagement.noteDamage(target.id, attacker.id, event.damage, event.tick);
    }
  }
  if (event.killed) engagement.clearEntity(event.targetId);
}

function publishCombatEvent(
  event: CombatEvent,
  explicitSessionId?: number,
): void {
  const attacker = kernel?.entities.get(event.attackerId);
  const target = kernel?.entities.get(event.targetId);
  const ownerSessionIds = new Set<number>();
  if (explicitSessionId !== undefined) ownerSessionIds.add(explicitSessionId);
  const attackerOwner = attacker
    ? entityOwnerSessions.get(attacker.index)
    : undefined;
  const targetOwner = target
    ? entityOwnerSessions.get(target.index)
    : undefined;
  if (attackerOwner !== undefined) ownerSessionIds.add(attackerOwner);
  if (targetOwner !== undefined) ownerSessionIds.add(targetOwner);
  if (ownerSessionIds.size === 0) return;
  if (event.killed) {
    if (target) {
      movementRoutes.delete(target.index);
      if (target.kind === EntityKind.npc) {
        corpseLoot?.createCorpse(target);
        const spawn = npcSpawnsByIndex.get(target.index);
        if (spawn) {
          const killerSessionIds = [...ownerSessionIds].filter(
            (candidate) => quests.character(candidate) !== null,
          );
          awardCombatExperience(spawn, killerSessionIds);
          applyQuestEffects(quests.dispatchNpcDeath({
            tick,
            npc: {
              kind: "npc",
              id: spawn.spawnId,
              name: spawn.name,
              level: spawn.level,
              npcIndex: target.index,
              position: {
                x: target.position.x,
                y: target.position.y,
                z: target.position.z,
              },
            },
            creditSessionIds: killerSessionIds,
          }));
        }
      } else if (target.kind === EntityKind.pc && targetOwner !== undefined) {
        const join = clientJoins.get(targetOwner);
        if (join) {
          post({
            type: "pc_death",
            zoneId,
            instanceId,
            sessionId: targetOwner,
            characterId: join.characterId,
            victimId: target.id,
            killerId: event.attackerId,
            bind: join.bind,
          });
        }
      }
    }
  }
  post({
    type: "combat_event",
    zoneId,
    instanceId,
    sessionIds: [...ownerSessionIds],
    event,
  });
}

function handleClientUpdate(sessionId: number, payload: Uint8Array): void {
  const parsed = decodePosition(payload);
  if (!parsed) {
    return;
  }

  const previousPosition = positions.get(sessionId);
  positions.set(sessionId, parsed);
  const previous = spatial.entitiesForSession(sessionId);
  spatial.upsertSession(sessionId, parsed);
  syncSessionVisibility(sessionId, previous, spatial.entitiesForSession(sessionId));
  applyQuestEffects(quests.updatePlayerPosition(sessionId, parsed, tick));

  const entityIndex = clientEntityIndices.get(sessionId);
  const pc = entityIndex === undefined ? undefined : kernel?.entities.at(entityIndex);
  if (!pc) return;
  const previousAt = lastClientUpdateAt.get(sessionId) ?? simulationTimeMs;
  applyClientMovement(pc, previousPosition, parsed, simulationTimeMs - previousAt);
  lastClientUpdateAt.set(sessionId, simulationTimeMs);
}

function handleChannelMessage(sessionId: number, payload: Uint8Array): void {
  const decoded = decodeSidecar<{
    sender?: unknown;
    target?: unknown;
    targetName?: unknown;
    targetname?: unknown;
    message?: unknown;
    chanNum?: unknown;
  }>(
    SIDECAR_SCHEMA.CHANNEL,
    payload,
  );
  const text =
    typeof decoded?.message === "string" ? decoded.message.trim() : "";
  if (!text) {
    return;
  }
  const channel = Number(decoded?.chanNum ?? 0);
  if (channel !== 0) return;
  const npcName = String(
    decoded?.targetName ?? decoded?.targetname ?? decoded?.target ?? "",
  ).trim();

  chatRing.push({ sessionId, message: text });
  if (chatRing.length > 50) {
    chatRing.shift();
  }
  applyQuestEffects(quests.dispatch({
    type: "say",
    tick,
    sessionId,
    actorName: clientNames.get(sessionId) ?? String(decoded?.sender ?? "Player"),
    npcName,
    message: text,
  }));
}

function applyQuestEffects(effects: readonly QuestEffect[]): void {
  const persistent: QuestPersistentEffect[] = [];
  for (const effect of effects) {
    if (isPersistentQuestEffect(effect)) {
      persistent.push(effect);
      continue;
    }
    if (effect.type === "npc_say" || effect.type === "entity_say") {
      post({
        type: "quest_say",
        zoneId,
        instanceId,
        sessionIds: Array.from(positions.keys()),
        sender: effect.type === "npc_say" ? effect.npcName : effect.entityName,
        target: effect.sessionId === undefined ? "" : (clientNames.get(effect.sessionId) ?? ""),
        message: effect.message,
      });
      continue;
    }
    if (effect.type === "set_npc_target") {
      if (effect.npcIndex >= 0 && effect.npcIndex < npcCount) {
        kernel?.setNpcTarget(effect.npcIndex, effect.x, effect.y, effect.z);
      }
      continue;
    }
    post({
      type: "log",
      level: "info",
      zoneId,
      instanceId,
      message: effect.message,
      meta: { questId: effect.questId },
    });
  }
  publishQuestPersistence(persistent);
}

/**
 * Combat experience runs through the same award path as discovery and quest beats, so
 * the progression service stays the only writer of experience and level. Credit is the
 * combat system's participant set; the killing blow is irrelevant.
 */
function awardCombatExperience(
  spawn: ZoneNpcSpawnDefinition,
  creditSessionIds: readonly number[],
): void {
  if (creditSessionIds.length === 0) return;
  const awards: QuestPersistentEffect[] = [];
  for (const sessionId of creditSessionIds) {
    const character = quests.character(sessionId);
    if (!character?.characterId) continue;
    const amount = splitGroupExperience(
      combatExperience(spawn.level, character.level),
      creditSessionIds.length,
    );
    if (amount <= 0) continue;
    awards.push({
      type: "award_xp",
      sessionId,
      characterId: character.characterId,
      questKey: `combat:${spawn.name}`,
      amount,
      source: "combat",
      sourceKey: spawn.name,
      awardKey: null,
    });
  }
  publishQuestPersistence(awards);
}

/**
 * The worker owns quest execution but never the database. Persistent consequences and
 * the rows they dirtied are handed to the zone service, which commits them once.
 */
function publishQuestPersistence(effects: readonly QuestPersistentEffect[]): void {
  const batches = quests.drainPersistence();
  if (effects.length === 0 && batches.length === 0) return;
  const sessionIds = new Set(effects.map((effect) => effect.sessionId));
  for (const batch of batches) sessionIds.add(batch.sessionId);
  post({
    type: "quest_effects",
    zoneId,
    instanceId,
    effects: [...effects],
    batches: [...batches],
    journals: [...sessionIds].map((sessionId) => ({
      sessionId,
      characterId: quests.character(sessionId)?.characterId ?? null,
      entries: [...quests.journalFor(sessionId)],
    })),
  });
}

function hydrateNpcs(
  definitions: readonly ZoneNpcSpawnDefinition[],
  snapshotBlob?: Uint8Array,
): void {
  const loaded = kernel;
  if (!loaded || contentHydrated) return;
  contentHydrated = true;
  const accepted = definitions.slice(0, loaded.capacity);
  npcCount = accepted.length;
  for (let index = 0; index < accepted.length; index++) {
    const spawn = accepted[index]!;
    npcSpawnsByIndex.set(index, spawn);
    const npc = loaded.entities.spawnNPCAt(index, {
      id: spawn.spawnId,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      // Legacy EQ run speeds are rates; the Go zone loop applies the same factor.
      speed: Math.max(0, spawn.movementSpeed * 5),
    });
    const state = loaded.entities.publicState;
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
    combat?.register(npc, npcCombatantStats(spawn));
    engagement?.registerNpc(npc);
    corpseLoot?.registerSpawn(spawn.spawnId, spawn.name, spawn.lootItems);
    spatial.upsertEntity(index, spawn);
    if (spawn.path.length > 0) {
      const targetIndex = spawn.path.length > 1 ? 1 : 0;
      movementRoutes.set(index, { points: spawn.path, targetIndex, pauseUntilMs: 0 });
      const target = spawn.path[targetIndex]!;
      npc.target.set(target.x, target.y, target.z);
    }
    applyQuestEffects(quests.dispatch({ type: "npc_spawn", tick, npcIndex: index }));
  }
  for (const sessionId of positions.keys()) {
    visibleEntitiesBySession.set(sessionId, new Set(spatial.entitiesForSession(sessionId)));
  }
  ensureClientEntities();
  if (snapshotBlob) {
    try {
      const report = restoreZoneSnapshot(decodeZoneSnapshot(snapshotBlob), {
        zoneId,
        instanceId,
        simulationTimeMs,
        definitions: accepted,
        entities: loaded.entities,
        movementRoutes,
        corpseLoot: corpseLoot!,
      });
      for (let index = 0; index < accepted.length; index++) {
        const entity = loaded.entities.at(index);
        if (!entity) continue;
        spatial.upsertEntity(index, {
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        });
      }
      post({
        type: "log",
        level: report.contentChanged ? "warn" : "info",
        zoneId,
        instanceId,
        message: "Zone snapshot restored",
        meta: { ...report },
      });
    } catch (error) {
      post({
        type: "log",
        level: "warn",
        zoneId,
        instanceId,
        message: "Zone snapshot was ignored",
        meta: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }
  if (definitions.length > accepted.length) {
    post({
      type: "log",
      level: "warn",
      zoneId,
      instanceId,
      message: "Zone NPC content exceeds the entity arena capacity",
      meta: { requested: definitions.length, capacity: loaded.capacity },
    });
  }
  post({
    type: "log",
    level: "info",
    zoneId,
    instanceId,
    message: "Zone NPC content hydrated",
    meta: { npcCount, movementRoutes: movementRoutes.size },
  });
}

function ensureClientEntities(): void {
  for (const sessionId of clientJoins.keys()) ensureClientEntity(sessionId);
}

function ensureClientEntity(sessionId: number): void {
  const loaded = kernel;
  const join = clientJoins.get(sessionId);
  if (!loaded || !contentHydrated || !join || clientEntityIndices.has(sessionId)) return;
  try {
    const pc = loaded.entities.spawnPC({
      id: join.entityId,
      x: join.x,
      y: join.y,
      z: join.z,
    });
    const index = pc.index;
    const state = loaded.entities.publicState;
    state.stateArchetypeId[index] = join.characterId;
    state.stateLevel[index] = join.level;
    state.stateRace[index] = join.race;
    state.stateGender[index] = join.gender;
    state.stateClassId[index] = join.charClass;
    state.stateSize[index] = -1;
    state.stateFace[index] = join.face;
    pc.heading = eqHeadingToRadians(join.heading);
    pc.markDirty();
    combat?.register(pc, join.combat);
    clientEntityIndices.set(sessionId, index);
    entityOwnerSessions.set(index, sessionId);
    lastClientUpdateAt.set(sessionId, simulationTimeMs);
    spatial.upsertEntity(index, join);
    visibleEntitiesBySession.get(sessionId)?.delete(index);
    for (const visibleIndex of visibleEntitiesBySession.get(sessionId) ?? []) {
      loaded.entities.markDirty(visibleIndex);
    }
    for (const recipientSessionId of spatial.recipientsForEntity(index)) {
      if (recipientSessionId === sessionId) continue;
      visibleEntitiesBySession.get(recipientSessionId)?.add(index);
      queueAoiChangeById(recipientSessionId, join.entityId, true);
    }
  } catch (error: unknown) {
    post({
      type: "log",
      level: "error",
      zoneId,
      instanceId,
      message: "Failed to place client entity in the zone arena",
      meta: {
        sessionId,
        entityId: join.entityId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function removeClient(sessionId: number): void {
  const loaded = kernel;
  const entityIndex = clientEntityIndices.get(sessionId);
  if (loaded && entityIndex !== undefined) {
    const entity = loaded.entities.at(entityIndex);
    if (entity) {
      engagement?.clearEntity(entity.id);
      for (const recipientSessionId of spatial.recipientsForEntity(entityIndex)) {
        if (recipientSessionId === sessionId) continue;
        visibleEntitiesBySession.get(recipientSessionId)?.delete(entityIndex);
        queueAoiChangeById(recipientSessionId, entity.id, false);
      }
      spatial.removeEntity(entityIndex);
      entityOwnerSessions.delete(entityIndex);
      loaded.entities.remove(entity);
    }
    clientEntityIndices.delete(sessionId);
  }
  clientJoins.delete(sessionId);
  lastClientUpdateAt.delete(sessionId);
  positions.delete(sessionId);
  clientNames.delete(sessionId);
  spatial.removeSession(sessionId);
  visibleEntitiesBySession.delete(sessionId);
  pendingAoiChanges.delete(sessionId);
  quests.removePlayer(sessionId);
}

function syncSessionVisibility(
  sessionId: number,
  previousIndices: readonly number[],
  nextIndices: readonly number[],
): void {
  const ownEntityIndex = clientEntityIndices.get(sessionId);
  const previous = new Set(previousIndices.filter((index) => index !== ownEntityIndex));
  const next = new Set(nextIndices.filter((index) => index !== ownEntityIndex));
  visibleEntitiesBySession.set(sessionId, next);
  for (const index of next) if (!previous.has(index)) queueAoiChange(sessionId, index, true);
  for (const index of previous) if (!next.has(index)) queueAoiChange(sessionId, index, false);
}

function syncEntityVisibility(
  entityIndex: number,
  previousSessionIds: readonly number[],
  nextSessionIds: readonly number[],
): void {
  const previous = new Set(previousSessionIds);
  const next = new Set(nextSessionIds);
  const ownerSessionId = entityOwnerSessions.get(entityIndex);
  for (const sessionId of next) {
    if (sessionId === ownerSessionId) continue;
    if (previous.has(sessionId)) continue;
    visibleEntitiesBySession.get(sessionId)?.add(entityIndex);
    queueAoiChange(sessionId, entityIndex, true);
  }
  for (const sessionId of previous) {
    if (sessionId === ownerSessionId) continue;
    if (next.has(sessionId)) continue;
    visibleEntitiesBySession.get(sessionId)?.delete(entityIndex);
    queueAoiChange(sessionId, entityIndex, false);
  }
}

function queueAoiChange(sessionId: number, entityIndex: number, entered: boolean): void {
  const entityId = kernel?.entities.at(entityIndex)?.id;
  if (!entityId) return;
  queueAoiChangeById(sessionId, entityId, entered);
}

function queueAoiChangeById(sessionId: number, entityId: number, entered: boolean): void {
  const change = pendingAoiChanges.get(sessionId) ?? {
    entered: new Set<number>(),
    exited: new Set<number>(),
  };
  const add = entered ? change.entered : change.exited;
  const remove = entered ? change.exited : change.entered;
  remove.delete(entityId);
  add.add(entityId);
  pendingAoiChanges.set(sessionId, change);
}

function flushAoiChanges(): void {
  for (const [sessionId, change] of pendingAoiChanges) {
    if (change.entered.size === 0 && change.exited.size === 0) continue;
    post({
      type: "aoi_change",
      zoneId,
      instanceId,
      sessionId,
      enteredSpawnIds: [...change.entered],
      exitedSpawnIds: [...change.exited],
    });
  }
  pendingAoiChanges.clear();
}

function advanceMovementRoutes(): void {
  const loaded = kernel;
  if (!loaded) return;
  for (const [entityIndex, route] of movementRoutes) {
    const npc = loaded.entities.at(entityIndex);
    if (!(npc instanceof NPC)) continue;
    if (engagement?.isEngaged(npc.id)) {
      suspendedMovementRoutes.add(entityIndex);
      continue;
    }
    if (suspendedMovementRoutes.delete(entityIndex)) {
      const target = route.points[route.targetIndex];
      if (target) npc.target.set(target.x, target.y, target.z);
    }
    advanceMovementRoute(npc, route, simulationTimeMs);
  }
}

function publishNpcDiagnostics(): void {
  const loaded = kernel;
  if (!loaded || !engagement) return;
  for (let index = 0; index < npcCount; index++) {
    const npc = loaded.entities.at(index);
    if (!(npc instanceof NPC)) continue;
    const base = engagement.diagnostic(npc.id, tick);
    if (!base) continue;
    const route = movementRoutes.get(index);
    const diagnostic = {
      ...base,
      roam: route
        ? {
            suspended: engagement.isEngaged(npc.id),
            targetIndex: route.targetIndex,
            pauseUntilMs: route.pauseUntilMs,
            path: route.points.map((point) => ({
              x: point.x,
              y: point.y,
              z: point.z,
            })),
          }
        : null,
    };
    const sessionIds = spatial.recipientsForEntity(index);
    if (sessionIds.length === 0) continue;
    post({
      type: "npc_debug",
      zoneId,
      instanceId,
      sessionIds,
      diagnostic,
    });
  }
}

function packSnapshot(state: RenderSnapshotNetBatchView, indices: readonly number[]): Uint8Array {
  return encodeWorldStateDelta(state, indices, tick);
}

function decodePosition(
  payload: Uint8Array,
): { x: number; y: number; z: number; heading: number } | null {
  const parsed = decodeSidecar<{
    x?: unknown;
    y?: unknown;
    z?: unknown;
    heading?: unknown;
  }>(SIDECAR_SCHEMA.CLIENT_POSITION, payload);
  if (!parsed) return null;
  if (
    typeof parsed.x !== "number" ||
    typeof parsed.y !== "number" ||
    typeof parsed.z !== "number" ||
    typeof parsed.heading !== "number" ||
    !Number.isFinite(parsed.x) ||
    !Number.isFinite(parsed.y) ||
    !Number.isFinite(parsed.z) ||
    !Number.isFinite(parsed.heading)
  ) {
    return null;
  }

  return {
    x: parsed.x,
    y: parsed.y,
    z: parsed.z,
    heading: parsed.heading,
  };
}

function post(message: ZoneWorkerOutboundMessage): void {
  if (message.type === "snapshot" && message.payload.buffer instanceof ArrayBuffer) {
    workerPort.postMessage(message, [message.payload.buffer]);
    return;
  }
  workerPort.postMessage(message);
}
