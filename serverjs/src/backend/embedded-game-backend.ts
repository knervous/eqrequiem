import type { DatabaseBackend } from "../db/backend.js";
import type { CharacterProfileProjection } from "../persist/game-data-repository.js";
import { GameDatabase } from "../persist/game-database.js";
import { CharacterRosterService } from "../persist/character-roster-service.js";
import { characterSelectProjection } from "../persist/character-select-projection.js";
import { QuestManager } from "../zone/quest-manager.js";
import { QuestEffectApplier } from "../zone/quest-effect-applier.js";
import { CharacterProgressRepository } from "../progression/character-progress-repository.js";
import {
  attachQuestCharacter,
  advanceQuestPlayerPosition,
  grantedItemEvent,
  createZoneQuestManager,
  dispatchPlayerEnter,
  dispatchPlayerSay,
  npcDeathQuestEffects,
  refreshWorldContext,
} from "../zone/quest-runtime.js";
import { radiansToEqHeading } from "../zone/heading.js";
import type { QuestEffect } from "../zone/quest-types.js";
import {
  EmbeddedZoneRuntime,
  type EmbeddedDeathEvent,
  type EmbeddedZoneRuntimeOptions,
  type ZoneKernelFactory,
} from "../zone/embedded-zone-runtime.js";
import type {
  BackendEvent,
  BackendEventDelivery,
  BackendRequest,
  EmbeddedBackendContent,
  GameBackend,
} from "./contracts.js";
import { EmbeddedDatabaseHarness } from "./embedded-database-harness.js";
import { ZoneSnapshotRepository } from "../persist/zone-snapshot-repository.js";
import { ZoneWriteScheduler } from "../persist/zone-write-scheduler.js";
import {
  writeZoneCoalescedIntent,
  writeZoneDeferredIntent,
  type ZoneCoalesceKey,
  type ZoneDeferredWrite,
  type ZonePositionWrite,
} from "../persist/zone-write-intents.js";
import { WorldStateService } from "../zone/world-state-service.js";
import { DEFAULT_WORLD_FACTS } from "../zone/world-facts.js";
import {
  runSituationDirector,
  WorldSituationDirector,
  type DirectorLoop,
} from "../zone/world-situation-director.js";
import { WORLD_SITUATIONS } from "../zone/situations/index.js";
import { corpseName } from "../combat/corpse-loot.js";
import { EntityKind } from "../zone/entity-store.js";
import { abilityResultProjection } from "../combat/ability-result.js";
import { CharacterApplicationService } from "../zone/character-application-service.js";
import { ZoneJoinService } from "../zone/zone-join-service.js";
import { ZoneSessionService } from "../persist/zone-session-service.js";
import {
  GmCommandService,
  type GmCommandEffect,
} from "../zone/gm-command-service.js";
import {
  newZoneProjection,
  npcSpawnProjection,
  playerProfileProjection,
} from "../zone/zone-client-projections.js";
import { abilityLoadoutProjection } from "../progression/ability-loadout.js";
import {
  questNpcProjection,
  questPlayerProjection,
  zoneRuntimePlayerProjection,
} from "../zone/zone-runtime-projections.js";

interface EmbeddedSession {
  selectedCharacter: string | null;
  selectedCharacterId: number | null;
  pendingZone: { zoneId: number; instanceId: number } | null;
  activeZone: { zoneId: number; instanceId: number } | null;
  /**
   * Temporary demo hook — see `content/demo-start.ts`. Set at enter-world and cleared by
   * the first zone session, because the client asks for the zone it read off the
   * character-select roster, which is the position the hook has just overridden.
   */
  demoStartPending: boolean;
}

type CharacterRow = CharacterProfileProjection;

/**
 * Browser/worker harness around the shared application services and zone runtime.
 * It owns session routing and event adaptation, not gameplay or persistence rules.
 */
export class EmbeddedGameBackend implements GameBackend {
  private readonly sessions = new Map<number, EmbeddedSession>();
  private readonly zoneSessions = new Map<string, Set<number>>();
  private readonly questManagers = new Map<string, QuestManager>();
  private readonly zoneRuntimes = new Map<
    string,
    Promise<EmbeddedZoneRuntime>
  >();
  private readonly sessionRuntimes = new Map<number, EmbeddedZoneRuntime>();
  private readonly listeners = new Set<
    (delivery: BackendEventDelivery) => void
  >();
  private readonly databaseHarness: EmbeddedDatabaseHarness;
  private readonly gameDatabase: GameDatabase;
  private readonly contentPrefix: string;
  private readonly roster: CharacterRosterService;
  private readonly zoneSnapshotRepository: ZoneSnapshotRepository;
  private readonly progressRepository: CharacterProgressRepository;
  private readonly questEffects: QuestEffectApplier;
  private readonly writeScheduler: ZoneWriteScheduler<
    ZoneDeferredWrite,
    ZonePositionWrite,
    ZoneCoalesceKey
  >;
  private readonly characterApplication: CharacterApplicationService;
  private readonly zoneJoin: ZoneJoinService;
  private readonly gmCommands: GmCommandService;
  private readonly zoneSessionResolver: ZoneSessionService;
  private readonly worldState: WorldStateService;
  private readonly worldSeed: number;
  private situationLoop: DirectorLoop | null = null;
  private readonly backgroundWrites = new Set<Promise<void>>();
  /** Spawn identity per shard, so a kill can be attributed without a database read. */
  private readonly zoneNpcs = new Map<
    string,
    Map<number, { name: string; level: number; archetypeId: number }>
  >();
  private readonly createZoneKernel: ZoneKernelFactory | undefined;
  private readonly embeddedZoneOptions: Omit<
    EmbeddedZoneRuntimeOptions,
    "zoneId" | "instanceId" | "initialSnapshot" | "zoneKey" | "publishNpcDebug"
  >;
  private readonly devDiagnostics: boolean;

