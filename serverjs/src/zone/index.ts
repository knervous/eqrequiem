import type { AppEnv } from "../config/env.js";
import type { DbService } from "../db/index.js";
import {
  decodeClientPositionRequest,
  decodeDeleteItemRequest,
  decodeMoveItemRequest,
  decodeZoneRouteRequest,
  encodeDeleteSpawn,
  encodeChannelMessage,
  encodeMoveItemResponse,
  encodeNewZone,
  encodePlayerProfile,
} from "../protocol/game-codec.js";
import {
  encodeWorldSpawnBatch,
  type WorldSpawnInput,
} from "../protocol/world-state.js";
import type { InboundPacket } from "../protocol/index.js";
import { OP } from "../protocol/opcodes.js";
import { decodeRequest } from "../backend/packet-adapter.js";
import { encodeSidecar, SIDECAR_SCHEMA } from "../protocol/sidecar-codec.js";
import { GameDatabase } from "../persist/game-database.js";
import { ZoneSnapshotRepository } from "../persist/zone-snapshot-repository.js";
import { ZoneWriteScheduler } from "../persist/zone-write-scheduler.js";
import {
  writeZoneCoalescedIntent,
  writeZoneDeferredIntent,
  type ZoneCoalesceKey,
  type ZoneDeferredWrite,
  type ZonePositionWrite,
} from "../persist/zone-write-intents.js";
import { WorldStateService } from "./world-state-service.js";
import { DEFAULT_WORLD_FACTS } from "./world-facts.js";
import {
  runSituationDirector,
  WorldSituationDirector,
  type DirectorLoop,
} from "./world-situation-director.js";
import { WORLD_SITUATIONS } from "./situations/index.js";
import type { Logger } from "../shared/logger.js";
import type { GameMessenger } from "../transport/game-transport.js";
import type { NavService } from "../nav/index.js";
import { ZoneDispatcher } from "./dispatcher.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import { QuestCatalog } from "./quest-catalog.js";
import { radiansToEqHeading } from "./heading.js";
import { ZoneWorkerPool } from "./worker-pool.js";
import type { ZoneShardStatus } from "./worker-pool.js";
import type {
  ZoneLootAwardMessage,
  ZoneMerchantIntentMessage,
  ZonePcDeathMessage,
  ZoneQuestEffectsMessage,
} from "./worker-types.js";
import {
  CharacterProgressRepository,
  type CharacterJournalNote,
} from "../progression/character-progress-repository.js";
import {
  QuestEffectApplier,
  type QuestClientDelivery,
  type QuestEffectSource,
} from "./quest-effect-applier.js";
import type { QuestPersistenceBatch } from "./quest-manager.js";
import { journalFromState, type QuestJournalEntry } from "./quest-state.js";
import { grantedItemEvent } from "./quest-runtime.js";
import { corpseName } from "../combat/corpse-loot.js";
import type {
  ZoneSnapshot,
  ZoneSnapshotEntity,
} from "./zone-snapshot.js";
import { encodeZoneSnapshot } from "./zone-snapshot.js";
import { CharacterApplicationService } from "./character-application-service.js";
import { ZoneJoinService } from "./zone-join-service.js";
import {
  GmCommandService,
  type GmCommandEffect,
} from "./gm-command-service.js";
import { GENERATED_GEAR_SETS } from "../content/gear-sets.js";
import {
  newZoneProjection,
  npcSpawnProjection,
  playerProfileProjection,
  playerSpawnProjection,
} from "./zone-client-projections.js";
import { abilityLoadoutProjection } from "../progression/ability-loadout.js";
import {
  questNpcProjection,
  zoneRuntimePlayerProjection,
} from "./zone-runtime-projections.js";

export {
  Entity,
  EntityKind,
  EntityStore,
  EntityVectorView,
  NPC,
  PC,
} from "./entity-store.js";
export type { EntitySpawn, NpcSpawn } from "./entity-store.js";

