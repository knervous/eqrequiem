import { parentPort, workerData } from "node:worker_threads";

import { OP } from "../protocol/opcodes.js";
import {
  type RenderSnapshotNetBatchView,
} from "../protocol/generated/net-structs.js";
import { createWorldStatePacket } from "../protocol/world-state.js";
import { decodeSidecar, SIDECAR_SCHEMA } from "../protocol/sidecar-codec.js";
import type {
  ZoneWorkerInboundMessage,
  ZoneWorkerOutboundMessage,
} from "./worker-types.js";
import { ZoneSimulationKernel } from "./zone-kernel.js";
import { QuestManager } from "./quest-manager.js";
import type { QuestDefinition, QuestEffect } from "./quest-types.js";
import { questDefinitionsForZone, questRegistryForZone } from "./quest-zone-registry.js";
import { ZoneSpatialIndex } from "./spatial-index.js";
import type { ZoneNpcSpawnDefinition, ZonePathPoint } from "./zone-content.js";

interface WorkerBootstrap {
  zoneId: number;
  instanceId: number;
  tickRateHz: number;
  workBudgetMs: number;
  questDefinitions: QuestDefinition[];
  questRevision: number;
}

const port = parentPort;
if (!port) {
  process.exit(1);
}
const workerPort = port;

const { zoneId, instanceId, tickRateHz, workBudgetMs, questDefinitions, questRevision } =
  workerData as WorkerBootstrap;
const queue: ZoneWorkerInboundMessage[] = [];
const opcodeCounters = new Map<number, number>();
const positions = new Map<
  number,
  { x: number; y: number; z: number; heading: number }
>();
const chatRing: Array<{ sessionId: number; message: string }> = [];
const clientNames = new Map<number, string>();
const spatial = new ZoneSpatialIndex(300, 1);
const visibleEntitiesBySession = new Map<number, Set<number>>();
const pendingAoiChanges = new Map<number, { entered: Set<number>; exited: Set<number> }>();
const movementRoutes = new Map<number, {
  points: readonly ZonePathPoint[];
  targetIndex: number;
  pauseUntilTick: number;
}>();
let stopping = false;
let kernel: ZoneSimulationKernel | null = null;
let pendingNpcs: readonly ZoneNpcSpawnDefinition[] | null = null;
let contentHydrated = false;
let npcCount = 0;
let tick = 0;
const zoneQuestRegistry = questRegistryForZone(zoneId);
const quests = new QuestManager(zoneId, instanceId, zoneQuestRegistry?.zone.shortName ?? null);
quests.replace([...questDefinitionsForZone(zoneId), ...questDefinitions], questRevision);

void ZoneSimulationKernel.load()
  .then((loaded) => {
    kernel = loaded;
    if (pendingNpcs) hydrateNpcs(pendingNpcs);
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
  queue.push(message);
});