  constructor(
    driver: DatabaseBackend,
    private readonly content: EmbeddedBackendContent,
    options: {
      createZoneKernel?: ZoneKernelFactory;
      findPath?: EmbeddedZoneRuntimeOptions["findPath"];
      engagementRules?: EmbeddedZoneRuntimeOptions["engagementRules"];
      devDiagnostics?: boolean;
      /** Fixes what the offline world rolls for its own situations. */
      worldSeed?: number;
    } = {},
  ) {
    this.databaseHarness = new EmbeddedDatabaseHarness(driver, content);
    this.contentPrefix = this.databaseHarness.contentPrefix;
    this.gameDatabase = new GameDatabase(driver, driver, this.contentPrefix);
    this.roster = new CharacterRosterService(this.gameDatabase);
    this.zoneSnapshotRepository = this.gameDatabase.zoneSnapshots;
    this.progressRepository = this.gameDatabase.progress;
    this.writeScheduler = new ZoneWriteScheduler(
      driver,
      {
        writeDeferred: writeZoneDeferredIntent,
        writeCoalesced: writeZoneCoalescedIntent,
      },
      { coalescedFlushMs: false },
    );
    this.characterApplication = new CharacterApplicationService(
      this.gameDatabase,
      this.writeScheduler,
    );
    this.zoneJoin = new ZoneJoinService(this.gameDatabase, this.writeScheduler);
    this.gmCommands = new GmCommandService(
      this.gameDatabase,
      this.characterApplication,
      content.gearSets,
    );
    this.zoneSessionResolver = new ZoneSessionService(this.gameDatabase);
    this.questEffects = new QuestEffectApplier(this.progressRepository, {
      deferWrite: (characterId, intent) => {
        this.characterApplication.defer(characterId, intent);
      },
      grantItem: (characterId, itemId, quantity) =>
        this.characterApplication.grantQuestItem(characterId, itemId, quantity),
    });
    this.worldState = new WorldStateService(this.gameDatabase.worldState, {
      defaults: DEFAULT_WORLD_FACTS,
    });
    this.createZoneKernel = options.createZoneKernel;
    this.embeddedZoneOptions = {
      ...(options.findPath ? { findPath: options.findPath } : {}),
      ...(options.engagementRules
        ? { engagementRules: options.engagementRules }
        : {}),
    };
    this.devDiagnostics = options.devDiagnostics ?? false;
    this.worldSeed = options.worldSeed ?? 1;
  }

  async initialize(): Promise<void> {
    await this.databaseHarness.initialize();
    // Global world state lives in the runtime database, so it is available to an offline
    // player exactly as it is to a live shard — including a world that keeps moving.
    await this.worldState.start();
    const worldStateRepository = this.gameDatabase.worldState;
    const director = new WorldSituationDirector(this.worldState, WORLD_SITUATIONS, {
      seed: this.worldSeed,
    });
    await director.start(worldStateRepository);
    this.situationLoop = runSituationDirector(director);
    // Shards read the snapshot when they refresh their world context, so a situation
    // that starts between refreshes is picked up on the next one.
    this.worldState.subscribe(() => {
      for (const manager of this.questManagers.values()) {
        refreshWorldContext(manager, Date.now(), this.worldState.snapshot);
      }
    });
  }

  connect(sessionId: number): Promise<BackendEvent[]> {
    this.session(sessionId);
    return Promise.resolve([]);
  }

  async disconnect(sessionId: number): Promise<void> {
    const characterId = this.sessions.get(sessionId)?.selectedCharacterId;
    if (characterId) await this.characterApplication.flush(characterId);
    this.sessionRuntimes.get(sessionId)?.leavePlayer(sessionId);
    this.sessionRuntimes.delete(sessionId);
    this.sessions.delete(sessionId);
    for (const members of this.zoneSessions.values()) {
      members.delete(sessionId);
    }
  }

