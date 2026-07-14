import type {
  QuestAction,
  QuestDefinition,
  QuestEffect,
  QuestEntity,
  QuestEntitySnapshot,
  QuestEvent,
  QuestHandlerContext,
  QuestHandlerDefinition,
  QuestItem,
  QuestItemSnapshot,
  QuestNpc,
  QuestNpcSnapshot,
  QuestPlayer,
  QuestPlayerSnapshot,
  QuestVector3,
  QuestZone,
} from "./quest-types.js";

/** Deterministic per-shard quest runtime. Public entity methods emit through its zone boundary. */
export class QuestManager {
  private definitions: QuestDefinition[] = [];
  private readonly cursors = new Map<string, number>();
  private readonly npcSnapshots = new Map<string, QuestNpcSnapshot>();
  private readonly playerSnapshots = new Map<number, QuestPlayerSnapshot>();
  private readonly variables = new Map<string, unknown>();
  private revision = 0;

  constructor(
    private readonly zoneId: number,
    private readonly instanceId = 0,
    private readonly shortName: string | null = null,
  ) {}

  hydrate(state: {
    npcs?: readonly QuestNpcSnapshot[];
    players?: readonly QuestPlayerSnapshot[];
    variables?: Readonly<Record<string, unknown>>;
  }): void {
    for (const npc of state.npcs ?? []) this.remember(npc);
    for (const player of state.players ?? []) this.remember(player);
    for (const [key, value] of Object.entries(state.variables ?? {})) this.variables.set(key, value);
  }

  removePlayer(sessionId: number): void {
    this.playerSnapshots.delete(sessionId);
  }

  dispatchCustom(
    name: string,
    data?: unknown,
    options: {
      tick?: number;
      actor?: QuestPlayerSnapshot | QuestNpcSnapshot;
      receiver?: QuestNpcSnapshot;
    } = {},
  ): QuestEffect[] {
    return this.dispatch({
      type: "custom",
      tick: options.tick ?? 0,
      customEvent: name,
      data,
      ...(options.actor === undefined ? {} : { actor: options.actor }),
      ...(options.receiver === undefined ? {} : { receiver: options.receiver }),
    });
  }

  replace(definitions: readonly QuestDefinition[], revision: number): void {
    this.definitions = definitions.filter(
      (definition) => definition.enabled !== false && definition.zoneIds.includes(this.zoneId),
    );
    this.revision = revision;
    this.cursors.clear();
  }

  get status(): { revision: number; questCount: number } {
    return { revision: this.revision, questCount: this.definitions.length };
  }

  dispatch(event: QuestEvent): QuestEffect[] {
    const effects: QuestEffect[] = [];
    const emit = (effect: QuestEffect): void => { effects.push(effect); };
    if (event.actor) this.remember(event.actor);
    if (event.receiver) this.remember(event.receiver);
    for (const quest of this.definitions) {
      for (const [handlerIndex, handler] of quest.handlers.entries()) {
        if (!matches(handler, event)) continue;
        let stopPropagation = false;
        if (handler.handler) {
          const result = handler.handler(this.context(quest.id, event, emit) as never);
          if (Array.isArray(result)) effects.push(...result);
          else if (typeof result === "boolean") stopPropagation = result;
          else if (result) effects.push(result as QuestEffect);
        }
        for (const action of handler.actions ?? []) {
          const effect = this.reduceAction(quest.id, handlerIndex, action, event);
          if (effect) effects.push(effect);
        }
        if (stopPropagation) return effects;
      }
    }
    return effects;
  }