const tickIntervalMs = Math.max(1, Math.floor(1000 / tickRateHz));
const timer = setInterval(() => {
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

    if (item.type === "zone_hydrate") {
      pendingNpcs = item.npcs;
      if (kernel) hydrateNpcs(item.npcs);
      continue;
    }

    if (item.type === "client_join") {
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
      for (const entityIndex of visibleEntities) {
        kernel?.entities.at(entityIndex)?.markDirty();
      }
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
      positions.delete(item.sessionId);
      clientNames.delete(item.sessionId);
      spatial.removeSession(item.sessionId);
      visibleEntitiesBySession.delete(item.sessionId);
      pendingAoiChanges.delete(item.sessionId);
      quests.removePlayer(item.sessionId);
      continue;
    }

    processed += 1;
    opcodeCounters.set(item.opcode, (opcodeCounters.get(item.opcode) ?? 0) + 1);
    handleZoneOpcode(item.opcode, item.sessionId, item.payload);

    if (Date.now() - start >= workBudgetMs) {
      break;
    }
  }

  applyQuestEffects(quests.dispatch({ type: "npc_tick", tick }));
  advanceMovementRoutes();

  const snapshot = kernel?.tick(tickIntervalMs);
  if (snapshot && snapshot.dirtyIndices.length > 0) {
    const state = snapshot.state;
    const indicesBySession = new Map<number, number[]>();
    for (const index of snapshot.dirtyIndices) {
      const offset = index * 3;
      const previousRecipients = spatial.recipientsForEntity(index);
      spatial.upsertEntity(index, {
        x: state.statePosition[offset]!,
        y: state.statePosition[offset + 1]!,
        z: state.statePosition[offset + 2]!,
      });
      const recipients = spatial.recipientsForEntity(index);
      syncEntityVisibility(index, previousRecipients, recipients);
      for (const sessionId of recipients) {
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

  flushAoiChanges();

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
    clearInterval(timer);
    post({
      type: "log",
      level: "info",
      zoneId,
      instanceId,
      message: "Zone worker stopped",
      meta: {
        opcodeCounters: Object.fromEntries(opcodeCounters.entries()),
      },
    });
    process.exit(0);
  }
}, tickIntervalMs);

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

function handleClientUpdate(sessionId: number, payload: Uint8Array): void {
  const parsed = decodePosition(payload);
  if (!parsed) {
    return;
  }

  positions.set(sessionId, parsed);
  const previous = spatial.entitiesForSession(sessionId);
  spatial.upsertSession(sessionId, parsed);
  syncSessionVisibility(sessionId, previous, spatial.entitiesForSession(sessionId));
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
  for (const effect of effects) {
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
}

function hydrateNpcs(definitions: readonly ZoneNpcSpawnDefinition[]): void {
  const loaded = kernel;
  if (!loaded || contentHydrated) return;
  contentHydrated = true;
  const accepted = definitions.slice(0, loaded.capacity);
  npcCount = accepted.length;
  for (let index = 0; index < accepted.length; index++) {
    const spawn = accepted[index]!;
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
    state.stateHeading[index] = spawn.heading;
    npc.markDirty();
    spatial.upsertEntity(index, spawn);
    if (spawn.path.length > 0) {
      const targetIndex = spawn.path.length > 1 ? 1 : 0;
      movementRoutes.set(index, { points: spawn.path, targetIndex, pauseUntilTick: 0 });
      const target = spawn.path[targetIndex]!;
      npc.target.set(target.x, target.y, target.z);
    }
    applyQuestEffects(quests.dispatch({ type: "npc_spawn", tick, npcIndex: index }));
  }
  for (const sessionId of positions.keys()) {
    visibleEntitiesBySession.set(sessionId, new Set(spatial.entitiesForSession(sessionId)));
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

function syncSessionVisibility(
  sessionId: number,
  previousIndices: readonly number[],
  nextIndices: readonly number[],
): void {
  const previous = new Set(previousIndices);
  const next = new Set(nextIndices);
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
  for (const sessionId of next) {
    if (previous.has(sessionId)) continue;
    visibleEntitiesBySession.get(sessionId)?.add(entityIndex);
    queueAoiChange(sessionId, entityIndex, true);
  }
  for (const sessionId of previous) {
    if (next.has(sessionId)) continue;
    visibleEntitiesBySession.get(sessionId)?.delete(entityIndex);
    queueAoiChange(sessionId, entityIndex, false);
  }
}

function queueAoiChange(sessionId: number, entityIndex: number, entered: boolean): void {
  const entityId = kernel?.entities.at(entityIndex)?.id;
  if (!entityId) return;
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
    if (tick < route.pauseUntilTick) continue;
    const npc = loaded.entities.at(entityIndex);
    const target = route.points[route.targetIndex];
    if (!npc || !target) continue;
    const dx = target.x - npc.position.x;
    const dy = target.y - npc.position.y;
    const dz = target.z - npc.position.z;
    if (dx * dx + dy * dy + dz * dz > 0.04) continue;

    route.pauseUntilTick = tick + Math.ceil(Math.max(0, target.pauseSeconds) * tickRateHz);
    route.targetIndex = (route.targetIndex + 1) % route.points.length;
    const next = route.points[route.targetIndex]!;
    if (route.pauseUntilTick > tick) {
      loaded.setNpcTarget(entityIndex, npc.position.x, npc.position.y, npc.position.z);
    } else {
      loaded.setNpcTarget(entityIndex, next.x, next.y, next.z);
    }
  }

  for (const [entityIndex, route] of movementRoutes) {
    if (route.pauseUntilTick !== tick) continue;
    const next = route.points[route.targetIndex]!;
    loaded.setNpcTarget(entityIndex, next.x, next.y, next.z);
  }
}

function packSnapshot(state: RenderSnapshotNetBatchView, indices: readonly number[]): Uint8Array {
  const packet = createWorldStatePacket(indices.length, new Uint8Array(), 0, tick);
  const batch = packet.state;
  for (let out = 0; out < indices.length; out++) {
    const index = indices[out]!;
    batch.entityId[out] = state.entityId[index]!;
    batch.stateKind[out] = state.stateKind[index]!;
    copyComponents(state.statePosition, batch.statePosition, index, out, 3);
    copyComponents(state.stateVelocity, batch.stateVelocity, index, out, 3);
    copyComponents(state.stateOrientation, batch.stateOrientation, index, out, 4);
    batch.stateAnimation[out] = state.stateAnimation[index]!;
    batch.stateMovementState[out] = state.stateMovementState[index]!;
    batch.stateAppearance[out] = state.stateAppearance[index]!;
    batch.stateNameOffset[out] = state.stateNameOffset[index]!;
    batch.stateNameLength[out] = state.stateNameLength[index]!;
    batch.stateArchetypeId[out] = state.stateArchetypeId[index]!;
    batch.stateLevel[out] = state.stateLevel[index]!;
    batch.stateRace[out] = state.stateRace[index]!;
    batch.stateGender[out] = state.stateGender[index]!;
    batch.stateClassId[out] = state.stateClassId[index]!;
    batch.stateBodyType[out] = state.stateBodyType[index]!;
    batch.stateSize[out] = state.stateSize[index]!;
    batch.stateFace[out] = state.stateFace[index]!;
    batch.stateHelm[out] = state.stateHelm[index]!;
    batch.stateChest[out] = state.stateChest[index]!;
    batch.statePrimary[out] = state.statePrimary[index]!;
    batch.stateSecondary[out] = state.stateSecondary[index]!;
    batch.stateModelKeyOffset[out] = state.stateModelKeyOffset[index]!;
    batch.stateModelKeyLength[out] = state.stateModelKeyLength[index]!;
    batch.stateHeading[out] = state.stateHeading[index]!;
  }
  return packet.bytes;
}

function copyComponents(
  source: Float32Array,
  destination: Float32Array,
  sourceIndex: number,
  destinationIndex: number,
  componentCount: number,
): void {
  const sourceOffset = sourceIndex * componentCount;
  const destinationOffset = destinationIndex * componentCount;
  for (let component = 0; component < componentCount; component++) {
    destination[destinationOffset + component] = source[sourceOffset + component]!;
  }
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
    typeof parsed.heading !== "number"
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