  async handle(
    sessionId: number,
    request: BackendRequest,
  ): Promise<BackendEvent[]> {
    switch (request.type) {
      case "login":
        return [
          event("jwt_response", { status: 1 }),
          await this.characterListEvent(),
        ];
      case "character_create":
        return this.createCharacter(request.character);
      case "character_delete":
        return this.deleteCharacter(request.name.trim());
      case "enter_world":
        return this.enterWorld(sessionId, request.name);
      case "zone_session":
        return this.validateZoneSession(
          sessionId,
          request.zoneId,
          request.instanceId,
        );
      case "zone_change":
        return this.changeZone(sessionId, request);
      case "gm_command":
        return this.gmCommand(sessionId, request.command, request.args);
      case "client_update": {
        this.sessionRuntimes
          .get(sessionId)
          ?.applyClientUpdate(sessionId, request);
        await this.persistClientLocation(sessionId, request);
        return this.trackQuestPosition(sessionId, request);
      }
      case "auto_attack":
        this.sessionRuntimes
          .get(sessionId)
          ?.setAutoAttack(sessionId, request.enabled, request.targetId);
        return [];
      case "activate_ability":
        return this.activateAbility(sessionId, request.abilityId, request.targetId);
      case "progression_request":
        return this.progressionRequest(sessionId, request.request);
      case "loot_request":
        return this.lootRequest(sessionId, request.corpseId);
      case "loot_item":
        return this.lootItem(sessionId, request.corpseId, request.lootSlot);
      case "merchant_open":
        return this.merchantRequest(sessionId, request);
      case "merchant_buy":
        return this.merchantRequest(sessionId, request);
      case "merchant_sell":
        return this.merchantRequest(sessionId, request);
      case "channel_message":
        return this.channelMessage(sessionId, request);
      case "move_item":
        return this.moveItem(sessionId, request);
      case "delete_item":
        return this.deleteItem(sessionId, request.slot, request.bag);
      case "journal_note":
        return this.journalNote(sessionId, request);
    }
  }

  /**
   * The player's own memory. The world decides what it tells you; you decide what is
   * worth keeping — no content author has to annotate every useful sentence perfectly.
   */
  private async journalNote(
    sessionId: number,
    request: Extract<BackendRequest, { type: "journal_note" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!session.selectedCharacterId) return [];
    const characterId = session.selectedCharacterId;
    const result = await this.characterApplication.updateJournal(characterId, request);
    return [event(
      "journal_update",
      {
        entries: result.entries,
        notes: result.notes,
        changed: null,
      },
      "control-stream",
    )];
  }

  async close(): Promise<void> {
    await this.situationLoop?.stop();
    this.situationLoop = null;
    await this.worldState.drain();
    this.sessionRuntimes.clear();
    const runtimes = [...this.zoneRuntimes.values()];
    this.zoneRuntimes.clear();
    this.listeners.clear();
    try {
      for (const runtime of await Promise.all(runtimes)) {
        runtime.stop();
        const snapshot = runtime.snapshotBlob();
        const identity = runtime.persistentIdentity();
        await this.zoneSnapshotRepository.save(
          identity.zoneId,
          identity.instanceId,
          snapshot,
        );
      }
      await Promise.allSettled(this.backgroundWrites);
      await this.writeScheduler.drain();
    } finally {
      await this.gameDatabase.runtime.close();
    }
  }

