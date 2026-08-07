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
  readonly characterId?: number;
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
  readonly quantity?: number;
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
  readonly items?: readonly QuestItemSnapshot[];
  readonly customEvent?: string;
  readonly data?: unknown;
  readonly actorName?: string;
  readonly npcName?: string;
  /** Authored region key for region_enter/region_leave. */
  readonly regionKey?: string;
  /** Separation in world units for proximity events. */
  readonly distance?: number;
  /** Radius of the proximity watcher that raised this event; routes it to one handler. */
  readonly proximityRadius?: number;
  /** Killing entity for npc_death, when the zone knows one. */
  readonly killer?: QuestPlayerSnapshot | QuestNpcSnapshot;
  /** Sessions the zone considers eligible for credit on this event. */
  readonly creditSessionIds?: readonly number[];
  /** Named timer key for timer events. */
  readonly timerName?: string;
  readonly level?: number;
  readonly previousLevel?: number;
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

/**
 * Private per-character quest state. Reads are served from the record loaded when
 * the character entered the shard; writes emit deterministic effects that the owning
 * boundary persists, so handlers never perform I/O.
 */
export interface QuestPlayerStateApi {
  /** Current state for a quest key, defaulting to the executing quest. */
  state<T extends object = Record<string, unknown>>(questKey?: string): Readonly<T>;
  get<T>(key: string, questKey?: string): T | undefined;
  set(key: string, value: unknown, questKey?: string): void;
  patch(patch: Readonly<Record<string, unknown>>, questKey?: string): void;
  /** Schedules a named `timer` event for this character. Timers are shard-local. */
  timer(name: string, delayMs: number, questKey?: string): void;
  clearTimer(name: string, questKey?: string): void;
}

/** Facts the character has actually learned, deliberately separate from quest progress. */
export interface QuestPlayerKnowledgeApi {
  has(key: string): boolean;
  /** Idempotent; returns true only the first time this character learns the fact. */
  learn(key: string, data?: Readonly<Record<string, unknown>>): boolean;
  forget(key: string): void;
  keys(): readonly string[];
}

export type QuestLeadKind =
  | 'rumor'
  | 'observation'
  | 'promise'
  | 'person'
  | 'place'
  | 'item'
  | 'warning'
  | 'resolved';

export type QuestLeadPlace =
  | { readonly kind: 'none' }
  | { readonly kind: 'zone'; readonly zoneId: number }
  | { readonly kind: 'direction'; readonly text: string }
  | { readonly kind: 'landmark'; readonly landmarkId: string }
  | { readonly kind: 'area'; readonly regionId: string }
  | { readonly kind: 'point'; readonly x: number; readonly z: number };

export interface QuestLeadOptions {
  readonly text: string;
  readonly kind?: QuestLeadKind;
  readonly title?: string;
  readonly place?: QuestLeadPlace;
  readonly questKey?: string;
}

/** Discovered knowledge the player is allowed to see. Never undiscovered objectives. */
export interface QuestPlayerJournalApi {
  has(leadKey: string, questKey?: string): boolean;
  /** Idempotent; returns true only the first time this lead is discovered. */
  discover(leadKey: string, lead: QuestLeadOptions): boolean;
  resolve(leadKey: string, options?: { readonly text?: string; readonly questKey?: string }): void;
  /** Marks the thread as having no remaining leads without asserting a completion bit. */
  archive(questKey?: string): void;
}

export interface QuestXpOptions {
  readonly source?: 'combat' | 'discovery' | 'quest' | 'world';
  readonly sourceKey?: string;
}

export interface QuestPlayerProgressionApi {
  readonly experience: number;
  awardXp(amount: number, options?: QuestXpOptions): void;
  /** Idempotent on `awardKey`; returns true only when the award is newly granted. */
  awardXpOnce(awardKey: string, amount: number, options?: QuestXpOptions): boolean;
  granted(awardKey: string, questKey?: string): boolean;
}

export interface QuestPlayerInventoryApi {
  has(itemId: number): boolean;
  count(itemId: number): number;
  readonly items: readonly QuestItemSnapshot[];
}

export interface QuestPlayer extends QuestEntity {
  readonly kind: 'player';
  readonly sessionId: number;
  readonly characterId: number | null;
  readonly quest: QuestPlayerStateApi;
  readonly knowledge: QuestPlayerKnowledgeApi;
  readonly journal: QuestPlayerJournalApi;
  readonly progression: QuestPlayerProgressionApi;
  readonly inventory: QuestPlayerInventoryApi;
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
  readonly quantity: number;
}

