import {
  QuestCharacterState,
  emptyCharacterSnapshot,
  type QuestCharacterSnapshot,
  type QuestJournalEntry,
} from "./quest-state.js";
import {
  isPersistentQuestEffect,
  type QuestAction,
  type QuestDefinition,
  type QuestEffect,
  type QuestEntity,
  type QuestEntitySnapshot,
  type QuestEvent,
  type QuestHandlerContext,
  type QuestHandlerDefinition,
  type QuestItem,
  type QuestItemSnapshot,
  type QuestLeadOptions,
  type QuestNpc,
  type QuestNpcSnapshot,
  type QuestPlayer,
  type QuestPlayerInventoryApi,
  type QuestPlayerJournalApi,
  type QuestPlayerKnowledgeApi,
  type QuestPlayerProgressionApi,
  type QuestPlayerSnapshot,
  type QuestPersistentEffect,
  type QuestPlayerStateApi,
  type QuestRegion,
  type QuestRegionDefinition,
  type QuestVector3,
  type QuestWorldContext,
  type QuestXpOptions,
  type QuestZone,
} from "./quest-types.js";

export interface QuestManagerOptions {
  readonly tickRateHz?: number;
}

/** One character's pending writes, drained by the boundary that owns the database. */
export interface QuestPersistenceBatch {
  readonly sessionId: number;
  readonly characterId: number;
  readonly quests: ReadonlyArray<{
    readonly questKey: string;
    readonly revision: number;
    readonly state: Record<string, unknown>;
  }>;
  readonly knowledgeLearned: ReadonlyArray<{
    readonly key: string;
    readonly data: Record<string, unknown>;
  }>;
  readonly knowledgeForgotten: readonly string[];
}

interface ProximityWatcher {
  readonly npcKey: string;
  readonly npcName: string;
  readonly radius: number;
  readonly enter: boolean;
  readonly leave: boolean;
}

interface QuestTimer {
  readonly dueTick: number;
  readonly sessionId: number | null;
  readonly questKey: string;
  readonly name: string;
}

/** Deterministic per-shard quest runtime. Public entity methods emit through its zone boundary. */
export class QuestManager {
  private definitions: QuestDefinition[] = [];
  private readonly cursors = new Map<string, number>();
  private readonly npcSnapshots = new Map<string, QuestNpcSnapshot>();
  private readonly playerSnapshots = new Map<number, QuestPlayerSnapshot>();
  private readonly variables = new Map<string, unknown>();
  private readonly characters = new Map<number, QuestCharacterState>();
  private readonly regions = new Map<string, QuestRegionDefinition>();
  private readonly regionMembership = new Map<number, Set<string>>();
  private readonly proximityMembership = new Map<number, Set<string>>();
  private readonly proximityWatchers: ProximityWatcher[] = [];
  private readonly dirtyQuests = new Map<number, Set<string>>();
  private readonly dirtyKnowledge = new Map<number, Map<string, "learn" | "forget">>();
  private timers: QuestTimer[] = [];
  private worldFlags: Record<string, unknown> = {};
  private timeOfDay: number | null = null;
  private weather: string | null = null;
  private revision = 0;
  private readonly tickMs: number;

  constructor(
    private readonly zoneId: number,
    private readonly instanceId = 0,
    private readonly shortName: string | null = null,
    options: QuestManagerOptions = {},
  ) {
    this.tickMs = 1000 / Math.max(1, options.tickRateHz ?? 10);
  }

  hydrate(state: {
    npcs?: readonly QuestNpcSnapshot[];
    players?: readonly QuestPlayerSnapshot[];
    variables?: Readonly<Record<string, unknown>>;
  }): void {
    for (const npc of state.npcs ?? []) this.remember(npc);
    for (const player of state.players ?? []) this.remember(player);
    for (const [key, value] of Object.entries(state.variables ?? {})) this.variables.set(key, value);
  }