  subscribe(listener: (delivery: BackendEventDelivery) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async deleteCharacter(name: string): Promise<BackendEvent[]> {
    const result = await this.roster.deleteCharacter(
      await this.guestAccountId(),
      name,
    );
    return [event(
      "character_select",
      characterSelectProjection(result.characters),
      "control-stream",
    )];
  }

  private async createCharacter(
    character: Extract<
      BackendRequest,
      { type: "character_create" }
    >["character"],
  ): Promise<BackendEvent[]> {
    const accountId = await this.guestAccountId();
    const result = await this.roster.createCharacter(accountId, character)
      .catch(async () => ({
        ok: false,
        characters: (await this.roster.login("offline")).characters,
      }));
    return [
      event("approve_name", { value: result.ok ? 1 : 0 }),
      event(
        "character_select",
        characterSelectProjection(result.characters),
        "control-stream",
      ),
    ];
  }

  private async enterWorld(
    sessionId: number,
    rawName: string,
  ): Promise<BackendEvent[]> {
    const result = await this.roster.enterWorld(rawName);
    const character = result.character;
    if (character) {
      const session = this.session(sessionId);
      session.selectedCharacter = character.name;
      session.selectedCharacterId = Number(character.id);
      // The shared entry service applies the same one-time demo start in both modes.
      this.session(sessionId).demoStartPending = result.demoStartPending;
    }
    return [event("post_enter_world", { value: character ? 1 : 0 })];
  }

  private async validateZoneSession(
    sessionId: number,
    zone: number | string,
    instanceId: number,
  ): Promise<BackendEvent[]> {
    const session = this.session(sessionId);
    const resolution = await this.zoneSessionResolver.resolve(
      zone,
      instanceId,
      session.demoStartPending,
    );
    session.demoStartPending = false;
    if (resolution.zoneId !== null) {
      session.pendingZone = {
        zoneId: resolution.zoneId,
        instanceId: resolution.instanceId,
      };
    }
    return [event("zone_session_valid", { value: resolution.valid ? 1 : 0 })];
  }

  private async changeZone(
    sessionId: number,
    request: Extract<BackendRequest, { type: "zone_change" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    const { zoneId: requestedZone, instanceId } = request;
    if (requestedZone !== undefined) {
      const resolution = await this.zoneSessionResolver.resolve(
        requestedZone,
        instanceId,
        false,
      );
      if (resolution.zoneId === null) {
        return [serverMessage(`Unknown or unavailable zone: ${requestedZone}`)];
      }
      const zoneId = resolution.zoneId;
      session.activeZone = null;
      session.pendingZone = { zoneId, instanceId };
    }
    if (requestedZone === undefined && session.selectedCharacterId) {
      session.activeZone = null;
      await this.characterApplication.flush(session.selectedCharacterId);
    }
    if (!session.selectedCharacter || !session.pendingZone) {
      throw new Error("Unable to attach client session to zone instance");
    }
    session.activeZone = session.pendingZone;
    session.pendingZone = null;
    return this.zoneBootstrap(
      sessionId,
      session,
      requestedZone === undefined ? undefined : request,
    );
  }

  private async persistClientLocation(
    sessionId: number,
    location: Extract<BackendRequest, { type: "client_update" }>,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.selectedCharacterId || !session.activeZone) return;
    this.characterApplication.rememberPosition(session.selectedCharacterId, {
      zoneId: session.activeZone.zoneId,
      instanceId: session.activeZone.instanceId,
      x: location.x,
      y: location.y,
      z: location.z,
      heading: radiansToEqHeading(location.heading),
    });
  }

  private async gmCommand(
    sessionId: number,
    rawCommand: string,
    args: string[],
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!session.selectedCharacter || !session.selectedCharacterId) {
      return [
        serverMessage("A character must be active before using GM commands."),
      ];
    }
    return this.gmEvents(
      sessionId,
      await this.gmCommands.execute(
        session.selectedCharacterId,
        rawCommand,
        args,
      ),
    );
  }

  private gmEvents(
    sessionId: number,
    effects: readonly GmCommandEffect[],
  ): BackendEvent[] {
    return effects.flatMap((effect): BackendEvent[] => {
      switch (effect.type) {
        case "message":
          return [serverMessage(effect.message)];
        case "level":
          this.sessionRuntimes.get(sessionId)?.updatePlayerLevel(
            sessionId,
            effect.level,
            effect.combat,
          );
          {
            const route = this.sessions.get(sessionId)?.activeZone;
            if (route) {
              const manager = this.questManager(route.zoneId, route.instanceId);
              const experience = manager.character(sessionId)?.experience ?? 0;
              manager.setCharacterProgression(sessionId, experience, effect.level);
            }
          }
          return [event("level_update", {
            level: effect.level,
            exp: effect.experience,
          })];
        case "inventory_put":
          return [event("add_item", effect.item)];
        case "inventory_delete_many":
          return [event("bulk_delete_items", { items: effect.items })];
        case "inventory_replace":
          this.sessionRuntimes.get(sessionId)?.updatePlayerLevel(
            sessionId,
            effect.level,
            effect.combat,
          );
          return [
            ...(effect.removed.length
              ? [event("bulk_delete_items", { items: effect.removed })]
              : []),
            event("bulk_items", { items: effect.items }),
          ];
      }
    });
  }

  private async channelMessage(
    sessionId: number,
    request: Extract<BackendRequest, { type: "channel_message" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!session.activeZone || !session.selectedCharacter) {
      return [];
    }
    const manager = this.questManager(
      session.activeZone.zoneId,
      session.activeZone.instanceId,
    );
    const effects = dispatchPlayerSay(manager, {
      tick: this.questTick,
      sessionId,
      actorName: session.selectedCharacter,
      message: request.message,
      npcName: request.targetName,
      channel: request.channel,
    });
    return this.commitQuestEffects(
      manager,
      effects,
      sessionId,
      session.selectedCharacter,
    );
  }

  private questManager(zoneId: number, instanceId: number): QuestManager {
    const key = `${zoneId}:${instanceId}`;
    const current = this.questManagers.get(key);
    if (current) {
      refreshWorldContext(current, Date.now(), this.worldState.snapshot);
      return current;
    }
    const created = createZoneQuestManager({
      zoneId,
      instanceId,
      tickRateHz: 10,
      extraDefinitions: this.content.quests ?? [],
      world: this.worldState.snapshot,
    });
    this.questManagers.set(key, created);
    return created;
  }

  private questEvents(
    effects: readonly QuestEffect[],
    actorName: string,
  ): BackendEvent[] {
    return effects.flatMap((effect): BackendEvent[] => {
      if (effect.type !== "npc_say" && effect.type !== "entity_say") {
        return [];
      }
      return [
        event(
          "channel_message",
          {
            sender:
              effect.type === "npc_say" ? effect.npcName : effect.entityName,
            target: actorName,
            message: effect.message,
            chanNum: 0,
          },
          "control-stream",
        ),
      ];
    });
  }