  private context(
    questId: string,
    event: QuestEvent,
    emit: (effect: QuestEffect) => void,
  ): QuestHandlerContext {
    const sessionId = event.sessionId ?? (event.actor?.kind === "player"
      ? (event.actor as QuestPlayerSnapshot).sessionId
      : undefined);
    const actorSnapshot = event.actor ?? (event.actorName
      ? { kind: "player", name: event.actorName, sessionId: sessionId ?? 0 }
      : undefined);
    const receiverSnapshot = event.receiver ?? (event.npcName || event.npcIndex !== undefined
      ? {
          kind: "npc",
          name: event.npcName ?? `NPC ${event.npcIndex ?? ""}`.trim(),
          ...(event.npcIndex === undefined ? {} : { npcIndex: event.npcIndex }),
        }
      : undefined);
    if (actorSnapshot) this.remember(actorSnapshot);
    if (receiverSnapshot) this.remember(receiverSnapshot);
    const resolvedActorSnapshot = actorSnapshot?.kind === "player"
      ? this.playerSnapshots.get(actorSnapshot.sessionId) ?? actorSnapshot
      : actorSnapshot === undefined
        ? undefined
        : this.npcSnapshots.get(normalizeNpcName(actorSnapshot.name)) ?? actorSnapshot;
    const resolvedReceiverSnapshot = receiverSnapshot === undefined
      ? undefined
      : this.npcSnapshots.get(normalizeNpcName(receiverSnapshot.name)) ?? receiverSnapshot;
    const actor = resolvedActorSnapshot
      ? entityFacade(resolvedActorSnapshot, questId, sessionId, emit)
      : null;
    const receiver = resolvedReceiverSnapshot
      ? new NpcFacade(resolvedReceiverSnapshot, questId, sessionId, emit)
      : null;
    const zone = new ZoneFacade(
      this.zoneId,
      this.instanceId,
      this.shortName,
      event.tick,
      questId,
      this.npcSnapshots,
      this.playerSnapshots,
      this.variables,
      sessionId,
      (name, data) => {
        for (const effect of this.dispatchCustom(name, data, {
          tick: event.tick,
          ...(actorSnapshot === undefined ? {} : { actor: actorSnapshot }),
          ...(receiverSnapshot === undefined ? {} : { receiver: receiverSnapshot }),
        })) emit(effect);
      },
      emit,
    );
    const base = { questId, event, zone, actor, receiver };

    switch (event.type) {
      case "zone_start":
        return { ...base, actor: null, receiver: null };
      case "npc_spawn": {
        const npc = receiver ?? requireNpc(actor, event);
        return { ...base, npc, actor: npc, receiver: npc };
      }
      case "npc_tick":
        return {
          ...base,
          npc: receiver ?? (actor?.kind === "npc" ? actor as QuestNpc : null),
        };
      case "player_enter": {
        const player = requirePlayer(actor, event);
        return { ...base, player, initiator: player, actor: player };
      }
      case "say": {
        const npc = requireNpc(receiver, event);
        const initiator = requireEntity(actor, "say", "actor");
        return { ...base, initiator, actor: initiator, npc, receiver: npc, message: event.message ?? "" };
      }
      case "signal": {
        const npc = requireNpc(receiver, event);
        return { ...base, initiator: actor, npc, receiver: npc, signal: event.signal ?? "" };
      }
      case "item_click": {
        const player = requirePlayer(actor, event);
        return {
          ...base,
          initiator: player,
          player,
          actor: player,
          item: requireItem(event.item, event),
        };
      }
      case "item_tick":
        return { ...base, owner: actor, item: requireItem(event.item, event) };
      case "custom":
        return { ...base, name: event.customEvent ?? "", data: event.data };
    }
  }

  private remember(snapshot: QuestPlayerSnapshot | QuestNpcSnapshot): void {
    if (snapshot.kind === "player") {
      const current = this.playerSnapshots.get(snapshot.sessionId);
      this.playerSnapshots.set(snapshot.sessionId, { ...current, ...snapshot });
      return;
    }
    const key = normalizeNpcName(snapshot.name);
    const current = this.npcSnapshots.get(key);
    this.npcSnapshots.set(key, { ...current, ...snapshot });
  }

  private reduceAction(
    questId: string,
    handlerIndex: number,
    action: QuestAction,
    event: QuestEvent,
  ): QuestEffect | null {
    if (action.type === "log") return { type: "log", questId, message: action.message };
    if (action.type === "npc_say") {
      const npcName = action.npcName === "event" ? event.npcName : action.npcName;
      if (!npcName) return null;
      return {
        type: "npc_say",
        npcName,
        message: interpolate(action.message, event),
        ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
      };
    }
    const npcIndex = action.npcIndex === "event" ? event.npcIndex : action.npcIndex;
    if (npcIndex === undefined) return null;
    if (action.type === "set_npc_target") {
      return { type: "set_npc_target", npcIndex, x: action.x, y: action.y, z: action.z };
    }
    if (action.points.length === 0) return null;
    const cursorKey = `${questId}:${handlerIndex}:${npcIndex}`;
    const cursor = this.cursors.get(cursorKey) ?? 0;
    const point = action.points[cursor % action.points.length]!;
    this.cursors.set(cursorKey, cursor + 1);
    return { type: "set_npc_target", npcIndex, ...point };
  }
}