  /**
   * Loads a character's persisted quest record into the shard so handlers stay
   * synchronous. Authored state migrations run here, before any handler sees state.
   */
  attachCharacter(sessionId: number, snapshot: QuestCharacterSnapshot): void {
    const state = new QuestCharacterState(sessionId, snapshot);
    for (const definition of this.definitions) {
      state.ensureRevision(definition.id, definition.revision ?? 1, definition.migrate);
    }
    this.characters.set(sessionId, state);
  }

  character(sessionId: number): QuestCharacterState | null {
    return this.characters.get(sessionId) ?? null;
  }

  journalFor(sessionId: number): readonly QuestJournalEntry[] {
    const character = this.characters.get(sessionId);
    if (!character) return [];
    const titles = new Map<string, string | null>(
      this.definitions.map((definition) => [definition.id, definition.metadata?.title ?? null]),
    );
    return character.journal(titles);
  }

  removePlayer(sessionId: number): void {
    this.playerSnapshots.delete(sessionId);
    this.characters.delete(sessionId);
    this.regionMembership.delete(sessionId);
    this.proximityMembership.delete(sessionId);
    this.dirtyQuests.delete(sessionId);
    this.dirtyKnowledge.delete(sessionId);
    this.timers = this.timers.filter((timer) => timer.sessionId !== sessionId);
  }

  /** Drains everything that changed since the last call. Safe to call every tick. */
  drainPersistence(): readonly QuestPersistenceBatch[] {
    const batches: QuestPersistenceBatch[] = [];
    const sessionIds = new Set([...this.dirtyQuests.keys(), ...this.dirtyKnowledge.keys()]);
    for (const sessionId of sessionIds) {
      const character = this.characters.get(sessionId);
      const characterId = character?.characterId ?? null;
      const questKeys = this.dirtyQuests.get(sessionId) ?? new Set<string>();
      const knowledge = this.dirtyKnowledge.get(sessionId) ?? new Map<string, "learn" | "forget">();
      this.dirtyQuests.delete(sessionId);
      this.dirtyKnowledge.delete(sessionId);
      if (!character || characterId === null) continue;
      batches.push({
        sessionId,
        characterId,
        quests: [...questKeys].map((questKey) => ({
          questKey,
          revision: character.revision(questKey),
          state: { ...character.state(questKey) },
        })),
        knowledgeLearned: [...knowledge]
          .filter(([, action]) => action === "learn")
          .map(([key]) => ({ key, data: {} })),
        knowledgeForgotten: [...knowledge]
          .filter(([, action]) => action === "forget")
          .map(([key]) => key),
      });
    }
    return batches;
  }

  /** Applied by the progression service after it commits an award. */
  setCharacterProgression(sessionId: number, experience: number, level: number): void {
    this.characters.get(sessionId)?.setProgression(experience, level);
    const snapshot = this.playerSnapshots.get(sessionId);
    if (snapshot) this.playerSnapshots.set(sessionId, { ...snapshot, level });
  }

  setCharacterInventory(sessionId: number, items: readonly QuestItemSnapshot[]): void {
    this.characters.get(sessionId)?.setInventory(items);
  }

  setWorldContext(context: {
    readonly timeOfDay?: number | null;
    readonly weather?: string | null;
    readonly flags?: Readonly<Record<string, unknown>>;
  }): void {
    if (context.timeOfDay !== undefined) this.timeOfDay = context.timeOfDay;
    if (context.weather !== undefined) this.weather = context.weather;
    if (context.flags) this.worldFlags = { ...this.worldFlags, ...context.flags };
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
    this.regions.clear();
    this.proximityWatchers.length = 0;
    for (const definition of this.definitions) {
      for (const region of definition.regions ?? []) this.regions.set(region.key, region);
      for (const handler of definition.handlers) {
        if (handler.event !== "proximity_enter" && handler.event !== "proximity_leave") continue;
        const npcName = handler.npcName ?? (handler.target?.kind === "npc" ? handler.target.name : null);
        if (!npcName || handler.radius === undefined) continue;
        this.addProximityWatcher(npcName, handler.radius, handler.event);
      }
    }
    // Re-run migrations for characters already on the shard when quest code hot reloads.
    for (const character of this.characters.values()) {
      for (const definition of this.definitions) {
        character.ensureRevision(definition.id, definition.revision ?? 1, definition.migrate);
      }
    }
  }