  /**
   * Commits the persistent half of a dispatch and returns the packets owed to
   * `sessionId`; anything addressed to another character is published directly.
   */
  private async commitQuestEffects(
    manager: QuestManager,
    effects: readonly QuestEffect[],
    sessionId: number,
    actorName: string,
  ): Promise<BackendEvent[]> {
    const events = this.questEvents(effects, actorName);
    const deliveries = await this.questEffects.apply(manager, effects);
    for (const delivery of deliveries) {
      const outbound = await this.questDelivery(delivery);
      if (!outbound) continue;
      if (delivery.sessionId === sessionId) {
        events.push(outbound);
        continue;
      }
      this.publish([delivery.sessionId], outbound);
    }
    return events;
  }

  /** One place that turns a quest delivery into a packet for this transport. */
  private async questDelivery(
    delivery: { type: string; value: Record<string, unknown> },
  ): Promise<BackendEvent | null> {
    if (delivery.type !== "grant_item") {
      return event(delivery.type as BackendEvent["type"], delivery.value, "control-stream");
    }
    const instance = await grantedItemEvent(
      this.progressRepository,
      delivery.value as unknown as { slot: number; bag: number; itemId: number },
      Number(delivery.value.quantity ?? 1),
    );
    return instance ? event("add_item", instance) : null;
  }

  private publish(sessionIds: readonly number[], outbound: BackendEvent): void {
    const delivery: BackendEventDelivery = { sessionIds, event: outbound };
    for (const listener of this.listeners) listener(delivery);
  }

  /**
   * Drives the authored region/proximity trackers and named timers from the position
   * stream, so exploration content fires without any handler polling coordinates.
   */
  private async trackQuestPosition(
    sessionId: number,
    position: { x: number; y: number; z: number },
  ): Promise<BackendEvent[]> {
    const session = this.sessions.get(sessionId);
    if (!session?.activeZone || !session.selectedCharacter) return [];
    const manager = this.questManager(
      session.activeZone.zoneId,
      session.activeZone.instanceId,
    );
    this.questTick += 1;
    const effects = advanceQuestPlayerPosition(
      manager,
      sessionId,
      position,
      this.questTick,
    );
    if (effects.length === 0) return [];
    return this.commitQuestEffects(
      manager,
      effects,
      sessionId,
      session.selectedCharacter,
    );
  }

  private questTick = 0;