/** An authored named volume. Regions are content, not raw coordinate checks in handlers. */
export type QuestRegionShape =
  | {
      readonly kind: 'sphere';
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly radius: number;
    }
  | {
      readonly kind: 'box';
      readonly minX: number;
      readonly minY: number;
      readonly minZ: number;
      readonly maxX: number;
      readonly maxY: number;
      readonly maxZ: number;
    };

export interface QuestRegionDefinition {
  readonly key: string;
  readonly shape: QuestRegionShape;
  readonly label?: string;
}

export interface QuestRegion {
  readonly key: string;
  readonly label: string | null;
  readonly center: QuestVector3;
}

/** Read-only world context available to availability predicates. */
export interface QuestWorldContext {
  /** Fractional hours since midnight in world time, when the shard supplies a clock. */
  readonly timeOfDay: number | null;
  readonly weather: string | null;
  readonly flags: Readonly<Record<string, unknown>>;
}

export interface QuestZone {
  readonly id: number;
  readonly instanceId: number;
  readonly shortName: string | null;
  readonly tick: number;
  readonly npcs: readonly QuestNpc[];
  readonly players: readonly QuestPlayer[];
  readonly world: QuestWorldContext;
  npcByName(name: string): QuestNpc | null;
  playerByName(name: string): QuestPlayer | null;
  playerBySession(sessionId: number): QuestPlayer | null;
  /** Players inside `radius` of a point; the basis for authored credit policies. */
  playersWithin(position: QuestVector3, radius: number): readonly QuestPlayer[];
  region(key: string): QuestRegion | null;
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
  item_turn_in: QuestArgumentsBase & {
    readonly initiator: QuestPlayer;
    readonly player: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly npc: QuestNpc;
    readonly receiver: QuestNpc;
    readonly items: readonly QuestItem[];
    /** Consumes the submitted items; the boundary reports the decision back to the client. */
    consume(): void;
    /** Returns the submitted items untouched. */
    refuse(): void;
  };
  region_enter: QuestArgumentsBase & {
    readonly player: QuestPlayer;
    readonly initiator: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly region: QuestRegion;
  };
  region_leave: QuestArgumentsBase & {
    readonly player: QuestPlayer;
    readonly initiator: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly region: QuestRegion;
  };
  proximity_enter: QuestArgumentsBase & {
    readonly player: QuestPlayer;
    readonly initiator: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly npc: QuestNpc;
    readonly receiver: QuestNpc;
    readonly distance: number;
  };
  proximity_leave: QuestArgumentsBase & {
    readonly player: QuestPlayer;
    readonly initiator: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly npc: QuestNpc;
    readonly receiver: QuestNpc;
    readonly distance: number;
  };
  npc_death: QuestArgumentsBase & {
    readonly npc: QuestNpc;
    readonly receiver: QuestNpc;
    readonly killer: QuestEntity | null;
    /** Sessions the zone credited, resolved to player facades still on the shard. */
    readonly credit: readonly QuestPlayer[];
    readonly position: Readonly<QuestVector3> | null;
  };
  timer: QuestArgumentsBase & {
    readonly name: string;
    /** Null for zone-scoped timers. */
    readonly player: QuestPlayer | null;
    readonly initiator: QuestPlayer | null;
  };
  level_up: QuestArgumentsBase & {
    readonly player: QuestPlayer;
    readonly initiator: QuestPlayer;
    readonly actor: QuestPlayer;
    readonly level: number;
    readonly previousLevel: number;
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
  /** Assigned by a ZoneQuestRegistry for item/custom/region/global routing. */
  target?: QuestRegistrationTarget;
  /** Authored region key; region events only fire for the bound region. */
  regionKey?: string;
  /** Proximity radius in world units for proximity_enter/leave registrations. */
  radius?: number;
  /** Named timer this handler answers to. */
  timerName?: string;
  /** Runs at most once per character for the owning quest key. */
  oncePerPlayer?: boolean;
  actions?: QuestAction[];
}

export type QuestRegistrationTarget =
  | { readonly kind: 'zone' }
  | { readonly kind: 'npc'; readonly name: string }
  | { readonly kind: 'item'; readonly id: number }
  | { readonly kind: 'region'; readonly key: string }
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

/** Discoverability index entry. Generated from authored code, never hand-maintained. */
export type QuestBindingRole =
  | 'source'
  | 'rumor'
  | 'progress'
  | 'turnin'
  | 'witness'
  | 'discovery';

export type QuestBindingVisibility = 'hidden' | 'subtle' | 'contextual';

export interface QuestBinding {
  readonly kind: 'npc' | 'item' | 'region' | 'zone' | 'custom';
  readonly key: string;
  readonly role: QuestBindingRole;
  readonly visibility: QuestBindingVisibility;
  readonly priority?: number;
  /** Knowledge keys that make a `contextual` binding relevant to a character. */
  readonly requiresKnowledge?: readonly string[];
}

export interface QuestMetadata {
  readonly title?: string;
  readonly recommendedLevel?: readonly [number, number];
  readonly repeatability?: 'once' | 'repeatable' | 'world';
  readonly journal?: 'none' | 'leads';
  readonly tags?: readonly string[];
}

/** Deterministic upgrade of persisted character state authored beside the quest. */
export type QuestStateMigration = (
  state: Record<string, unknown>,
  fromRevision: number,
) => Record<string, unknown>;

export interface QuestDefinition {
  id: string;
  enabled?: boolean;
  zoneIds: number[];
  /** Authored state revision; independent of database schema migrations. */
  revision?: number;
  metadata?: QuestMetadata;
  bindings?: QuestBinding[];
  regions?: QuestRegionDefinition[];
  migrate?: QuestStateMigration;
  handlers: QuestHandlerDefinition<any>[];
}

/** Runtime-only effects applied by the owning zone. */
export type QuestZoneEffect =
  | { type: 'set_npc_target'; npcIndex: number; x: number; y: number; z: number }
  | { type: 'npc_say'; npcName: string; message: string; sessionId?: number }
  | { type: 'entity_say'; entityName: string; message: string; sessionId?: number }
  | { type: 'log'; questId: string; message: string };

/**
 * Persistent effects. Every one carries an idempotency anchor so reconnects, retries
 * and hot reloads cannot double-apply them.
 */
export type QuestPersistentEffect =
  | {
      type: 'quest_state_patch';
      sessionId: number;
      characterId: number | null;
      questKey: string;
      revision: number;
      patch: Record<string, unknown>;
    }
  | {
      type: 'knowledge_learn';
      sessionId: number;
      characterId: number | null;
      knowledgeKey: string;
      data?: Record<string, unknown>;
    }
  | {
      type: 'knowledge_forget';
      sessionId: number;
      characterId: number | null;
      knowledgeKey: string;
    }
  | {
      type: 'journal_discover';
      sessionId: number;
      characterId: number | null;
      questKey: string;
      leadKey: string;
      kind: QuestLeadKind;
      text: string;
      title: string | null;
      place: QuestLeadPlace | null;
      order: number;
    }
  | {
      type: 'journal_resolve';
      sessionId: number;
      characterId: number | null;
      questKey: string;
      leadKey: string;
      text: string | null;
    }
  | {
      type: 'journal_archive';
      sessionId: number;
      characterId: number | null;
      questKey: string;
    }
  | {
      type: 'award_xp';
      sessionId: number;
      characterId: number | null;
      questKey: string;
      amount: number;
      source: 'combat' | 'discovery' | 'quest' | 'world';
      sourceKey: string | null;
      /** Set when the award was gated by `awardXpOnce`; the flag lives in quest state. */
      awardKey: string | null;
    }
  | {
      type: 'item_turn_in_result';
      sessionId: number;
      characterId: number | null;
      npcName: string;
      consumed: boolean;
      items: readonly QuestItemSnapshot[];
    };

export type QuestEffect = QuestZoneEffect | QuestPersistentEffect;

const PERSISTENT_EFFECT_TYPES = new Set<QuestEffect['type']>([
  'quest_state_patch',
  'knowledge_learn',
  'knowledge_forget',
  'journal_discover',
  'journal_resolve',
  'journal_archive',
  'award_xp',
  'item_turn_in_result',
]);

export function isPersistentQuestEffect(
  effect: QuestEffect,
): effect is QuestPersistentEffect {
  return PERSISTENT_EFFECT_TYPES.has(effect.type);
}

/** Narrows an event actor that may be either a player or an NPC. */
export function isQuestPlayer(entity: QuestEntity | null): entity is QuestPlayer {
  return entity?.kind === 'player';
}

export function isQuestNpc(entity: QuestEntity | null): entity is QuestNpc {
  return entity?.kind === 'npc';
}

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