  get status(): { revision: number; questCount: number } {
    return { revision: this.revision, questCount: this.definitions.length };
  }

  /**
   * Feeds a character position into the authored region and proximity trackers.
   * Handlers never poll coordinates themselves.
   */
  updatePlayerPosition(
    sessionId: number,
    position: QuestVector3,
    tick: number,
  ): QuestEffect[] {
    const snapshot = this.playerSnapshots.get(sessionId);
    if (snapshot) this.playerSnapshots.set(sessionId, { ...snapshot, position });
    const effects: QuestEffect[] = [];
    effects.push(...this.syncRegions(sessionId, position, tick));
    effects.push(...this.syncProximity(sessionId, position, tick));
    return effects;
  }

  /** Named per-character timers, so scripts never poll `npc_tick`. */
  advanceTimers(tick: number): QuestEffect[] {
    if (this.timers.length === 0) return [];
    const due = this.timers.filter((timer) => timer.dueTick <= tick);
    if (due.length === 0) return [];
    this.timers = this.timers.filter((timer) => timer.dueTick > tick);
    const effects: QuestEffect[] = [];
    for (const timer of due) {
      const actor = timer.sessionId === null ? undefined : this.playerSnapshots.get(timer.sessionId);
      effects.push(...this.dispatch({
        type: "timer",
        tick,
        timerName: timer.name,
        ...(timer.sessionId === null ? {} : { sessionId: timer.sessionId }),
        ...(actor === undefined ? {} : { actor }),
      }));
    }
    return effects;
  }

  dispatchNpcDeath(options: {
    readonly tick: number;
    readonly npc: QuestNpcSnapshot;
    readonly killer?: QuestPlayerSnapshot | QuestNpcSnapshot;
    readonly creditSessionIds?: readonly number[];
  }): QuestEffect[] {
    return this.dispatch({
      type: "npc_death",
      tick: options.tick,
      receiver: options.npc,
      npcName: options.npc.name,
      ...(options.killer === undefined ? {} : { killer: options.killer }),
      ...(options.killer?.kind === "player" ? { sessionId: options.killer.sessionId } : {}),
      creditSessionIds: options.creditSessionIds ?? [],
    });
  }

  dispatchTurnIn(options: {
    readonly tick: number;
    readonly sessionId: number;
    readonly npcName: string;
    readonly items: readonly QuestItemSnapshot[];
    readonly actorName?: string;
  }): QuestEffect[] {
    return this.dispatch({
      type: "item_turn_in",
      tick: options.tick,
      sessionId: options.sessionId,
      npcName: options.npcName,
      items: options.items,
      ...(options.actorName === undefined ? {} : { actorName: options.actorName }),
    });
  }

  dispatchLevelUp(options: {
    readonly tick: number;
    readonly sessionId: number;
    readonly level: number;
    readonly previousLevel: number;
  }): QuestEffect[] {
    return this.dispatch({
      type: "level_up",
      tick: options.tick,
      sessionId: options.sessionId,
      level: options.level,
      previousLevel: options.previousLevel,
    });
  }

  dispatch(event: QuestEvent): QuestEffect[] {
    const effects: QuestEffect[] = [];
    const emit = (effect: QuestEffect): void => { effects.push(effect); };
    this.currentTick = event.tick;
    if (event.actor) this.remember(event.actor);
    if (event.receiver) this.remember(event.receiver);
    const turnIn = event.type === "item_turn_in" ? { consumed: false } : null;
    for (const quest of this.definitions) {
      for (const [handlerIndex, handler] of quest.handlers.entries()) {
        if (!matches(handler, event)) continue;
        if (!this.claimOnce(quest, handlerIndex, handler, event, emit)) continue;
        let stopPropagation = false;
        if (handler.handler) {
          const result = handler.handler(
            this.context(quest, event, emit, turnIn) as never,
          );
          if (Array.isArray(result)) effects.push(...result);
          else if (typeof result === "boolean") stopPropagation = result;
          else if (result) effects.push(result as QuestEffect);
        }
        for (const action of handler.actions ?? []) {
          const effect = this.reduceAction(quest.id, handlerIndex, action, event);
          if (effect) effects.push(effect);
        }
        if (stopPropagation) return this.finalize(event, turnIn, effects);
      }
    }
    return this.finalize(event, turnIn, effects);
  }