  private async moveItem(
    sessionId: number,
    request: Extract<BackendRequest, { type: "move_item" }>,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!session.selectedCharacter) return [];
    if (!session.selectedCharacterId) return [];
    try {
      const moves = await this.characterApplication.moveItem(
        session.selectedCharacterId,
        {
          fromSlot: request.fromSlot,
          toSlot: request.toSlot,
          fromBag: request.fromBag,
          toBag: request.toBag,
        },
      );
      return moves.map((move) =>
        event(
          "move_item",
          {
            ...move,
            fromBagSlot: move.fromBag,
            toBagSlot: move.toBag,
            numberInStack: 1,
          },
          "control-stream",
        )
      );
    } catch (error) {
      return [
        serverMessage(error instanceof Error ? error.message : String(error)),
      ];
    }
  }

  private async deleteItem(
    sessionId: number,
    slot: number,
    bag: number,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!session.selectedCharacter || !session.selectedCharacterId) {
      return [];
    }
    const deleted = await this.characterApplication.deleteItem(
      session.selectedCharacterId,
      slot,
      bag,
    );
    return deleted ? [event("delete_item", { slot, bag })] : [];
  }

  private lootRequest(sessionId: number, corpseId: number): BackendEvent[] {
    const window = this.sessionRuntimes
      .get(sessionId)
      ?.lootWindow(sessionId, corpseId);
    if (!window) {
      return [
        event(
          "loot_error",
          {
            corpseId,
            message: "That corpse cannot be looted from here.",
          },
          "control-stream",
        ),
      ];
    }
    return [
      event(
        "loot_window",
        {
          corpseId,
          corpseName: window.corpseName,
          items: window.items,
        },
        "control-stream",
      ),
    ];
  }

  private async lootItem(
    sessionId: number,
    corpseId: number,
    lootSlot: number,
  ): Promise<BackendEvent[]> {
    const runtime = this.sessionRuntimes.get(sessionId);
    const item = runtime?.takeLoot(sessionId, corpseId, lootSlot);
    const session = await this.ensureSelectedCharacter(sessionId);
    if (!runtime || !item || !session.selectedCharacter || !session.selectedCharacterId) {
      return [
        event(
          "loot_error",
          {
            corpseId,
            message: "That item is no longer available.",
          },
          "control-stream",
        ),
      ];
    }
    const characterId = session.selectedCharacterId;
    const destination = await this.characterApplication.grantLoot(
      characterId,
      Number(item.itemId ?? item.id),
      Math.max(1, Number(item.quantity ?? 1)),
      Number(item.charges ?? 0),
    ).catch((error: unknown) => {
      runtime.restoreLoot(corpseId, item);
      throw error;
    });
    if (destination === null) {
      runtime.restoreLoot(corpseId, item);
      return [
        event(
          "loot_error",
          {
            corpseId,
            message: "Your inventory is full.",
          },
          "control-stream",
        ),
      ];
    }
    return [
      event(
        "add_item",
        {
          ...item,
          slot: destination.slot,
          bagSlot: -1,
        },
        "control-stream",
      ),
      ...this.lootRequest(sessionId, corpseId),
    ];
  }

  private async merchantRequest(
    sessionId: number,
    request: Extract<
      BackendRequest,
      { type: "merchant_open" | "merchant_buy" | "merchant_sell" }
    >,
  ): Promise<BackendEvent[]> {
    const session = await this.ensureSelectedCharacter(sessionId);
    const route = session.activeZone;
    const runtime = this.sessionRuntimes.get(sessionId);
    const interaction = runtime?.merchant(sessionId, request.npcId);
    if (!route || !interaction || !session.selectedCharacterId) {
      return [
        event(
          "merchant_error",
          {
            npcId: request.npcId,
            message: "That NPC is not available as a merchant.",
          },
          "control-stream",
        ),
      ];
    }
    if (!interaction.ok) {
      return [event(
        "merchant_error",
        { npcId: request.npcId, message: interaction.message },
        "control-stream",
      )];
    }
    const definition = interaction.definition;
    const common = {
      characterId: session.selectedCharacterId,
      npcArchetypeId: definition.npcArchetypeId,
      npcId: request.npcId,
      merchantName: definition.name,
      zoneId: route.zoneId,
      instanceId: route.instanceId,
    };
    const result = request.type === "merchant_buy"
      ? await this.characterApplication.merchant({
          ...common,
          action: "buy",
          merchantSlot: request.merchantSlot,
          quantity: request.quantity,
        })
      : request.type === "merchant_sell"
      ? await this.characterApplication.merchant({
          ...common,
          action: "sell",
          slot: request.slot,
          bag: request.bag,
          quantity: request.quantity,
        })
      : await this.characterApplication.merchant({ ...common, action: "open" });
    if (!result.ok) {
      return [event(
        "merchant_error",
        { npcId: request.npcId, message: result.message },
        "control-stream",
      )];
    }
    return [
      ...(result.mutation ? [mutationEvent(result.mutation)] : []),
      event("merchant_window", { ...result.window }, "control-stream"),
    ];
  }

  private async zoneBootstrap(
    sessionId: number,
    session: EmbeddedSession,
    transition?: Extract<BackendRequest, { type: "zone_change" }>,
  ): Promise<BackendEvent[]> {
    const route = session.activeZone;
    if (!route || !session.selectedCharacter) {
      throw new Error("No active zone route");
    }
    const join = await this.zoneJoin.load(
      session.selectedCharacter,
      route.zoneId,
      route.instanceId,
      transition,
    );
    const { zone, character } = join;
    const runtimePlayer = zoneRuntimePlayerProjection(
      join,
      sessionId,
      embeddedPlayerEntityId(Number(character.id)),
    );
    for (const members of this.zoneSessions.values()) {
      members.delete(sessionId);
    }
    const key = `${route.zoneId}:${route.instanceId}`;
    const members = this.zoneSessions.get(key) ?? new Set<number>();
    members.add(sessionId);
    this.zoneSessions.set(key, members);
    const definitions = join.npcs;
    const spawns = definitions.map(npcSpawnProjection);
    if (this.createZoneKernel) {
      const runtime = await this.zoneRuntime(
        key,
        route.zoneId,
        route.instanceId,
        zone.key,
        definitions,
        this.createZoneKernel,
      );
      const previousRuntime = this.sessionRuntimes.get(sessionId);
      if (previousRuntime && previousRuntime !== runtime) {
        previousRuntime.leavePlayer(sessionId);
      }
      for (const spawn of spawns) {
        const state = runtime.npcState(spawn.spawnId);
        if (!state) continue;
        spawn.kind = state.kind;
        spawn.x = state.x;
        spawn.y = state.y;
        spawn.z = state.z;
        spawn.heading = radiansToEqHeading(state.heading);
        spawn.currentHp = state.currentHp;
        spawn.maximumHp = state.maximumHp;
        if (state.kind === EntityKind.corpse)
          spawn.name = corpseName(spawn.name);
      }
      runtime.joinPlayer(runtimePlayer);
      this.sessionRuntimes.set(sessionId, runtime);
    }
    this.zoneNpcs.set(
      key,
      new Map(spawns.map((spawn) => [spawn.spawnId, {
        name: spawn.name,
        level: spawn.level,
        archetypeId: spawn.id,
      }])),
    );
    const manager = this.questManager(route.zoneId, route.instanceId);
    manager.hydrate({
      players: [questPlayerProjection(runtimePlayer)],
      npcs: spawns.map(questNpcProjection),
    });
    // Load persisted quest state, knowledge and inventory before any handler runs,
    // then let the world react to the arrival.
    await attachQuestCharacter(
      manager,
      this.progressRepository,
      sessionId,
      Number(character.id),
    );
    const questEvents = await this.commitQuestEffects(
      manager,
      dispatchPlayerEnter(
        manager,
        this.questTick,
        questPlayerProjection(runtimePlayer),
      ),
      sessionId,
      character.name,
    );
    for (const delivery of await this.questEffects.snapshot(
      manager,
      sessionId,
      Number(character.id),
    )) {
      const outbound = await this.questDelivery(delivery);
      if (outbound) questEvents.push(outbound);
    }
    return [
      event(
        "new_zone",
        newZoneProjection(join, route.zoneId, route.instanceId),
        "control-stream",
      ),
      event(
        "player_profile",
        playerProfileProjection(join, route.zoneId, route.instanceId),
        "control-stream",
      ),
      event("zone_spawns", { spawns }, "control-stream"),
      event(
        "ability_loadout",
        { ...abilityLoadoutProjection(join.techniques) },
        "control-stream",
      ),
      await this.progressionStateEvent(character),
      ...questEvents,
    ];
  }

  /**
   * Learning, preparing and Aspect spending, offline.
   *
   * The decision lives in `progression-requests.ts`; this only resolves who is asking
   * and answers with the whole state afterwards, so the panels never have to guess what
   * a refusal left behind.
   */
  private async progressionRequest(
    sessionId: number,
    request: Extract<BackendRequest, { type: "progression_request" }>["request"],
  ): Promise<BackendEvent[]> {
    const characterId = this.session(sessionId).selectedCharacterId;
    if (!characterId) return [];
    const outcome = await this.characterApplication.progression(
      characterId,
      request,
    );
    if (!outcome) return [];
    this.sessionRuntimes.get(sessionId)?.updatePlayerLoadout(
      sessionId,
      outcome.combatLoadout,
    );
    return [
      event("progression_state", {
        ...outcome.state,
        refusal: outcome.refusal,
      }),
      event("ability_loadout", { ...outcome.abilityLoadout }, "control-stream"),
    ];
  }

  /** The whole progression picture, pushed at zone entry and after every change. */
  private async progressionStateEvent(character: CharacterRow): Promise<BackendEvent> {
    const state = await this.characterApplication.progressionState(
      Number(character.id),
    );
    if (!state) throw new Error(`Character ${character.id} does not exist`);
    return event("progression_state", { ...state, refusal: null }, "control-stream");
  }

  private async characterListEvent(): Promise<BackendEvent> {
    const rows = (await this.roster.login("offline")).characters;
    return event(
      "character_select",
      characterSelectProjection(rows),
      "control-stream",
    );
  }

  private async ensureSelectedCharacter(
    sessionId: number,
  ): Promise<EmbeddedSession> {
    const session = this.session(sessionId);
    if (session.selectedCharacter) {
      return session;
    }
    const row = await this.roster.mostRecentCharacter();
    if (row) {
      session.selectedCharacter = row.name;
      session.selectedCharacterId = Number(row.id);
    }
    return session;
  }

  private session(sessionId: number): EmbeddedSession {
    const current = this.sessions.get(sessionId);
    if (current) {
      return current;
    }
    const created: EmbeddedSession = {
      selectedCharacter: null,
      selectedCharacterId: null,
      pendingZone: null,
      activeZone: null,
      demoStartPending: false,
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private zoneRuntime(
    key: string,
    zoneId: number,
    instanceId: number,
    zoneKey: string,
    definitions: Parameters<typeof EmbeddedZoneRuntime.create>[0],
    createZoneKernel: ZoneKernelFactory,
  ): Promise<EmbeddedZoneRuntime> {
    const existing = this.zoneRuntimes.get(key);
    if (existing) return existing;
    const created = this.zoneSnapshotRepository
      .latest(zoneId, instanceId)
      .catch(() => null)
      .then((stored) =>
        EmbeddedZoneRuntime.create(
          definitions,
          createZoneKernel,
          (sessionIds, payload) => {
            const delivery: BackendEventDelivery = {
              sessionIds,
              event: event("render_snapshot", { payload }, "control-stream"),
            };
            for (const listener of this.listeners) listener(delivery);
          },
          (sessionIds, combat) => {
            const delivery: BackendEventDelivery = {
              sessionIds,
              event: event("combat_event", { ...combat }, "control-stream"),
            };
            for (const listener of this.listeners) listener(delivery);
            if (combat.killed) {
              this.trackBackgroundWrite(
                this.handleNpcDeath(key, zoneId, instanceId, sessionIds, combat.targetId),
              );
            }
          },
          (sessionId, death) => {
            const delivery: BackendEventDelivery = {
              sessionIds: [sessionId],
              event: event("death_event", { ...death }, "control-stream"),
            };
            for (const listener of this.listeners) listener(delivery);
            this.trackBackgroundWrite(this.handleEmbeddedDeath(sessionId, death));
          },
          10,
          {
            ...this.embeddedZoneOptions,
            zoneId,
            instanceId,
            zoneKey,
            ...(stored ? { initialSnapshot: stored.snapshot } : {}),
            ...(this.devDiagnostics
              ? {
                  publishNpcDebug: (sessionIds, diagnostic) => {
                    const delivery: BackendEventDelivery = {
                      sessionIds,
                      event: event(
                        "npc_debug_state",
                        { ...diagnostic },
                        "datagram",
                      ),
                    };
                    for (const listener of this.listeners) listener(delivery);
                  },
                }
              : {}),
          },
        ),
      );
    this.zoneRuntimes.set(key, created);
    void created.catch(() => {
      if (this.zoneRuntimes.get(key) === created) {
        this.zoneRuntimes.delete(key);
      }
    });
    return created;
  }

  private trackBackgroundWrite(write: Promise<void>): void {
    this.backgroundWrites.add(write);
    void write.finally(() => this.backgroundWrites.delete(write)).catch(() => {});
  }

  /**
   * A kill is a world event first and an experience source second. Credit comes from
   * the combat system's participant set, never from the killing blow.
   */
  private async handleNpcDeath(
    zoneKey: string,
    zoneId: number,
    instanceId: number,
    creditSessionIds: readonly number[],
    targetId: number,
  ): Promise<void> {
    const npc = this.zoneNpcs.get(zoneKey)?.get(targetId);
    if (!npc) return;
    const manager = this.questManager(zoneId, instanceId);
    this.questTick += 1;
    const { credited, effects } = npcDeathQuestEffects(manager, {
      tick: this.questTick,
      npc: { id: targetId, name: npc.name, level: npc.level },
      creditSessionIds,
    });
    for (const delivery of await this.questEffects.apply(manager, effects)) {
      const outbound = await this.questDelivery(delivery);
      if (outbound) this.publish([delivery.sessionId], outbound);
    }
    for (const outbound of this.questEvents(effects, "")) {
      this.publish([...credited], outbound);
    }
  }

  private async handleEmbeddedDeath(
    sessionId: number,
    death: EmbeddedDeathEvent,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.selectedCharacter || !session.selectedCharacterId) return;
    // Stop admitting old-zone movement before the bind checkpoint is captured.
    session.activeZone = null;
    await this.characterApplication.checkpointPosition(
      session.selectedCharacterId,
      {
      zoneId: death.bindZoneId,
      instanceId: 0,
      x: death.x,
      y: death.y,
      z: death.z,
      heading: death.heading,
      },
    );
    session.pendingZone = { zoneId: death.bindZoneId, instanceId: 0 };
    session.activeZone = { zoneId: death.bindZoneId, instanceId: 0 };
    const events = await this.zoneBootstrap(sessionId, session);
    for (const outbound of events) {
      const delivery: BackendEventDelivery = {
        sessionIds: [sessionId],
        event: outbound,
      };
      for (const listener of this.listeners) listener(delivery);
    }
  }

  private async guestAccountId(): Promise<number> {
    return this.roster.accountId("offline");
  }

  /**
   * Fires a prepared technique and reports what happened.
   *
   * The refusal is returned rather than swallowed: `combat-runtime.ts` distinguishes
   * twelve reasons on purpose, so the client can say "still recovering" instead of
   * dropping the input and leaving the player wondering whether the key registered.
   */
  private async activateAbility(
    sessionId: number,
    abilityId: string,
    targetId: number,
  ): Promise<BackendEvent[]> {
    const runtime = this.sessionRuntimes.get(sessionId);
    if (!runtime) return [];
    const result = runtime.activateAbility(sessionId, abilityId, targetId);

    // A killing blow needs no handling here. Ability damage is applied through
    // `MeleeCombatSystem.applyAbilityDamage`, which emits the same `CombatEvent` a swing
    // does, and the publish path already turns `killed` into death, credit, experience
    // and loot. Awarding again here would pay twice for one corpse.
    return [event("ability_result", abilityResultProjection(
      abilityId,
      targetId,
      result,
    ))];
  }
}

function event(
  type: BackendEvent["type"],
  value: Record<string, unknown>,
  transport: BackendEvent["transport"] = "datagram",
): BackendEvent {
  return { type, value, transport };
}

function mutationEvent(mutation: {
  kind: "put" | "delete";
  slot: number;
  bag: number;
  item?: Record<string, unknown>;
}): BackendEvent {
  return mutation.kind === "delete"
    ? event(
        "delete_item",
        { slot: mutation.slot, bag: mutation.bag },
        "control-stream",
      )
    : event("add_item", mutation.item ?? {}, "control-stream");
}

function embeddedPlayerEntityId(characterId: number): number {
  return (0x8000_0000 + (characterId >>> 0)) >>> 0;
}

function serverMessage(message: string): BackendEvent {
  return event("channel_message", {
    sender: "Server",
    target: "",
    message,
    chanNum: -1,
  });
}
