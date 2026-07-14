export interface ZonePacketMessage {
  type: "packet";
  sessionId: number;
  opcode: number;
  payload: Uint8Array;
  transport: "datagram" | "control-stream";
}

export interface ZoneShutdownMessage {
  type: "shutdown";
}

export interface ZoneClientJoinMessage {
  type: "client_join";
  sessionId: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  characterName: string;
}

export interface ZoneClientLeaveMessage {
  type: "client_leave";
  sessionId: number;
}

export interface ZoneQuestUpdateMessage {
  type: "quest_update";
  definitions: QuestDefinition[];
  revision: number;
}

export interface ZoneQuestHydrateMessage {
  type: "quest_hydrate";
  npcs: QuestNpcSnapshot[];
}

export interface ZoneContentHydrateMessage {
  type: "zone_hydrate";
  npcs: ZoneNpcSpawnDefinition[];
}

export type ZoneWorkerInboundMessage =
  | ZonePacketMessage
  | ZoneShutdownMessage
  | ZoneQuestUpdateMessage
  | ZoneQuestHydrateMessage
  | ZoneContentHydrateMessage
  | ZoneClientJoinMessage
  | ZoneClientLeaveMessage;

export interface ZoneMetricsMessage {
  type: "metrics";
  zoneId: number;
  instanceId: number;
  queueDepth: number;
  processedThisTick: number;
  tick: number;
  npcCount: number;
  sessionCount: number;
  questRevision: number;
  questCount: number;
}

export interface ZoneLogMessage {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  zoneId: number;
  instanceId: number;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ZoneSnapshotMessage {
  type: "snapshot";
  zoneId: number;
  instanceId: number;
  sessionIds: number[];
  /** Versioned world-state envelope containing a Shado SoA delta and optional sidecar. */
  payload: Uint8Array;
}

export interface ZoneQuestSayMessage {
  type: "quest_say";
  zoneId: number;
  instanceId: number;
  sessionIds: number[];
  sender: string;
  target: string;
  message: string;
}

export interface ZoneAoiChangeMessage {
  type: "aoi_change";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  enteredSpawnIds: number[];
  exitedSpawnIds: number[];
}

export type ZoneWorkerOutboundMessage =
  | ZoneMetricsMessage
  | ZoneLogMessage
  | ZoneSnapshotMessage
  | ZoneAoiChangeMessage
  | ZoneQuestSayMessage;
import type { QuestDefinition, QuestNpcSnapshot } from "./quest-types.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