  private finalize(
    event: QuestEvent,
    turnIn: { consumed: boolean } | null,
    effects: QuestEffect[],
  ): QuestEffect[] {
    if (turnIn && event.sessionId !== undefined) {
      effects.push({
        type: "item_turn_in_result",
        sessionId: event.sessionId,
        characterId: this.characters.get(event.sessionId)?.characterId ?? null,
        npcName: event.npcName ?? "",
        consumed: turnIn.consumed,
        items: event.items ?? [],
      });
    }
    for (const effect of effects) {
      if (!isPersistentQuestEffect(effect)) continue;
      this.trackDirty(effect);
    }
    return effects;
  }

  private trackDirty(effect: QuestPersistentEffect): void {
    if (effect.type === "knowledge_learn" || effect.type === "knowledge_forget") {
      const pending = this.dirtyKnowledge.get(effect.sessionId) ?? new Map();
      pending.set(effect.knowledgeKey, effect.type === "knowledge_learn" ? "learn" : "forget");
      this.dirtyKnowledge.set(effect.sessionId, pending);
      return;
    }
    if (effect.type === "item_turn_in_result") return;
    // A one-time award writes its flag into quest state, so the row is dirty too.
    if (effect.type === "award_xp" && effect.awardKey === null) return;
    const pending = this.dirtyQuests.get(effect.sessionId) ?? new Set<string>();
    pending.add(effect.questKey);
    this.dirtyQuests.set(effect.sessionId, pending);
  }

  /** Enforces `oncePerPlayer` before the handler runs and records the claim. */
  private claimOnce(
    quest: QuestDefinition,
    handlerIndex: number,
    handler: QuestHandlerDefinition<any>,
    event: QuestEvent,
    emit: (effect: QuestEffect) => void,
  ): boolean {
    if (!handler.oncePerPlayer) return true;
    const sessionId = this.sessionIdFor(event);
    if (sessionId === undefined) return true;
    const character = this.characters.get(sessionId);
    if (!character) return true;
    const handlerKey = `${handler.event}:${handlerIndex}`;
    if (character.handlerFired(quest.id, handlerKey)) return false;
    character.markHandlerFired(quest.id, handlerKey);
    emit({
      type: "quest_state_patch",
      sessionId,
      characterId: character.characterId,
      questKey: quest.id,
      revision: character.revision(quest.id),
      patch: { once: { ...(character.state(quest.id).once as object) } },
    });
    return true;
  }

  private sessionIdFor(event: QuestEvent): number | undefined {
    if (event.sessionId !== undefined) return event.sessionId;
    return event.actor?.kind === "player"
      ? (event.actor as QuestPlayerSnapshot).sessionId
      : undefined;
  }

