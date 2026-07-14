export type QuestEventName = keyof QuestEventArguments;

export interface QuestVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Serializable state supplied by a zone adapter when it raises an event. */
export interface QuestEntitySnapshot {
  readonly kind: 'player' | 'npc';
  readonly id?: number;
  readonly name: string;
  readonly level?: number;
  readonly classId?: number;
  readonly raceId?: number;
  readonly gender?: number;
  readonly position?: QuestVector3 & { readonly heading?: number };
}

export interface QuestPlayerSnapshot extends QuestEntitySnapshot {
  readonly kind: 'player';
  readonly sessionId: number;
}

export interface QuestNpcSnapshot extends QuestEntitySnapshot {
  readonly kind: 'npc';
  readonly npcId?: number;
  readonly npcIndex?: number;
}

export interface QuestItemSnapshot {
  readonly id: number;
  readonly name: string;
  readonly charges?: number;
  readonly slot?: number;
}

/** The transport-neutral event envelope. Snapshots may be progressively enriched by adapters. */
export interface QuestEvent {
  readonly type: QuestEventName;
  readonly tick: number;
  readonly actor?: QuestPlayerSnapshot | QuestNpcSnapshot;
  readonly receiver?: QuestNpcSnapshot;
  readonly npcIndex?: number;
  readonly sessionId?: number;
  readonly message?: string;
  readonly signal?: string;
  readonly item?: QuestItemSnapshot;
  readonly customEvent?: string;
  readonly data?: unknown;
  readonly actorName?: string;
  readonly npcName?: string;
}

/** Public quest entity API. Implementations route methods back through the owning zone. */
export interface QuestEntity {
  readonly kind: 'player' | 'npc';
  readonly id: number | null;
  readonly name: string;
  readonly level: number | null;
  readonly classId: number | null;
  readonly raceId: number | null;
  readonly gender: number | null;
  readonly position: Readonly<QuestVector3 & { heading?: number }> | null;
  say(message: string): void;
}

export interface QuestPlayer extends QuestEntity {
  readonly kind: 'player';
  readonly sessionId: number;
}

export interface QuestNpc extends QuestEntity {
  readonly kind: 'npc';
  readonly npcId: number | null;
  readonly npcIndex: number | null;
  /** Sets the simulation target consumed by the precompiled movement kernel. */
  moveTo(position: QuestVector3): void;
}

export interface QuestItem {
  readonly id: number;
  readonly name: string;
  readonly charges: number | null;
  readonly slot: number | null;
}

export interface QuestZone {
  readonly id: number;
  readonly instanceId: number;
  readonly shortName: string | null;
  readonly tick: number;
  readonly npcs: readonly QuestNpc[];
  readonly players: readonly QuestPlayer[];
  npcByName(name: string): QuestNpc | null;
  playerByName(name: string): QuestPlayer | null;
  playerBySession(sessionId: number): QuestPlayer | null;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  emitCustom(name: string, data?: unknown): void;
  log(message: string): void;
}

interface QuestArgumentsBase {
  readonly questId: string;
  readonly event: QuestEvent;
  readonly zone: QuestZone;
  readonly actor: QuestEntity | null;
  readonly receiver: QuestNpc | null;
}

export interface QuestEventArguments {
  zone_start: QuestArgumentsBase & {
    readonly actor: null;
    readonly receiver: null;
  };
  npc_spawn: QuestArgumentsBase & {
    readonly npc: QuestNpc;
    readonly actor: QuestNpc;
    readonly receiver: QuestNpc;
  };
  npc_tick: QuestArgumentsBase & {
    /** Null for a zone-wide tick; populated for an NPC-specific tick. */
    readonly npc: QuestNpc | null;
  };
  player_enter: QuestArgumentsBase & {
    readonly player: QuestPlayer;
    readonly initiator: QuestPlayer;
    readonly actor: QuestPlayer;
  };
  say: QuestArgumentsBase & {
    readonly initiator: QuestEntity;
    readonly actor: QuestEntity;
    readonly npc: QuestNpc;
    readonly receiver: QuestNpc;
    readonly message: string;
  };
  signal: QuestArgumentsBase & {
    readonly initiator: QuestEntity | null;
    readonly npc: QuestNpc;
    readonly receiver: QuestNpc;
    readonly signal: string;
  };
  item_click: QuestArgumentsBase & {
    readonly initiator: QuestPlayer;
    readonly player: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly item: QuestItem;
  };
  item_tick: QuestArgumentsBase & {
    readonly owner: QuestEntity | null;
    readonly item: QuestItem;
  };
  custom: QuestArgumentsBase & {
    readonly name: string;
    readonly data: unknown;
  };
}

export type QuestHandlerContext<E extends QuestEventName = QuestEventName> =
  QuestEventArguments[E];

export type QuestAction =
  | {
      type: 'set_npc_target';
      npcIndex: number | 'event';
      x: number;
      y: number;
      z: number;
    }
  | {
      type: 'cycle_npc_target';
      npcIndex: number | 'event';
      points: Array<{ x: number; y: number; z: number }>;
    }
  | {
      type: 'npc_say';
      npcName: string | 'event';
      message: string;
    }
  | { type: 'log'; message: string };

export interface QuestHandlerOptions {
  everyTicks?: number;
  messageIncludes?: string;
  signal?: string;
  /** Empty/omitted is a zone-global handler, matching the Go registry. */
  npcName?: string;
  /** Assigned by a ZoneQuestRegistry for item/custom/global routing. */
  target?: QuestRegistrationTarget;
  actions?: QuestAction[];
}

export type QuestRegistrationTarget =
  | { readonly kind: 'zone' }
  | { readonly kind: 'npc'; readonly name: string }
  | { readonly kind: 'item'; readonly id: number }
  | { readonly kind: 'custom'; readonly name: string };

export interface QuestHandlerDefinition<E extends QuestEventName = QuestEventName>
  extends QuestHandlerOptions {
  event: E;
  /** Code-owned deterministic handler. Functions never cross a Worker boundary. */
  handler?: QuestInlineHandler<E>;
}

export type QuestInlineHandlerResult =
  | boolean
  | QuestEffect
  | readonly QuestEffect[]
  | null
  | undefined
  | void;

export type QuestInlineHandler<E extends QuestEventName> =
  (context: QuestHandlerContext<E>) => QuestInlineHandlerResult;

export interface QuestDefinition {
  id: string;
  enabled?: boolean;
  zoneIds: number[];
  handlers: QuestHandlerDefinition<any>[];
}

export type QuestEffect =
  | { type: 'set_npc_target'; npcIndex: number; x: number; y: number; z: number }
  | { type: 'npc_say'; npcName: string; message: string; sessionId?: number }
  | { type: 'entity_say'; entityName: string; message: string; sessionId?: number }
  | { type: 'log'; questId: string; message: string };

/** Provides event-specific contextual typing for inline handlers. */
export function onQuest<E extends QuestEventName>(
  event: E,
  options: QuestHandlerOptions,
  handler: QuestInlineHandler<E>,
): QuestHandlerDefinition<E> {
  return { event, ...options, handler };
}

export function defineQuest<T extends QuestDefinition>(definition: T): T {
  return definition;
}
