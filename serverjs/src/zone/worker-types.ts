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

export interface ZoneShutdownCommitMessage {
  type: "shutdown_commit";
  persisted: boolean;
}

export interface ZoneClientJoinMessage {
  type: "client_join";
  sessionId: number;
  entityId: number;
  characterId: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  characterName: string;
  level: number;
  race: number;
  gender: number;
  charClass: number;
  face: number;
  combat: CombatantStats;
  bind: {
    zoneId: number;
    instanceId: number;
    x: number;
    y: number;
    z: number;
    heading: number;
  };
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

/** Persisted quest state loaded before any handler can observe the character. */
export interface ZoneQuestCharacterMessage {
  type: "quest_character";
  sessionId: number;
  snapshot: QuestCharacterSnapshot;
}

/** Progression committed by the zone service, echoed back so the shard stays accurate. */
export interface ZoneQuestProgressionMessage {
  type: "quest_progression";
  sessionId: number;
  experience: number;
  level: number;
  previousLevel: number;
  leveled: boolean;
}

export interface ZoneContentHydrateMessage {
  type: "zone_hydrate";
  zoneKey: string;
  npcs: ZoneNpcSpawnDefinition[];
  snapshotBlob?: Uint8Array;
}

export interface ZoneNavPathResultMessage {
  type: "nav_path_result";
  requestId: number;
  npcId: number;
  targetId: number;
  path: NpcPathPoint[];
  error?: string;
}

export interface ZoneLootRestoreMessage {
  type: "loot_restore";
  corpseId: number;
  item: Record<string, unknown>;
}

export type ZoneWorkerInboundMessage =
  | ZonePacketMessage
  | ZoneShutdownMessage
  | ZoneShutdownCommitMessage
  | ZoneQuestUpdateMessage
  | ZoneQuestHydrateMessage
  | ZoneQuestCharacterMessage
  | ZoneQuestProgressionMessage
  | ZoneContentHydrateMessage
  | ZoneNavPathResultMessage
  | ZoneClientJoinMessage
  | ZoneClientLeaveMessage
  | ZoneLootRestoreMessage;

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

/** Everything a dispatch changed that outlives the shard, plus the journals it touched. */
export interface ZoneQuestEffectsMessage {
  type: "quest_effects";
  zoneId: number;
  instanceId: number;
  effects: QuestPersistentEffect[];
  batches: QuestPersistenceBatch[];
  journals: Array<{
    sessionId: number;
    characterId: number | null;
    entries: QuestJournalEntry[];
  }>;
}

export interface ZoneAoiChangeMessage {
  type: "aoi_change";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  enteredSpawnIds: number[];
  exitedSpawnIds: number[];
}

export interface ZoneCombatEventMessage {
  type: "combat_event";
  zoneId: number;
  instanceId: number;
  sessionIds: number[];
  event: CombatEvent;
}

export interface ZonePcDeathMessage {
  type: "pc_death";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  characterId: number;
  victimId: number;
  killerId: number;
  bind: ZoneClientJoinMessage["bind"];
}

export interface ZoneLootWindowMessage {
  type: "loot_window";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  corpseId: number;
  corpseName: string;
  items: Record<string, unknown>[];
}

export interface ZoneLootAwardMessage {
  type: "loot_award";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  characterId: number;
  looterId: number;
  corpseId: number;
  item: Record<string, unknown>;
}

export interface ZoneNavPathRequestMessage {
  type: "nav_path_request";
  zoneKey: string;
  zoneId: number;
  instanceId: number;
  request: NpcPathRequest;
}

export interface ZoneNpcDebugMessage {
  type: "npc_debug";
  zoneId: number;
  instanceId: number;
  sessionIds: number[];
  diagnostic: NpcEngagementDiagnostic;
}

export interface ZoneMerchantIntentMessage {
  type: "merchant_intent";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  characterId: number;
  npcId: number;
  npcArchetypeId: number;
  merchantName: string;
  action: "open" | "buy" | "sell";
  merchantSlot?: number;
  slot?: number;
  bag?: number;
  quantity?: number;
}

export interface ZoneMerchantErrorMessage {
  type: "merchant_error";
  zoneId: number;
  instanceId: number;
  sessionId: number;
  npcId: number;
  message: string;
}

export interface ZonePersistentSnapshotMessage {
  type: "persistent_snapshot";
  zoneId: number;
  instanceId: number;
  formatVersion: number;
  blobData?: Uint8Array;
  error?: string;
}

export type ZoneWorkerOutboundMessage =
  | ZoneMetricsMessage
  | ZoneLogMessage
  | ZoneSnapshotMessage
  | ZoneAoiChangeMessage
  | ZoneQuestSayMessage
  | ZoneQuestEffectsMessage
  | ZoneCombatEventMessage
  | ZonePcDeathMessage
  | ZoneLootWindowMessage
  | ZoneLootAwardMessage
  | ZoneNavPathRequestMessage
  | ZoneNpcDebugMessage
  | ZoneMerchantIntentMessage
  | ZoneMerchantErrorMessage
  | ZonePersistentSnapshotMessage;
import type {
  QuestDefinition,
  QuestNpcSnapshot,
  QuestPersistentEffect,
} from "./quest-types.js";
import type { QuestPersistenceBatch } from "./quest-manager.js";
import type {
  QuestCharacterSnapshot,
  QuestJournalEntry,
} from "./quest-state.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import type {
  CombatEvent,
  CombatantStats,
} from "../combat/melee-combat.js";
import type {
  NpcEngagementDiagnostic,
  NpcPathPoint,
  NpcPathRequest,
} from "../ai/npc-engagement.js";