  private context(
    quest: QuestDefinition,
    event: QuestEvent,
    emit: (effect: QuestEffect) => void,
    turnIn: { consumed: boolean } | null,
  ): QuestHandlerContext {
    const questId = quest.id;
    const sessionId = this.sessionIdFor(event);
    const actorSnapshot = event.actor ?? (event.actorName
      ? { kind: "player", name: event.actorName, sessionId: sessionId ?? 0 }
      : sessionId !== undefined
        ? this.playerSnapshots.get(sessionId)
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
      ? this.entityFacade(resolvedActorSnapshot, questId, sessionId, emit)
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
      this.regions,
      sessionId,
      {
        timeOfDay: this.timeOfDay,
        weather: this.weather,
        flags: this.worldFlags,
      },
      (snapshot, replySessionId) => this.playerFacade(snapshot, questId, replySessionId, emit),
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
      case "item_turn_in": {
        const player = requirePlayer(actor, event);
        const npc = requireNpc(receiver, event);
        return {
          ...base,
          initiator: player,
          player,
          actor: player,
          npc,
          receiver: npc,
          items: (event.items ?? []).map((item) => new ItemFacade(item)),
          consume: () => { if (turnIn) turnIn.consumed = true; },
          refuse: () => { if (turnIn) turnIn.consumed = false; },
        };
      }
      case "region_enter":
      case "region_leave": {
        const player = requirePlayer(actor, event);
        return {
          ...base,
          player,
          initiator: player,
          actor: player,
          region: this.regionFacade(event.regionKey ?? ""),
        };
      }
      case "proximity_enter":
      case "proximity_leave": {
        const player = requirePlayer(actor, event);
        const npc = requireNpc(receiver, event);
        return {
          ...base,
          player,
          initiator: player,
          actor: player,
          npc,
          receiver: npc,
          distance: event.distance ?? 0,
        };
      }
      case "npc_death": {
        const npc = requireNpc(receiver, event);
        const killer = event.killer
          ? this.entityFacade(event.killer, questId, sessionId, emit)
          : null;
        const credit = (event.creditSessionIds ?? [])
          .map((id) => {
            const snapshot = this.playerSnapshots.get(id);
            return snapshot ? this.playerFacade(snapshot, questId, id, emit) : null;
          })
          .filter((player): player is QuestPlayer => player !== null);
        return {
          ...base,
          npc,
          receiver: npc,
          killer,
          credit,
          position: npc.position,
        };
      }
      case "timer": {
        const player = actor?.kind === "player" ? actor as QuestPlayer : null;
        return { ...base, name: event.timerName ?? "", player, initiator: player };
      }
      case "level_up": {
        const player = requirePlayer(actor, event);
        return {
          ...base,
          player,
          initiator: player,
          actor: player,
          level: event.level ?? player.level ?? 1,
          previousLevel: event.previousLevel ?? Math.max(1, (event.level ?? 1) - 1),
        };
      }
      case "custom":
        return { ...base, name: event.customEvent ?? "", data: event.data };
    }
  }

  private regionFacade(key: string): QuestRegion {
    const definition = this.regions.get(key);
    return {
      key,
      label: definition?.label ?? null,
      center: definition ? regionCenter(definition) : { x: 0, y: 0, z: 0 },
    };
  }

  private entityFacade(
    snapshot: QuestEntitySnapshot,
    questId: string,
    sessionId: number | undefined,
    emit: (effect: QuestEffect) => void,
  ): QuestEntity {
    if (snapshot.kind === "npc") {
      return new NpcFacade(snapshot as QuestNpcSnapshot, questId, sessionId, emit);
    }
    const playerSnapshot: QuestPlayerSnapshot = {
      ...snapshot,
      kind: "player",
      sessionId: (snapshot as QuestPlayerSnapshot).sessionId ?? sessionId ?? 0,
    };
    return this.playerFacade(playerSnapshot, questId, playerSnapshot.sessionId, emit);
  }

  private playerFacade(
    snapshot: QuestPlayerSnapshot,
    questId: string,
    sessionId: number | undefined,
    emit: (effect: QuestEffect) => void,
  ): QuestPlayer {
    const resolvedSession = snapshot.sessionId ?? sessionId ?? 0;
    const character = this.characters.get(resolvedSession)
      ?? new QuestCharacterState(resolvedSession, emptyCharacterSnapshot({
        ...(snapshot.characterId === undefined ? {} : { characterId: snapshot.characterId }),
        name: snapshot.name,
        level: snapshot.level ?? 1,
      }));
    const definition = this.definitions.find((candidate) => candidate.id === questId);
    character.ensureRevision(questId, definition?.revision ?? 1, definition?.migrate);
    return new PlayerFacade(snapshot, questId, character, emit, (key) => {
      const other = this.definitions.find((candidate) => candidate.id === key);
      character.ensureRevision(key, other?.revision ?? 1, other?.migrate);
    }, (name, delayMs, questKey) => {
      this.scheduleTimer(resolvedSession, questKey, name, delayMs);
    }, (name, questKey) => {
      this.timers = this.timers.filter(
        (timer) => !(timer.sessionId === resolvedSession && timer.questKey === questKey && timer.name === name),
      );
    });
  }