class ZoneFacade implements QuestZone {
  readonly #questId: string;
  readonly #emit: (effect: QuestEffect) => void;
  readonly #variables: Map<string, unknown>;
  readonly #npcs: readonly QuestNpc[];
  readonly #players: readonly QuestPlayer[];
  readonly #emitCustomEvent: (name: string, data: unknown) => void;

  constructor(
    readonly id: number,
    readonly instanceId: number,
    readonly shortName: string | null,
    readonly tick: number,
    questId: string,
    npcSnapshots: ReadonlyMap<string, QuestNpcSnapshot>,
    playerSnapshots: ReadonlyMap<number, QuestPlayerSnapshot>,
    variables: Map<string, unknown>,
    replySessionId: number | undefined,
    emitCustomEvent: (name: string, data: unknown) => void,
    emit: (effect: QuestEffect) => void,
  ) {
    this.#questId = questId;
    this.#emit = emit;
    this.#variables = variables;
    this.#emitCustomEvent = emitCustomEvent;
    this.#npcs = [...npcSnapshots.values()].map(
      (snapshot) => new NpcFacade(snapshot, questId, replySessionId, emit),
    );
    this.#players = [...playerSnapshots.values()].map((snapshot) => new PlayerFacade(snapshot, emit));
  }

  get npcs(): readonly QuestNpc[] { return this.#npcs; }
  get players(): readonly QuestPlayer[] { return this.#players; }

  npcByName(name: string): QuestNpc | null {
    const normalized = normalizeNpcName(name);
    return this.#npcs.find((npc) => normalizeNpcName(npc.name) === normalized) ?? null;
  }

  playerByName(name: string): QuestPlayer | null {
    const normalized = name.trim().toLowerCase();
    return this.#players.find((player) => player.name.trim().toLowerCase() === normalized) ?? null;
  }

  playerBySession(sessionId: number): QuestPlayer | null {
    return this.#players.find((player) => player.sessionId === sessionId) ?? null;
  }

  get<T>(key: string): T | undefined {
    return this.#variables.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.#variables.set(key, value);
  }

  emitCustom(name: string, data?: unknown): void {
    this.#emitCustomEvent(name, data);
  }

  log(message: string): void {
    this.#emit({ type: "log", questId: this.#questId, message });
  }
}

abstract class EntityFacade implements QuestEntity {
  readonly #sessionIdForReply: number | undefined;
  readonly #emit: (effect: QuestEffect) => void;
  abstract readonly kind: "player" | "npc";
  readonly id: number | null;
  readonly name: string;
  readonly level: number | null;
  readonly classId: number | null;
  readonly raceId: number | null;
  readonly gender: number | null;
  readonly position: Readonly<QuestVector3 & { heading?: number }> | null;

  constructor(
    snapshot: QuestEntitySnapshot,
    sessionIdForReply: number | undefined,
    emit: (effect: QuestEffect) => void,
  ) {
    this.#sessionIdForReply = sessionIdForReply;
    this.#emit = emit;
    this.id = snapshot.id ?? null;
    this.name = snapshot.name;
    this.level = snapshot.level ?? null;
    this.classId = snapshot.classId ?? null;
    this.raceId = snapshot.raceId ?? null;
    this.gender = snapshot.gender ?? null;
    this.position = snapshot.position ?? null;
  }

  say(message: string): void {
    this.send({
      type: "entity_say",
      entityName: this.name,
      message,
      ...(this.replySessionId === undefined ? {} : { sessionId: this.replySessionId }),
    });
  }

  protected get replySessionId(): number | undefined {
    return this.#sessionIdForReply;
  }

  protected send(effect: QuestEffect): void {
    this.#emit(effect);
  }
}

class PlayerFacade extends EntityFacade implements QuestPlayer {
  readonly kind = "player" as const;
  readonly sessionId: number;

  constructor(snapshot: QuestPlayerSnapshot, emit: (effect: QuestEffect) => void) {
    super(snapshot, snapshot.sessionId, emit);
    this.sessionId = snapshot.sessionId;
  }
}

class NpcFacade extends EntityFacade implements QuestNpc {
  readonly #questId: string;
  readonly kind = "npc" as const;
  readonly npcId: number | null;
  readonly npcIndex: number | null;

  constructor(
    snapshot: QuestNpcSnapshot,
    questId: string,
    sessionIdForReply: number | undefined,
    emit: (effect: QuestEffect) => void,
  ) {
    super(snapshot, sessionIdForReply, emit);
    this.npcId = snapshot.npcId ?? null;
    this.npcIndex = snapshot.npcIndex ?? null;
    this.#questId = questId;
  }

  override say(message: string): void {
    this.send({
      type: "npc_say",
      npcName: this.name,
      message,
      ...(this.replySessionId === undefined ? {} : { sessionId: this.replySessionId }),
    });
  }

  moveTo(position: QuestVector3): void {
    if (this.npcIndex === null) {
      this.send({ type: "log", questId: this.#questId, message: `${this.name} has no simulation index` });
      return;
    }
    this.send({ type: "set_npc_target", npcIndex: this.npcIndex, ...position });
  }
}

class ItemFacade implements QuestItem {
  readonly id: number;
  readonly name: string;
  readonly charges: number | null;
  readonly slot: number | null;

  constructor(snapshot: QuestItemSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.charges = snapshot.charges ?? null;
    this.slot = snapshot.slot ?? null;
  }
}

function entityFacade(
  snapshot: QuestEntitySnapshot,
  questId: string,
  sessionId: number | undefined,
  emit: (effect: QuestEffect) => void,
): QuestEntity {
  if (snapshot.kind === "npc") {
    return new NpcFacade(snapshot as QuestNpcSnapshot, questId, sessionId, emit);
  }
  return new PlayerFacade({ ...snapshot, kind: "player", sessionId: sessionId ?? 0 }, emit);
}

function requireEntity(entity: QuestEntity | null, event: string, role: string): QuestEntity {
  if (!entity) throw new Error(`${event} quest event requires a ${role}`);
  return entity;
}

function requireNpc(entity: QuestEntity | null, event: QuestEvent): QuestNpc {
  if (!entity || entity.kind !== "npc") throw new Error(`${event.type} quest event requires an NPC`);
  return entity as QuestNpc;
}

function requirePlayer(entity: QuestEntity | null, event: QuestEvent): QuestPlayer {
  if (!entity || entity.kind !== "player") throw new Error(`${event.type} quest event requires a player`);
  return entity as QuestPlayer;
}

function requireItem(item: QuestItemSnapshot | undefined, event: QuestEvent): QuestItem {
  if (!item) throw new Error(`${event.type} quest event requires an item`);
  return new ItemFacade(item);
}

function matches(handler: QuestHandlerDefinition<any>, event: QuestEvent): boolean {
  if (handler.event !== event.type) return false;
  if (handler.everyTicks !== undefined) {
    if (handler.everyTicks < 1 || event.tick % handler.everyTicks !== 0) return false;
  }
  if (handler.messageIncludes !== undefined) {
    if (!event.message?.toLowerCase().includes(handler.messageIncludes.toLowerCase())) return false;
  }
  if (handler.signal !== undefined && handler.signal !== event.signal) return false;
  if (handler.npcName !== undefined && normalizeNpcName(handler.npcName) !== normalizeNpcName(event.npcName ?? event.receiver?.name)) {
    return false;
  }
  if (handler.target?.kind === "item" && handler.target.id !== event.item?.id) return false;
  if (handler.target?.kind === "custom" && handler.target.name !== event.customEvent) return false;
  return true;
}

function normalizeNpcName(value: string | undefined): string {
  return (value ?? "").trim().replaceAll(" ", "_").toLowerCase();
}

function interpolate(template: string, event: QuestEvent): string {
  return template
    .replaceAll("{{actorName}}", event.actorName ?? event.actor?.name ?? "traveler")
    .replaceAll("{{npcName}}", (event.npcName ?? event.receiver?.name ?? "").replaceAll("_", " "));
}