export class ZoneService {
  private readonly dispatcher: ZoneDispatcher;
  private readonly workerPool: ZoneWorkerPool;
  private readonly questCatalog: QuestCatalog;
  private messenger: GameMessenger | null = null;
  private readonly sessionRoutes = new Map<
    number,
    { zoneId: number; instanceId: number }
  >();
  private readonly shardSpawns = new Map<
    string,
    Map<number, ZoneNpcSpawnDefinition>
  >();
  private readonly shardPlayers = new Map<
    string,
    Map<number, PlayerWorldSpawn>
  >();
  private readonly shardSnapshots = new Map<string, ZoneSnapshot | null>();
  private readonly sessionEntities = new Map<
    number,
    {
      shard: string;
      entityId: number;
      characterId: number;
      characterName: string;
    }
  >();
  private readonly nextEntityIdByShard = new Map<string, number>();
  private readonly reliableSends = new Map<number, Promise<void>>();
  private zoneSnapshotRepository: ZoneSnapshotRepository | null = null;
  private progressRepository: CharacterProgressRepository | null = null;
  private gameDatabase: GameDatabase | null = null;
  private worldState: WorldStateService | null = null;
  private unsubscribeWorldState: (() => void) | null = null;
  private situationLoop: DirectorLoop | null = null;
  private questEffects: QuestEffectApplier | null = null;
  private readonly questWrites = new Map<string, Promise<void>>();
  private writeScheduler: ZoneWriteScheduler<
    ZoneDeferredWrite,
    ZonePositionWrite,
    ZoneCoalesceKey
  > | null = null;
  private characterApplication: CharacterApplicationService | null = null;
  private zoneJoin: ZoneJoinService | null = null;
  private gmCommands: GmCommandService | null = null;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
    private readonly databases: DbService,
    private readonly navigation: NavService,
  ) {
    this.dispatcher = new ZoneDispatcher(logger);
    this.workerPool = new ZoneWorkerPool(
      env.zone.tickRateHz,
      env.zone.workBudgetMs,
      {
        damageHateMultiplier: env.zone.npcEngagement.damageHateMultiplier,
        minimumDamageHate: env.zone.npcEngagement.minimumDamageHate,
        repathIntervalTicks: Math.max(
          1,
          Math.ceil(
            env.zone.npcEngagement.repathIntervalMs
              * env.zone.tickRateHz
              / 1_000,
          ),
        ),
        targetMovementRepathDistance:
          env.zone.npcEngagement.targetMovementRepathDistance,
        waypointArrivalDistance:
          env.zone.npcEngagement.waypointArrivalDistance,
        directMovementWhilePathPending:
          env.zone.npcEngagement.directMovementWhilePathPending,
      },
      env.nodeEnv === "development",
      logger,
      (_zoneId, _instanceId, sessionIds, payload) => {
        for (const sessionId of sessionIds) {
          void this.sendReliable(sessionId, OP.RENDER_SNAPSHOT, payload).catch(
            (error: unknown) => {
              this.logger.warn("Render snapshot send failed", {
                sessionId,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          );
        }
      },
      (sessionIds, sender, target, message) => {
        const payload = encodeChannelMessage({
          sender,
          target,
          message,
          chanNum: 0,
        });
        for (const sessionId of sessionIds) {
          void this.sendReliable(sessionId, OP.CHANNEL_MESSAGE, payload).catch(
            (error: unknown) => {
              this.logger.warn("Quest speech send failed", {
                sessionId,
                sender,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          );
        }
      },
      (zoneId, instanceId, sessionId, enteredSpawnIds, exitedSpawnIds) => {
        void this.sendAoiChanges(
          zoneId,
          instanceId,
          sessionId,
          enteredSpawnIds,
          exitedSpawnIds,
        ).catch((error: unknown) => {
          this.logger.warn("AOI replication send failed", {
            zoneId,
            instanceId,
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      (sessionIds, event) => {
        const payload = encodeSidecar(SIDECAR_SCHEMA.COMBAT_EVENT, event);
        for (const sessionId of sessionIds) {
          void this.sendReliable(sessionId, OP.COMBAT_EVENT, payload).catch(
            (error: unknown) => {
              this.logger.warn("Combat event send failed", {
                sessionId,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          );
        }
      },
      (message) => {
        void this.handlePcDeath(message).catch((error: unknown) => {
          this.logger.error("PC death handling failed", {
            sessionId: message.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      (message) => {
        void this.sendReliable(
          message.sessionId,
          OP.LOOT_WINDOW,
          encodeSidecar(SIDECAR_SCHEMA.LOOT_WINDOW, {
            corpseId: message.corpseId,
            corpseName: message.corpseName,
            items: message.items,
          }),
        );
      },
      (message) => {
        this.queueLootAward(message);
      },
      (message) => {
        this.queueMerchantIntent(message);
      },
      (message) => {
        void this.sendMerchantError(
          message.sessionId,
          message.npcId,
          message.message,
        );
      },
      (message) => {
        void this.navigation.findPath({
          zoneKey: message.zoneKey,
          zoneId: message.zoneId,
          instanceId: message.instanceId,
          start: message.request.start,
          end: message.request.end,
        }).then(
          (result) => {
            this.workerPool.enqueue(message.zoneId, message.instanceId, {
              type: "nav_path_result",
              requestId: message.request.requestId,
              npcId: message.request.npcId,
              targetId: message.request.targetId,
              path: [...result.path],
            });
          },
          (error: unknown) => {
            this.workerPool.enqueue(message.zoneId, message.instanceId, {
              type: "nav_path_result",
              requestId: message.request.requestId,
              npcId: message.request.npcId,
              targetId: message.request.targetId,
              path: [],
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
      },
      (message) => {
        const payload = encodeSidecar(
          SIDECAR_SCHEMA.NPC_DEBUG_STATE,
          message.diagnostic,
        );
        for (const sessionId of message.sessionIds) {
          void this.messenger
            ?.sendDatagram(sessionId, OP.NPC_DEBUG_STATE, payload)
            .catch((error: unknown) => {
              this.logger.debug("NPC diagnostic send failed", {
                sessionId,
                npcId: message.diagnostic.npcId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
        }
      },
      (message) => {
        void this.commitQuestEffects(message).catch((error: unknown) => {
          this.logger.error("Quest effect commit failed", {
            zoneId: message.zoneId,
            instanceId: message.instanceId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      async (zoneId, instanceId, blobData, formatVersion) => {
        const repository = this.zoneSnapshotRepository;
        if (!repository) throw new Error("Zone snapshot repository is not started");
        await repository.save(zoneId, instanceId, blobData, formatVersion);
      },
      (message) => {
        void this.messenger
          ?.sendStream(
            message.sessionId,
            OP.ABILITY_RESULT,
            encodeSidecar(SIDECAR_SCHEMA.ABILITY_RESULT, message.payload),
          )
          .catch((error: unknown) => {
            this.logger.debug("Ability result send failed", {
              sessionId: message.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      },
    );
    this.questCatalog = new QuestCatalog(
      env.zone.questDir,
      env.nodeEnv === "development",
      logger,
      (definitions, revision) =>
        this.workerPool.updateQuests(definitions, revision),
    );
  }

  setMessenger(messenger: GameMessenger): void {
    this.messenger = messenger;
  }

  handleInbound(
    packet: InboundPacket,
    zoneId: number,
    instanceId: number,
    characterName?: string | null,
  ): void {
    const accepted = this.dispatcher.handleInbound(packet, zoneId, instanceId);
    if (!accepted) {
      return;
    }

    if (packet.opcode === OP.REQUEST_CLIENT_ZONE_CHANGE) {
      const transition = decodeZoneRouteRequest(packet.payload);
      void this.attachSession(
        packet.sessionId,
        zoneId,
        instanceId,
        characterName ?? "Player",
        transition,
      ).catch((error: unknown) =>
        this.logger.warn("Zone session attach failed", {
          sessionId: packet.sessionId,
          zoneId,
          instanceId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    if (packet.opcode === OP.CLIENT_UPDATE) {
      const location = decodeClientPositionRequest(packet.payload);
      if (location) this.queueLocationWrite(packet.sessionId, location);
    }

    if (packet.opcode === OP.MOVE_ITEM) {
      const move = decodeMoveItemRequest(packet.payload);
      if (move) {
        void this.handleInventoryMove(packet.sessionId, move)
          .catch((error: unknown) => {
            this.logger.warn("Inventory move failed", {
              sessionId: packet.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    }

    if (packet.opcode === OP.DELETE_ITEM) {
      const del = decodeDeleteItemRequest(packet.payload);
      if (del) {
        void this.handleInventoryDelete(packet.sessionId, del)
          .catch((error: unknown) => {
            this.logger.warn("Inventory delete failed", {
              sessionId: packet.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    }

    if (packet.opcode === OP.PROGRESSION_REQUEST) {
      // Learning and Aspect spending are pure persistence, like a journal note: the
      // simulation is told the result through the loadout it already reads at join.
      void this.handleProgressionRequest(packet.sessionId, packet.payload).catch(
        (error: unknown) => {
          this.logger.warn("Progression request failed", {
            sessionId: packet.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
      return;
    }

    if (packet.opcode === OP.JOURNAL_NOTE) {
      // The player's own memory never reaches the simulation; it is pure persistence.
      void this.handleJournalNote(packet.sessionId, packet.payload).catch(
        (error: unknown) => {
          this.logger.warn("Journal note failed", {
            sessionId: packet.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
      return;
    }

    if (packet.opcode === OP.GM_COMMAND) {
      void this.handleGmCommand(packet.sessionId, packet.payload).catch(
        (error: unknown) => {
          this.logger.warn("GM command failed", {
            sessionId: packet.sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
      return;
    }

    this.workerPool.enqueue(zoneId, instanceId, {
      type: "packet",
      sessionId: packet.sessionId,
      opcode: packet.opcode,
      payload: packet.payload,
      transport: packet.transport,
    });
  }

  onSessionDisconnected(sessionId: number): void {
    const route = this.sessionRoutes.get(sessionId);
    if (!route) return;
    const owned = this.sessionEntities.get(sessionId);
    if (owned) {
      void this.flushCharacterWrites(owned.characterId, "disconnect");
    }
    this.workerPool.enqueue(route.zoneId, route.instanceId, {
      type: "client_leave",
      sessionId,
    });
    this.removeSessionEntityDefinition(sessionId);
    this.sessionRoutes.delete(sessionId);
    this.reliableSends.delete(sessionId);
  }

  async start(): Promise<void> {
    this.gameDatabase = new GameDatabase(
      this.databases.backend("runtime"),
      this.databases.backend("content"),
    );
    this.writeScheduler = new ZoneWriteScheduler(
      this.databases.backend("runtime"),
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
      GENERATED_GEAR_SETS,
    );
    this.zoneSnapshotRepository = this.gameDatabase.zoneSnapshots;
    this.progressRepository = this.gameDatabase.progress;
    this.questEffects = new QuestEffectApplier(this.progressRepository, {
      onLog: (questId, message) => this.logger.info(message, { questId }),
      onCommitError: (batch, error) => {
        this.logger.error("Quest state commit failed; will retry", {
          characterId: batch.characterId,
          questKeys: batch.quests.map((quest) => quest.questKey),
          error: error instanceof Error ? error.message : String(error),
        });
      },
      deferWrite: (characterId, intent) => {
        this.characterApplication?.defer(characterId, intent);
      },
      grantItem: (characterId, itemId, quantity) => {
        return this.characterApplication
          ?.grantQuestItem(characterId, itemId, quantity)
          ?? Promise.resolve(null);
      },
    });
    await this.questCatalog.start();
    this.worldState = new WorldStateService(
      this.gameDatabase.worldState,
      { defaults: DEFAULT_WORLD_FACTS },
    );
    // Every published revision reaches every shard, including ones started later.
    this.unsubscribeWorldState = this.worldState.subscribe((snapshot) => {
      this.workerPool.updateWorldState(snapshot);
    });
    await this.worldState.start();

    const director = new WorldSituationDirector(this.worldState, WORLD_SITUATIONS, {
      seed: this.env.zone.worldSeed,
    });
    await director.start(this.gameDatabase.worldState);
    this.situationLoop = runSituationDirector(director, {
      onEvaluation: (evaluation) => {
        for (const occurrence of evaluation.started) {
          this.logger.info("World situation started", {
            situationKey: occurrence.situationKey,
            occurrenceId: occurrence.id,
            data: occurrence.data,
          });
        }
      },
      onError: (error) => {
        this.logger.error("World situation evaluation failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      },
    });
    this.logger.info("Zone service started", {
      tickRateHz: this.env.zone.tickRateHz,
      workBudgetMs: this.env.zone.workBudgetMs,
    });
  }

  async stop(): Promise<void> {
    this.questCatalog.stop();
    await this.situationLoop?.stop();
    this.situationLoop = null;
    this.unsubscribeWorldState?.();
    this.unsubscribeWorldState = null;
    await this.worldState?.drain();
    this.worldState = null;
    await this.workerPool.stopAll();
    await Promise.allSettled(this.questWrites.values());
    await this.writeScheduler?.drain();
    this.gmCommands = null;
    this.zoneJoin = null;
    this.characterApplication = null;
    this.writeScheduler = null;
    this.gameDatabase = null;
    this.zoneSnapshotRepository = null;
    this.logger.info("Zone service stopped", this.dispatcher.metrics());
  }

  listShards(): ZoneShardStatus[] {
    return this.workerPool.listShards();
  }

  startShard(zoneId: number, instanceId = 0): ZoneShardStatus {
    return this.workerPool.ensureShard(zoneId, instanceId);
  }

  async stopShard(zoneId: number, instanceId = 0): Promise<boolean> {
    const shard = shardKey(zoneId, instanceId);
    const characterIds = new Set(
      [...this.sessionEntities.values()]
        .filter((entity) => entity.shard === shard)
        .map((entity) => entity.characterId),
    );
    const stopped = await this.workerPool.stopShard(zoneId, instanceId);
    await this.questWrites.get(shard)?.catch(() => {});
    this.questWrites.delete(shard);
    await Promise.all(
      [...characterIds].map((characterId) =>
        this.characterApplication?.flush(characterId)
      ),
    );
    this.shardSpawns.delete(shard);
    this.shardPlayers.delete(shard);
    this.shardSnapshots.delete(shard);
    this.nextEntityIdByShard.delete(shard);
    return stopped;
  }

  questStatus(): ReturnType<QuestCatalog["status"]> {
    return this.questCatalog.status();
  }

  reloadQuests(): Promise<void> {
    return this.questCatalog.reload();
  }

  private async attachSession(
    sessionId: number,
    zoneId: number,
    instanceId: number,
    characterName: string,
    transition?: {
      useSafeLocation?: boolean | undefined;
      x?: number | undefined;
      y?: number | undefined;
      z?: number | undefined;
      heading?: number | undefined;
    },
  ): Promise<void> {
    const previous = this.sessionRoutes.get(sessionId);
    if (
      previous &&
      (previous.zoneId !== zoneId || previous.instanceId !== instanceId)
    ) {
      this.workerPool.enqueue(previous.zoneId, previous.instanceId, {
        type: "client_leave",
        sessionId,
      });
      this.removeSessionEntityDefinition(sessionId);
      this.sessionRoutes.delete(sessionId);
    }
    if (!this.messenger) throw new Error("zone messenger is not attached");
    const join = await this.zoneJoinService().load(
      characterName,
      zoneId,
      instanceId,
      transition,
    );
    const {
      zone,
      character,
      npcs: spawnRows,
      position: { x, y, z },
    } = join;
    const shard = shardKey(zoneId, instanceId);
    if (!this.shardSnapshots.has(shard)) {
      const stored = await this.zoneSnapshotRepository
        ?.latest(zoneId, instanceId)
        .catch((error: unknown) => {
          this.logger.warn("Zone snapshot was ignored during startup", {
            zoneId,
            instanceId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        });
      this.shardSnapshots.set(shard, stored?.snapshot ?? null);
    }
    const initialSnapshot = this.shardSnapshots.get(shard) ?? null;
    const persistedEntities = new Map(
      (initialSnapshot?.entities ?? []).map((entity) => [entity.spawnId, entity]),
    );
    this.shardSpawns.set(
      shard,
      new Map(spawnRows.map((spawn) => [spawn.spawnId, spawn])),
    );
    const currentEntity = this.sessionEntities.get(sessionId);
    const entityId =
      currentEntity?.shard === shard
        ? currentEntity.entityId
        : this.allocateEntityId(shard, spawnRows);
    const playerSpawn: PlayerWorldSpawn = playerSpawnProjection(join, entityId);
    const existingPlayers = [
      ...(this.shardPlayers.get(shard)?.values() ?? []),
    ].filter((spawn) => spawn.spawnId !== entityId);
    this.sessionRoutes.set(sessionId, { zoneId, instanceId });
    const characterId = Number(character?.id ?? entityId);
    const runtimePlayer = zoneRuntimePlayerProjection(join, sessionId, entityId);
    this.sessionEntities.set(sessionId, {
      shard,
      entityId,
      characterId,
      characterName: character.name,
    });
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "zone_hydrate",
      zoneKey: zone.key,
      npcs: spawnRows,
      ...(initialSnapshot
        ? { snapshotBlob: encodeZoneSnapshot(initialSnapshot) }
        : {}),
    });
    await this.sendReliable(
      sessionId,
      OP.NEW_ZONE,
      encodeNewZone(newZoneProjection(join, zoneId, instanceId)),
    );
    await this.sendReliable(
      sessionId,
      OP.PLAYER_PROFILE,
      encodePlayerProfile(playerProfileProjection(join, zoneId, instanceId)),
    );
    await this.sendReliable(
      sessionId,
      OP.BATCH_ZONE_SPAWNS,
      encodeWorldSpawnBatch(
        [
          ...spawnRows.map((spawn) => toClientSpawn(
            spawn,
            persistedEntities.get(spawn.spawnId),
          )),
          ...existingPlayers,
        ].filter((spawn) =>
          withinAoi(spawn, { x, y, z }),
        ),
      ),
    );
    const players =
      this.shardPlayers.get(shard) ?? new Map<number, PlayerWorldSpawn>();
    players.set(entityId, playerSpawn);
    this.shardPlayers.set(shard, players);
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "quest_hydrate",
      npcs: spawnRows.map((spawn, npcIndex) => {
        const candidate = persistedEntities.get(spawn.spawnId);
        const restored = candidate?.npcArchetypeId === spawn.npcArchetypeId
          ? candidate
          : undefined;
        return questNpcProjection({
          ...spawn,
          x: restored?.position.x ?? spawn.x,
          y: restored?.position.y ?? spawn.y,
          z: restored?.position.z ?? spawn.z,
          heading: restored
            ? radiansToEqHeading(restored.heading)
            : spawn.heading,
        }, npcIndex);
      }),
    });
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "client_join",
      ...runtimePlayer,
    });
    await this.sendReliable(
      sessionId,
      OP.ABILITY_LOADOUT,
      encodeSidecar(
        SIDECAR_SCHEMA.ABILITY_LOADOUT,
        abilityLoadoutProjection(join.techniques),
      ),
    );
    void this.sendQuestCharacter(zoneId, instanceId, sessionId, characterId);
    // The panels want the whole picture the moment the zone opens, not the first time
    // the player spends something.
    void this.sendProgressionState(
      sessionId,
      characterId,
      null,
    ).catch(() => {});
  }

  /**
   * Loads persisted quest state, knowledge and progression into the shard, then pushes
   * the character's own journal and experience meter back to the client.
   */
  private async sendQuestCharacter(
    zoneId: number,
    instanceId: number,
    sessionId: number,
    characterId: number,
  ): Promise<void> {
    const repository = this.progressRepository;
    if (!repository) return;
    try {
      const snapshot = await repository.load(characterId);
      if (!snapshot) return;
      this.workerPool.enqueue(zoneId, instanceId, {
        type: "quest_character",
        sessionId,
        snapshot,
      });
      const progress = await repository.progress(characterId);
      if (progress) {
        await this.sendReliable(
          sessionId,
          OP.EXPERIENCE_UPDATE,
          encodeSidecar(SIDECAR_SCHEMA.EXPERIENCE_UPDATE, {
            experience: progress.experience,
            level: progress.level,
            intoLevel: progress.intoLevel,
            forLevel: progress.forLevel,
            gained: 0,
            leveled: false,
            source: "sync",
          }),
        );
      }
      await this.sendJournal(
        sessionId,
        journalFromState(snapshot),
        await repository.notes(characterId),
        null,
      );
    } catch (error: unknown) {
      this.logger.warn("Quest character load failed", {
        sessionId,
        characterId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Add, drop or pin a player-authored note, then echo the whole journal back. */
  private async handleJournalNote(
    sessionId: number,
    payload: Uint8Array,
  ): Promise<void> {
    const entity = this.sessionEntities.get(sessionId);
    const request = decodeRequest(OP.JOURNAL_NOTE, payload);
    if (!entity || request?.type !== "journal_note") return;
    const result = await this.characterApp().updateJournal(
      entity.characterId,
      request,
    );
    await this.sendJournal(
      sessionId,
      result.entries,
      result.notes,
      null,
    );
  }

  private async handleGmCommand(
    sessionId: number,
    payload: Uint8Array,
  ): Promise<void> {
    const entity = this.sessionEntities.get(sessionId);
    const request = decodeRequest(OP.GM_COMMAND, payload);
    if (!entity || request?.type !== "gm_command") return;
    const effects = await this.gmCommandService().execute(
      entity.characterId,
      request.command,
      request.args,
    );
    for (const effect of effects) await this.sendGmEffect(sessionId, effect);
  }

  private sendGmEffect(
    sessionId: number,
    effect: GmCommandEffect,
  ): Promise<void> {
    switch (effect.type) {
      case "message":
        return this.sendReliable(
          sessionId,
          OP.CHANNEL_MESSAGE,
          encodeChannelMessage({
            sender: "Server",
            target: "",
            message: effect.message,
            chanNum: -1,
          }),
        );
      case "level":
        {
          const route = this.sessionRoutes.get(sessionId);
          if (route) {
            this.workerPool.enqueue(route.zoneId, route.instanceId, {
              type: "client_level",
              sessionId,
              level: effect.level,
              combat: effect.combat,
            });
          }
        }
        return this.sendReliable(
          sessionId,
          OP.LEVEL_UPDATE,
          encodeSidecar(SIDECAR_SCHEMA.LEVEL, {
            level: effect.level,
            exp: effect.experience,
          }),
        );
      case "inventory_put":
        return this.sendReliable(
          sessionId,
          OP.ADD_ITEM_PACKET,
          encodeSidecar(SIDECAR_SCHEMA.ITEM, effect.item),
        );
      case "inventory_delete_many":
        return this.sendReliable(
          sessionId,
          OP.BULK_DELETE_ITEMS,
          encodeSidecar(SIDECAR_SCHEMA.BULK_DELETE_ITEMS, {
            items: effect.items,
          }),
        );
      case "inventory_replace":
        return this.sendGmInventoryReplacement(sessionId, effect);
    }
  }

  private async sendGmInventoryReplacement(
    sessionId: number,
    effect: Extract<GmCommandEffect, { type: "inventory_replace" }>,
  ): Promise<void> {
    const route = this.sessionRoutes.get(sessionId);
    if (route) {
      this.workerPool.enqueue(route.zoneId, route.instanceId, {
        type: "client_level",
        sessionId,
        level: effect.level,
        combat: effect.combat,
      });
    }
    if (effect.removed.length) {
      await this.sendReliable(
        sessionId,
        OP.BULK_DELETE_ITEMS,
        encodeSidecar(SIDECAR_SCHEMA.BULK_DELETE_ITEMS, {
          items: effect.removed,
        }),
      );
    }
    await this.sendReliable(
      sessionId,
      OP.ITEM_PACKET,
      encodeSidecar(SIDECAR_SCHEMA.BULK_ITEMS, { items: effect.items }),
    );
  }

  /**
   * The live half of learning, preparing and Aspect spending.
   *
   * Shares every rule with the offline path through `progression-requests.ts`; only the
   * transport and the database handle differ, which is the whole point of the split.
   */
  private async handleProgressionRequest(
    sessionId: number,
    payload: Uint8Array,
  ): Promise<void> {
    const entity = this.sessionEntities.get(sessionId);
    const decoded = decodeRequest(OP.PROGRESSION_REQUEST, payload);
    if (!entity || decoded?.type !== "progression_request") return;

    const outcome = await this.characterApp().progression(
      entity.characterId,
      decoded.request,
    );
    if (!outcome) return;
    const route = this.sessionRoutes.get(sessionId);
    if (route) {
      this.workerPool.enqueue(route.zoneId, route.instanceId, {
        type: "client_loadout",
        sessionId,
        ...outcome.combatLoadout,
      });
    }
    await this.sendReliable(
      sessionId,
      OP.PROGRESSION_STATE,
      encodeSidecar(SIDECAR_SCHEMA.PROGRESSION_STATE, {
        ...outcome.state,
        refusal: outcome.refusal,
      }),
    );
    await this.sendReliable(
      sessionId,
      OP.ABILITY_LOADOUT,
      encodeSidecar(SIDECAR_SCHEMA.ABILITY_LOADOUT, outcome.abilityLoadout),
    );
  }

  private async sendProgressionState(
    sessionId: number,
    characterId: number,
    refusal: string | null,
  ): Promise<void> {
    const state = await this.characterApp().progressionState(characterId);
    if (!state) return;
    await this.sendReliable(
      sessionId,
      OP.PROGRESSION_STATE,
      encodeSidecar(SIDECAR_SCHEMA.PROGRESSION_STATE, { ...state, refusal }),
    );
  }

  private async sendJournal(
    sessionId: number,
    entries: readonly QuestJournalEntry[],
    notes: readonly CharacterJournalNote[],
    changed: unknown,
  ): Promise<void> {
    await this.sendReliable(
      sessionId,
      OP.JOURNAL_UPDATE,
      encodeSidecar(SIDECAR_SCHEMA.JOURNAL_UPDATE, { entries, notes, changed }),
    );
  }

  /**
   * The worker executes quests; this is the only place their persistent consequences
   * reach the database, serialized per shard so concurrent dispatches cannot interleave.
   */
  private commitQuestEffects(message: ZoneQuestEffectsMessage): Promise<void> {
    const key = `${message.zoneId}:${message.instanceId}`;
    const previous = this.questWrites.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => this.applyQuestEffects(message));
    this.questWrites.set(key, next);
    void next.finally(() => {
      if (this.questWrites.get(key) === next) this.questWrites.delete(key);
    }).catch(() => {});
    return next;
  }

  private async applyQuestEffects(message: ZoneQuestEffectsMessage): Promise<void> {
    const applier = this.questEffects;
    if (!applier) return;
    const journals = new Map(
      message.journals.map((journal) => [journal.sessionId, journal]),
    );
    let batches: readonly QuestPersistenceBatch[] = message.batches;
    const source: QuestEffectSource = {
      journalFor: (sessionId) => journals.get(sessionId)?.entries ?? [],
      drainPersistence: () => {
        const pending = batches;
        batches = [];
        return pending;
      },
      character: (sessionId) => {
        const journal = journals.get(sessionId);
        return journal
          ? {
              characterId: journal.characterId,
              experience: journal.experience,
              level: journal.level,
            }
          : null;
      },
      setCharacterProgression: (sessionId, experience, level) => {
        this.workerPool.enqueue(message.zoneId, message.instanceId, {
          type: "quest_progression",
          sessionId,
          experience,
          level,
          previousLevel: level,
          leveled: false,
        });
      },
      // The shard raises level_up itself when it receives the committed progression.
      dispatchLevelUp: () => [],
    };
    for (const delivery of await applier.apply(source, message.effects)) {
      if (delivery.type === "level_update") {
        // Tell the shard a threshold was crossed so authored level_up hooks can run.
        this.workerPool.enqueue(message.zoneId, message.instanceId, {
          type: "quest_progression",
          sessionId: delivery.sessionId,
          experience: Number(delivery.value.exp ?? 0),
          level: Number(delivery.value.level ?? 1),
          previousLevel: Math.max(1, Number(delivery.value.level ?? 1) - 1),
          leveled: true,
        });
      }
      await this.deliverQuestPacket(delivery.sessionId, delivery.type, delivery.value);
    }
  }

  private async deliverQuestPacket(
    sessionId: number,
    type: QuestClientDelivery["type"],
    value: Record<string, unknown>,
  ): Promise<void> {
    if (type === "grant_item") {
      const repository = this.progressRepository;
      const instance = repository
        ? await grantedItemEvent(
            repository,
            value as unknown as { slot: number; bag: number; itemId: number },
            Number(value.quantity ?? 1),
          )
        : null;
      if (instance) {
        await this.sendReliable(
          sessionId,
          OP.ADD_ITEM_PACKET,
          encodeSidecar(SIDECAR_SCHEMA.ITEM, instance),
        );
      }
      return;
    }
    if (type === "journal_update") {
      await this.sendReliable(
        sessionId,
        OP.JOURNAL_UPDATE,
        encodeSidecar(SIDECAR_SCHEMA.JOURNAL_UPDATE, value),
      );
      return;
    }
    if (type === "experience_update") {
      await this.sendReliable(
        sessionId,
        OP.EXPERIENCE_UPDATE,
        encodeSidecar(SIDECAR_SCHEMA.EXPERIENCE_UPDATE, value),
      );
      return;
    }
    if (type === "level_update") {
      await this.sendReliable(
        sessionId,
        OP.LEVEL_UPDATE,
        encodeSidecar(SIDECAR_SCHEMA.LEVEL, value),
      );
      return;
    }
    await this.sendReliable(
      sessionId,
      OP.CHANNEL_MESSAGE,
      encodeChannelMessage({
        sender: String(value.sender ?? ""),
        target: String(value.target ?? ""),
        message: String(value.message ?? ""),
        chanNum: 0,
      }),
    );
  }

  private async handlePcDeath(message: ZonePcDeathMessage): Promise<void> {
    const characterName = this.sessionEntities.get(message.sessionId)?.characterName;
    const current = this.sessionRoutes.get(message.sessionId);
    if (current) {
      this.workerPool.enqueue(current.zoneId, current.instanceId, {
        type: "client_leave",
        sessionId: message.sessionId,
      });
    }
    this.sessionRoutes.delete(message.sessionId);
    this.removeSessionEntityDefinition(message.sessionId);
    await this.characterApp().checkpointPosition(message.characterId, {
      zoneId: message.bind.zoneId,
      instanceId: message.bind.instanceId,
      x: message.bind.x,
      y: message.bind.y,
      z: message.bind.z,
      heading: message.bind.heading,
    });
    await this.sendReliable(
      message.sessionId,
      OP.DEATH_EVENT,
      encodeSidecar(SIDECAR_SCHEMA.DEATH_EVENT, {
        victimId: message.victimId,
        victimKind: "pc",
        killerId: message.killerId,
        corpseId: 0,
        bindZoneId: message.bind.zoneId,
        x: message.bind.x,
        y: message.bind.y,
        z: message.bind.z,
        heading: message.bind.heading,
      }),
    );
    if (characterName) {
      await this.attachSession(
        message.sessionId,
        message.bind.zoneId,
        message.bind.instanceId,
        characterName,
      );
    }
  }

  private async handleInventoryMove(
    sessionId: number,
    move: {
      readonly fromSlot: number;
      readonly toSlot: number;
      readonly fromBag: number;
      readonly toBag: number;
    },
  ): Promise<void> {
    const entity = this.sessionEntities.get(sessionId);
    if (!entity) return;
    const moves = await this.characterApp().moveItem(
      entity.characterId,
      move,
    );
    for (const movement of moves) {
      await this.sendReliable(
        sessionId,
        OP.MOVE_ITEM,
        encodeMoveItemResponse(movement),
      );
    }
  }

  private async handleInventoryDelete(
    sessionId: number,
    deletion: { readonly slot: number; readonly bag: number },
  ): Promise<void> {
    const entity = this.sessionEntities.get(sessionId);
    if (!entity) return;
    await this.characterApp().deleteItem(
      entity.characterId,
      deletion.slot,
      deletion.bag,
    );
  }

  private async handleLootAward(message: ZoneLootAwardMessage): Promise<void> {
    const destination = await this.characterApp().grantLoot(
      message.characterId,
      Number(message.item.itemId ?? message.item.id),
      Math.max(1, Number(message.item.quantity ?? 1)),
      Number(message.item.charges ?? 0),
    );
    if (destination === null) {
      this.restoreLoot(message, "Your inventory is full.");
      return;
    }
    await this.sendReliable(
      message.sessionId,
      OP.ADD_ITEM_PACKET,
      encodeSidecar(SIDECAR_SCHEMA.ITEM, {
        ...message.item,
        slot: destination.slot,
        bagSlot: -1,
      }),
    );
  }

  private queueLootAward(message: ZoneLootAwardMessage): void {
    void this.handleLootAward(message)
      .catch((error: unknown) => {
        this.logger.error("Loot award failed", {
          sessionId: message.sessionId,
          corpseId: message.corpseId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.restoreLoot(message, "Unable to award that item.");
      });
  }

  private queueMerchantIntent(message: ZoneMerchantIntentMessage): void {
    void this.handleMerchantIntent(message)
      .catch((error: unknown) => this.sendMerchantError(
        message.sessionId,
        message.npcId,
        error instanceof Error
          ? error.message
          : "Unable to complete that merchant transaction.",
      ));
  }

  private async handleMerchantIntent(
    message: ZoneMerchantIntentMessage,
  ): Promise<void> {
    const common = {
      characterId: message.characterId,
      npcArchetypeId: message.npcArchetypeId,
      npcId: message.npcId,
      merchantName: message.merchantName,
      zoneId: message.zoneId,
      instanceId: message.instanceId,
    };
    const result = message.action === "buy"
      ? await this.characterApp().merchant({
          ...common,
          action: "buy",
          merchantSlot: Number(message.merchantSlot),
          quantity: Number(message.quantity),
        })
      : message.action === "sell"
      ? await this.characterApp().merchant({
          ...common,
          action: "sell",
          slot: Number(message.slot),
          bag: Number(message.bag),
          quantity: Number(message.quantity),
        })
      : await this.characterApp().merchant({ ...common, action: "open" });
    if (!result.ok) {
      await this.sendMerchantError(message.sessionId, message.npcId, result.message);
      return;
    }
    if (result.mutation) {
      await this.sendMerchantMutation(message.sessionId, result.mutation);
    }
    await this.sendReliable(
      message.sessionId,
      OP.MERCHANT_WINDOW,
      encodeSidecar(SIDECAR_SCHEMA.MERCHANT_WINDOW, result.window),
    );
  }

  private sendMerchantMutation(
    sessionId: number,
    mutation: {
      kind: "put" | "delete";
      slot: number;
      bag: number;
      item?: Record<string, unknown>;
    },
  ): Promise<void> {
    return mutation.kind === "delete"
      ? this.sendReliable(
        sessionId,
        OP.DELETE_ITEM,
        encodeSidecar(SIDECAR_SCHEMA.DELETE_ITEM, {
          slot: mutation.slot,
          bag: mutation.bag,
        }),
      )
      : this.sendReliable(
        sessionId,
        OP.ADD_ITEM_PACKET,
        encodeSidecar(SIDECAR_SCHEMA.ITEM, mutation.item),
      );
  }

  private sendMerchantError(
    sessionId: number,
    npcId: number,
    message: string,
  ): Promise<void> {
    return this.sendReliable(
      sessionId,
      OP.MERCHANT_ERROR,
      encodeSidecar(SIDECAR_SCHEMA.MERCHANT_ERROR, { npcId, message }),
    );
  }

  private restoreLoot(
    message: ZoneLootAwardMessage,
    errorMessage: string,
  ): void {
    this.workerPool.enqueue(message.zoneId, message.instanceId, {
      type: "loot_restore",
      corpseId: message.corpseId,
      item: message.item,
    });
    void this.sendReliable(
      message.sessionId,
      OP.LOOT_ERROR,
      encodeSidecar(SIDECAR_SCHEMA.LOOT_ERROR, {
        corpseId: message.corpseId,
        message: errorMessage,
      }),
    );
  }

  private async sendAoiChanges(
    zoneId: number,
    instanceId: number,
    sessionId: number,
    enteredSpawnIds: readonly number[],
    exitedSpawnIds: readonly number[],
  ): Promise<void> {
    if (!this.messenger) return;
    const route = this.sessionRoutes.get(sessionId);
    if (!route || route.zoneId !== zoneId || route.instanceId !== instanceId)
      return;
    const spawns = this.shardSpawns.get(shardKey(zoneId, instanceId));
    const players = this.shardPlayers.get(shardKey(zoneId, instanceId));
    const persisted = new Map(
      (this.shardSnapshots.get(shardKey(zoneId, instanceId))?.entities ?? [])
        .map((entity) => [entity.spawnId, entity]),
    );
    for (const spawnId of exitedSpawnIds) {
      await this.sendReliable(
        sessionId,
        OP.DELETE_SPAWN,
        encodeDeleteSpawn({ spawnId }),
      );
    }
    for (const spawnId of enteredSpawnIds) {
      const spawn = spawns?.get(spawnId);
      const clientSpawn = spawn
        ? toClientSpawn(spawn, persisted.get(spawnId))
        : players?.get(spawnId);
      if (!clientSpawn) continue;
      await this.sendReliable(
        sessionId,
        OP.ZONE_SPAWNS,
        encodeWorldSpawnBatch([clientSpawn]),
      );
    }
  }

  private allocateEntityId(
    shard: string,
    npcs: readonly ZoneNpcSpawnDefinition[],
  ): number {
    const used = new Set(npcs.map((spawn) => spawn.spawnId >>> 0));
    for (const entityId of this.shardPlayers.get(shard)?.keys() ?? [])
      used.add(entityId);
    let candidate = this.nextEntityIdByShard.get(shard) ?? 1;
    while (used.has(candidate)) {
      candidate += 1;
      if (candidate > 0xffff_ffff) candidate = 1;
    }
    this.nextEntityIdByShard.set(
      shard,
      candidate === 0xffff_ffff ? 1 : candidate + 1,
    );
    return candidate;
  }

  private removeSessionEntityDefinition(sessionId: number): void {
    const owned = this.sessionEntities.get(sessionId);
    if (!owned) return;
    this.shardPlayers.get(owned.shard)?.delete(owned.entityId);
    this.sessionEntities.delete(sessionId);
  }

  private queueLocationWrite(
    sessionId: number,
    location: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly heading: number;
    },
  ): void {
    const owned = this.sessionEntities.get(sessionId);
    const route = this.sessionRoutes.get(sessionId);
    if (!owned || !route) return;

    const player = this.shardPlayers.get(owned.shard)?.get(owned.entityId);
    if (player) {
      this.shardPlayers.get(owned.shard)?.set(owned.entityId, {
        ...player,
        x: location.x,
        y: location.y,
        z: location.z,
        heading: radiansToEqHeading(location.heading),
      });
    }

    this.characterApplication?.rememberPosition(owned.characterId, {
      zoneId: route.zoneId,
      instanceId: route.instanceId,
      x: location.x,
      y: location.y,
      z: location.z,
      heading: radiansToEqHeading(location.heading),
    });
  }

  private async flushCharacterWrites(
    characterId: number,
    checkpoint: string,
  ): Promise<void> {
    try {
      await this.characterApplication?.flush(characterId);
    } catch (error) {
      this.logger.warn("Character write checkpoint failed", {
        characterId,
        checkpoint,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private gameDb(): GameDatabase {
    if (!this.gameDatabase) throw new Error("zone database is not started");
    return this.gameDatabase;
  }

  private characterApp(): CharacterApplicationService {
    if (!this.characterApplication) {
      throw new Error("character application service is not started");
    }
    return this.characterApplication;
  }

  private zoneJoinService(): ZoneJoinService {
    if (!this.zoneJoin) throw new Error("zone join service is not started");
    return this.zoneJoin;
  }

  private gmCommandService(): GmCommandService {
    if (!this.gmCommands) throw new Error("GM command service is not started");
    return this.gmCommands;
  }

  private sendReliable(
    sessionId: number,
    opcode: number,
    payload: Uint8Array,
  ): Promise<void> {
    const messenger = this.messenger;
    if (!messenger)
      return Promise.reject(new Error("zone messenger is not attached"));
    const previous = this.reliableSends.get(sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => messenger.sendStream(sessionId, opcode, payload));
    this.reliableSends.set(sessionId, next);
    void next
      .finally(() => {
        if (this.reliableSends.get(sessionId) === next)
          this.reliableSends.delete(sessionId);
      })
      .catch(() => {});
    return next;
  }
}

function toClientSpawn(
  spawn: ZoneNpcSpawnDefinition,
  persisted?: ZoneSnapshotEntity,
): NpcWorldSpawn {
  const base = npcSpawnProjection(spawn);
  const restored = persisted?.npcArchetypeId === spawn.npcArchetypeId
    ? persisted
    : undefined;
  const isCorpse = restored?.lifecycle === "corpse";
  return {
    ...base,
    name: isCorpse ? corpseName(spawn.name) : spawn.name,
    ...(isCorpse ? { kind: 3 } : {}),
    x: restored?.position.x ?? spawn.x,
    y: restored?.position.y ?? spawn.y,
    z: restored?.position.z ?? spawn.z,
    heading: restored ? radiansToEqHeading(restored.heading) : spawn.heading,
    currentHp: isCorpse
      ? 0
      : Math.min(restored?.currentHp ?? spawn.maximumHp, spawn.maximumHp),
    maximumHp: spawn.maximumHp,
  };
}

function withinAoi(
  entity: { x: number; y: number; z: number },
  player: { x: number; y: number; z: number },
): boolean {
  return (
    Math.abs(Math.floor(entity.x / 300) - Math.floor(player.x / 300)) <= 1 &&
    Math.abs(Math.floor(entity.y / 300) - Math.floor(player.y / 300)) <= 1 &&
    Math.abs(Math.floor(entity.z / 300) - Math.floor(player.z / 300)) <= 1
  );
}

function shardKey(zoneId: number, instanceId: number): string {
  return `${zoneId}:${instanceId}`;
}

type PlayerWorldSpawn = WorldSpawnInput & {
  readonly isNpc: false;
  x: number;
  y: number;
  z: number;
};
type NpcWorldSpawn = WorldSpawnInput & {
  readonly isNpc: true;
  readonly x: number;
  readonly y: number;
  readonly z: number;
};