  private scheduleTimer(
    sessionId: number,
    questKey: string,
    name: string,
    delayMs: number,
  ): void {
    const dueTick = this.currentTick + Math.max(1, Math.ceil(delayMs / this.tickMs));
    this.timers = this.timers.filter(
      (timer) => !(timer.sessionId === sessionId && timer.questKey === questKey && timer.name === name),
    );
    this.timers.push({ dueTick, sessionId, questKey, name });
  }

  private currentTick = 0;

  private syncRegions(
    sessionId: number,
    position: QuestVector3,
    tick: number,
  ): QuestEffect[] {
    this.currentTick = tick;
    if (this.regions.size === 0) return [];
    const previous = this.regionMembership.get(sessionId) ?? new Set<string>();
    const next = new Set<string>();
    for (const region of this.regions.values()) {
      if (containsPoint(region.shape, position)) next.add(region.key);
    }
    this.regionMembership.set(sessionId, next);
    const effects: QuestEffect[] = [];
    for (const key of next) {
      if (previous.has(key)) continue;
      effects.push(...this.dispatch({
        type: "region_enter",
        tick,
        sessionId,
        regionKey: key,
      }));
    }
    for (const key of previous) {
      if (next.has(key)) continue;
      effects.push(...this.dispatch({
        type: "region_leave",
        tick,
        sessionId,
        regionKey: key,
      }));
    }
    return effects;
  }

  private syncProximity(
    sessionId: number,
    position: QuestVector3,
    tick: number,
  ): QuestEffect[] {
    if (this.proximityWatchers.length === 0) return [];
    const previous = this.proximityMembership.get(sessionId) ?? new Set<string>();
    const next = new Set<string>();
    const effects: QuestEffect[] = [];
    for (const watcher of this.proximityWatchers) {
      const npc = this.npcSnapshots.get(watcher.npcKey);
      if (!npc?.position) continue;
      const distance = Math.hypot(
        npc.position.x - position.x,
        npc.position.y - position.y,
        npc.position.z - position.z,
      );
      const id = `${watcher.npcKey}:${watcher.radius}`;
      const inside = distance <= watcher.radius;
      if (inside) next.add(id);
      if (inside && !previous.has(id) && watcher.enter) {
        effects.push(...this.dispatch({
          type: "proximity_enter",
          tick,
          sessionId,
          npcName: npc.name,
          receiver: npc,
          distance,
          proximityRadius: watcher.radius,
        }));
      }
      if (!inside && previous.has(id) && watcher.leave) {
        effects.push(...this.dispatch({
          type: "proximity_leave",
          tick,
          sessionId,
          npcName: npc.name,
          receiver: npc,
          distance,
          proximityRadius: watcher.radius,
        }));
      }
    }
    this.proximityMembership.set(sessionId, next);
    return effects;
  }

  private addProximityWatcher(
    npcName: string,
    radius: number,
    event: "proximity_enter" | "proximity_leave",
  ): void {
    const npcKey = normalizeNpcName(npcName);
    const existing = this.proximityWatchers.findIndex(
      (watcher) => watcher.npcKey === npcKey && watcher.radius === radius,
    );
    if (existing >= 0) {
      const watcher = this.proximityWatchers[existing]!;
      this.proximityWatchers[existing] = {
        ...watcher,
        enter: watcher.enter || event === "proximity_enter",
        leave: watcher.leave || event === "proximity_leave",
      };
      return;
    }
    this.proximityWatchers.push({
      npcKey,
      npcName,
      radius,
      enter: event === "proximity_enter",
      leave: event === "proximity_leave",
    });
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
  readonly #regions: ReadonlyMap<string, QuestRegionDefinition>;
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
    regions: ReadonlyMap<string, QuestRegionDefinition>,
    replySessionId: number | undefined,
    readonly world: QuestWorldContext,
    playerFacade: (
      snapshot: QuestPlayerSnapshot,
      replySessionId: number | undefined,
    ) => QuestPlayer,
    emitCustomEvent: (name: string, data: unknown) => void,
    emit: (effect: QuestEffect) => void,
  ) {
    this.#questId = questId;
    this.#emit = emit;
    this.#variables = variables;
    this.#regions = regions;
    this.#emitCustomEvent = emitCustomEvent;
    this.#npcs = [...npcSnapshots.values()].map(
      (snapshot) => new NpcFacade(snapshot, questId, replySessionId, emit),
    );
    this.#players = [...playerSnapshots.values()].map(
      (snapshot) => playerFacade(snapshot, snapshot.sessionId),
    );
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

  playersWithin(position: QuestVector3, radius: number): readonly QuestPlayer[] {
    return this.#players.filter((player) => {
      const at = player.position;
      if (!at) return false;
      return Math.hypot(at.x - position.x, at.y - position.y, at.z - position.z) <= radius;
    });
  }

  region(key: string): QuestRegion | null {
    const definition = this.#regions.get(key);
    if (!definition) return null;
    return {
      key: definition.key,
      label: definition.label ?? null,
      center: regionCenter(definition),
    };
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
  readonly characterId: number | null;
  readonly quest: QuestPlayerStateApi;
  readonly knowledge: QuestPlayerKnowledgeApi;
  readonly journal: QuestPlayerJournalApi;
  readonly progression: QuestPlayerProgressionApi;
  readonly inventory: QuestPlayerInventoryApi;

  constructor(
    snapshot: QuestPlayerSnapshot,
    questId: string,
    state: QuestCharacterState,
    emit: (effect: QuestEffect) => void,
    ensureQuest: (questKey: string) => void,
    scheduleTimer: (name: string, delayMs: number, questKey: string) => void,
    clearTimer: (name: string, questKey: string) => void,
  ) {
    super(snapshot, snapshot.sessionId, emit);
    this.sessionId = snapshot.sessionId;
    this.characterId = state.characterId ?? snapshot.characterId ?? null;
    const sessionId = snapshot.sessionId;
    const characterId = this.characterId;
    const scope = (questKey?: string): string => {
      if (!questKey || questKey === questId) return questId;
      ensureQuest(questKey);
      return questKey;
    };

    this.quest = {
      state: <T extends object = Record<string, unknown>>(questKey?: string) =>
        state.state(scope(questKey)) as Readonly<T>,
      get: <T,>(key: string, questKey?: string) =>
        state.state(scope(questKey))[key] as T | undefined,
      set: (key: string, value: unknown, questKey?: string) => {
        this.quest.patch({ [key]: value }, questKey);
      },
      patch: (patch, questKey) => {
        const key = scope(questKey);
        const changed = state.patch(key, patch);
        if (!changed) return;
        emit({
          type: "quest_state_patch",
          sessionId,
          characterId,
          questKey: key,
          revision: state.revision(key),
          patch: changed,
        });
      },
      timer: (name, delayMs, questKey) => scheduleTimer(name, delayMs, scope(questKey)),
      clearTimer: (name, questKey) => clearTimer(name, scope(questKey)),
    };

    this.knowledge = {
      has: (key) => state.knows(key),
      keys: () => state.knowledgeKeys(),
      learn: (key, data) => {
        if (!state.learn(key, data as Record<string, unknown> | undefined)) return false;
        emit({
          type: "knowledge_learn",
          sessionId,
          characterId,
          knowledgeKey: key,
          ...(data === undefined ? {} : { data: { ...data } }),
        });
        return true;
      },
      forget: (key) => {
        if (!state.forget(key)) return;
        emit({ type: "knowledge_forget", sessionId, characterId, knowledgeKey: key });
      },
    };

    this.journal = {
      has: (leadKey, questKey) => state.hasLead(scope(questKey), leadKey),
      discover: (leadKey: string, lead: QuestLeadOptions) => {
        const key = scope(lead.questKey);
        const record = {
          kind: lead.kind ?? "observation",
          text: lead.text,
          title: lead.title ?? null,
          place: lead.place ?? null,
        } as const;
        const order = state.discoverLead(key, leadKey, record);
        if (order === null) return false;
        emit({
          type: "journal_discover",
          sessionId,
          characterId,
          questKey: key,
          leadKey,
          ...record,
          order,
        });
        return true;
      },
      resolve: (leadKey, options) => {
        const key = scope(options?.questKey);
        if (!state.resolveLead(key, leadKey, options?.text ?? null)) return;
        emit({
          type: "journal_resolve",
          sessionId,
          characterId,
          questKey: key,
          leadKey,
          text: options?.text ?? null,
        });
      },
      archive: (questKey) => {
        const key = scope(questKey);
        if (!state.archive(key)) return;
        emit({ type: "journal_archive", sessionId, characterId, questKey: key });
      },
    };

    this.progression = {
      get experience(): number { return state.experience; },
      awardXp: (amount, options) => {
        if (amount <= 0) return;
        state.addExperience(amount);
        emit({
          type: "award_xp",
          sessionId,
          characterId,
          questKey: questId,
          amount,
          source: options?.source ?? "quest",
          sourceKey: options?.sourceKey ?? questId,
          awardKey: null,
        });
      },
      awardXpOnce: (awardKey: string, amount: number, options?: QuestXpOptions) => {
        if (amount <= 0) return false;
        if (!state.grant(questId, awardKey)) return false;
        state.addExperience(amount);
        emit({
          type: "award_xp",
          sessionId,
          characterId,
          questKey: questId,
          amount,
          source: options?.source ?? "discovery",
          sourceKey: options?.sourceKey ?? `${questId}:${awardKey}`,
          awardKey,
        });
        return true;
      },
      granted: (awardKey, questKey) => state.granted(scope(questKey), awardKey),
    };

    this.inventory = {
      get items(): readonly QuestItemSnapshot[] { return state.inventory; },
      has: (itemId) => state.inventory.some((item) => item.id === itemId),
      count: (itemId) => state.inventory
        .filter((item) => item.id === itemId)
        .reduce((total, item) => total + (item.quantity ?? 1), 0),
    };
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
  readonly quantity: number;

  constructor(snapshot: QuestItemSnapshot) {
    this.id = snapshot.id;
    this.name = snapshot.name;
    this.charges = snapshot.charges ?? null;
    this.slot = snapshot.slot ?? null;
    this.quantity = snapshot.quantity ?? 1;
  }
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
  if (handler.timerName !== undefined && handler.timerName !== event.timerName) return false;
  if (handler.npcName !== undefined && normalizeNpcName(handler.npcName) !== normalizeNpcName(event.npcName ?? event.receiver?.name)) {
    return false;
  }
  if (handler.target?.kind === "item" && handler.target.id !== event.item?.id) return false;
  if (handler.target?.kind === "custom" && handler.target.name !== event.customEvent) return false;
  if (handler.regionKey !== undefined && handler.regionKey !== event.regionKey) return false;
  if (
    event.proximityRadius !== undefined
    && handler.radius !== undefined
    && handler.radius !== event.proximityRadius
  ) return false;
  return true;
}

function containsPoint(shape: QuestRegionDefinition["shape"], point: QuestVector3): boolean {
  if (shape.kind === "sphere") {
    return Math.hypot(point.x - shape.x, point.y - shape.y, point.z - shape.z) <= shape.radius;
  }
  return point.x >= shape.minX && point.x <= shape.maxX
    && point.y >= shape.minY && point.y <= shape.maxY
    && point.z >= shape.minZ && point.z <= shape.maxZ;
}

function regionCenter(region: QuestRegionDefinition): QuestVector3 {
  const shape = region.shape;
  if (shape.kind === "sphere") return { x: shape.x, y: shape.y, z: shape.z };
  return {
    x: (shape.minX + shape.maxX) / 2,
    y: (shape.minY + shape.maxY) / 2,
    z: (shape.minZ + shape.maxZ) / 2,
  };
}

function normalizeNpcName(value: string | undefined): string {
  return (value ?? "").trim().replaceAll(" ", "_").toLowerCase();
}

function interpolate(template: string, event: QuestEvent): string {
  return template
    .replaceAll("{{actorName}}", event.actorName ?? event.actor?.name ?? "traveler")
    .replaceAll("{{npcName}}", (event.npcName ?? event.receiver?.name ?? "").replaceAll("_", " "));
}
