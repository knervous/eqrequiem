import type { AppEnv } from "../config/env.js";
import type { DatabaseRow } from "../db/backend.js";
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
import { encodeSidecar, SIDECAR_SCHEMA } from "../protocol/sidecar-codec.js";
import type { PersistService } from "../persist/index.js";
import { GameDataRepository } from "../persist/game-data-repository.js";
import { ZoneSnapshotRepository } from "../persist/zone-snapshot-repository.js";
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
} from "./worker-types.js";
import {
  MerchantRepository,
  MerchantTransactionError,
} from "../merchant/merchant-repository.js";
import { corpseName } from "../combat/corpse-loot.js";
import type {
  ZoneSnapshot,
  ZoneSnapshotEntity,
} from "./zone-snapshot.js";
import { encodeZoneSnapshot } from "./zone-snapshot.js";

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
    { shard: string; entityId: number; characterId: number }
  >();
  private readonly nextEntityIdByShard = new Map<string, number>();
  private readonly reliableSends = new Map<number, Promise<void>>();
  private readonly locationWrites = new Map<number, Promise<void>>();
  private readonly lootWrites = new Map<number, Promise<void>>();
  private readonly merchantWrites = new Map<number, Promise<void>>();
  private merchantRepository: MerchantRepository | null = null;
  private zoneSnapshotRepository: ZoneSnapshotRepository | null = null;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
    private readonly persist: PersistService,
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
      async (zoneId, instanceId, blobData, formatVersion) => {
        const repository = this.zoneSnapshotRepository;
        if (!repository) throw new Error("Zone snapshot repository is not started");
        await repository.save(zoneId, instanceId, blobData, formatVersion);
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
        void this.persist
          .moveItem({
            sessionId: packet.sessionId,
            fromSlot: move.fromSlot,
            toSlot: move.toSlot,
            fromBag: move.fromBag,
            toBag: move.toBag,
          })
          .then(async (result) => {
            for (const movement of result.moves) {
              await this.messenger?.sendStream(
                packet.sessionId,
                OP.MOVE_ITEM,
                encodeMoveItemResponse(movement),
              );
            }
          })
          .catch((error: unknown) => {
            this.logger.warn("Persist move item failed", {
              sessionId: packet.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
    }

    if (packet.opcode === OP.DELETE_ITEM) {
      const del = decodeDeleteItemRequest(packet.payload);
      if (del) {
        void this.persist
          .deleteItem({
            sessionId: packet.sessionId,
            slot: del.slot,
            bag: del.bag,
          })
          .catch((error: unknown) => {
            this.logger.warn("Persist delete item failed", {
              sessionId: packet.sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
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
    this.workerPool.enqueue(route.zoneId, route.instanceId, {
      type: "client_leave",
      sessionId,
    });
    this.removeSessionEntityDefinition(sessionId);
    this.sessionRoutes.delete(sessionId);
    this.reliableSends.delete(sessionId);
  }

  async start(): Promise<void> {
    this.merchantRepository = new MerchantRepository(
      this.databases.backend("content"),
      this.databases.backend("runtime"),
    );
    this.zoneSnapshotRepository = new ZoneSnapshotRepository(
      this.databases.backend("runtime"),
    );
    await this.questCatalog.start();
    this.logger.info("Zone service started", {
      tickRateHz: this.env.zone.tickRateHz,
      workBudgetMs: this.env.zone.workBudgetMs,
    });
  }

  async stop(): Promise<void> {
    this.questCatalog.stop();
    await this.workerPool.stopAll();
    await Promise.allSettled(this.locationWrites.values());
    await Promise.allSettled(this.merchantWrites.values());
    this.merchantRepository = null;
    this.zoneSnapshotRepository = null;
    await Promise.allSettled(this.lootWrites.values());
    this.logger.info("Zone service stopped", this.dispatcher.metrics());
  }

  listShards(): ZoneShardStatus[] {
    return this.workerPool.listShards();
  }

  startShard(zoneId: number, instanceId = 0): ZoneShardStatus {
    return this.workerPool.ensureShard(zoneId, instanceId);
  }

  stopShard(zoneId: number, instanceId = 0): Promise<boolean> {
    const shard = shardKey(zoneId, instanceId);
    this.shardSpawns.delete(shard);
    this.shardPlayers.delete(shard);
    this.shardSnapshots.delete(shard);
    this.nextEntityIdByShard.delete(shard);
    return this.workerPool.stopShard(zoneId, instanceId);
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
      x?: number | undefined;
      y?: number | undefined;
      z?: number | undefined;
      heading?: number | undefined;
    },
  ): Promise<void> {
    await this.locationWrites.get(sessionId)?.catch(() => {});
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
    }
    if (!this.messenger) throw new Error("zone messenger is not attached");
    const content = this.databases.backend("content");
    const runtime = this.databases.backend("runtime");
    const zone = (
      await content.query<ZoneRow>(
        "SELECT id, short_name AS key, name, safe_x, safe_y, safe_z FROM zones WHERE id = ? LIMIT 1",
        [zoneId],
      )
    ).rows[0];
    if (!zone) throw new Error(`zone ${zoneId} does not exist`);
    const character = (
      await runtime.query<CharacterProfileRow>(
        `SELECT c.id, c.name, c.level, c.class_id, c.race_id, c.gender, c.deity_id, c.face,
        c.str, c.sta, c.dex, c.agi, c.intelligence, c.wis, c.cha,
        p.x, p.y, p.z, p.heading
       FROM characters c LEFT JOIN character_positions p ON p.character_id = c.id
       WHERE lower(c.name) = lower(?) LIMIT 1`,
        [characterName],
      )
    ).rows[0];
    const gameData = new GameDataRepository(content, runtime);
    const inventoryItems = character
      ? await gameData.inventoryItems(Number(character.id))
      : [];
    const playerCombat = character
      ? await gameData.characterCombat(Number(character.id))
      : null;
    const bind = character
      ? (
          await runtime.query<CharacterBindRow>(
            `SELECT zone_id, instance_id, x, y, z, heading
           FROM character_binds WHERE character_id = ? AND slot = 0 LIMIT 1`,
            [Number(character.id)],
          )
        ).rows[0]
      : undefined;
    const effectiveCombat = playerCombat ?? {
      level: Number(character?.level ?? 1),
      strength: Number(character?.str ?? 75),
      stamina: Number(character?.sta ?? 75),
      dexterity: Number(character?.dex ?? 75),
      agility: Number(character?.agi ?? 75),
      offense: 0,
      defense: 0,
      armorClass: 0,
      maximumHp: 1,
      weaponDamage: 2,
      attackDelayMs: 2_500,
      haste: 0,
      meleeRange: 3,
    };
    const hasDestination = [transition?.x, transition?.y, transition?.z].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
    const x = hasDestination
      ? Number(transition!.x)
      : Number(character?.x ?? zone.safe_x);
    const y = hasDestination
      ? Number(transition!.y)
      : Number(character?.y ?? zone.safe_y);
    const z = hasDestination
      ? Number(transition!.z)
      : Number(character?.z ?? zone.safe_z);
    const heading =
      transition?.heading === undefined
        ? Number(character?.heading ?? 0)
        : radiansToEqHeading(transition.heading);
    const spawnRows = await gameData.zoneNpcSpawns(zoneId, instanceId);
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
    const playerSpawn: PlayerWorldSpawn = {
      id: Number(character?.id ?? entityId),
      spawnId: entityId,
      name: character?.name ?? characterName,
      level: Number(character?.level ?? 1),
      race: Number(character?.race_id ?? 1),
      gender: Number(character?.gender ?? 0),
      charClass: Number(character?.class_id ?? 1),
      face: Number(character?.face ?? 0),
      isNpc: false,
      size: -1,
      x,
      y,
      z,
      heading,
      currentHp: effectiveCombat.maximumHp,
      maximumHp: effectiveCombat.maximumHp,
      equipment: { head: 0, chest: 0, primary: 0, secondary: 0 },
    };
    const existingPlayers = [
      ...(this.shardPlayers.get(shard)?.values() ?? []),
    ].filter((spawn) => spawn.spawnId !== entityId);
    this.sessionRoutes.set(sessionId, { zoneId, instanceId });
    const characterId = Number(character?.id ?? entityId);
    this.sessionEntities.set(sessionId, { shard, entityId, characterId });
    if (character && hasDestination) {
      await runtime.execute(
        `UPDATE character_positions
         SET zone_id = ?, instance_id = ?, x = ?, y = ?, z = ?, heading = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE character_id = ?`,
        [zoneId, instanceId, x, y, z, heading, characterId],
      );
    }
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
      encodeNewZone({
        zoneId,
        zoneIdNumber: zoneId,
        instanceId,
        shortName: zone.key,
        longName: zone.name,
        zonePoints: [],
      }),
    );
    await this.sendReliable(
      sessionId,
      OP.PLAYER_PROFILE,
      encodePlayerProfile({
        name: character?.name ?? characterName,
        level: Number(character?.level ?? 1),
        charClass: Number(character?.class_id ?? 1),
        race: Number(character?.race_id ?? 1),
        gender: Number(character?.gender ?? 0),
        deity: Number(character?.deity_id ?? 0),
        face: Number(character?.face ?? 0),
        zoneId,
        zoneInstance: instanceId,
        x,
        y,
        z,
        heading,
        str: Number(character?.str ?? 75),
        sta: Number(character?.sta ?? 75),
        dex: Number(character?.dex ?? 75),
        agi: Number(character?.agi ?? 75),
        intel: Number(character?.intelligence ?? 75),
        wis: Number(character?.wis ?? 75),
        cha: Number(character?.cha ?? 75),
        curHp: effectiveCombat.maximumHp,
        maxHp: effectiveCombat.maximumHp,
        inventoryItems,
      }),
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
        return {
          kind: "npc",
          id: spawn.spawnId,
          npcId: spawn.npcArchetypeId,
          npcIndex,
          name: spawn.name,
          level: spawn.level,
          position: {
            x: restored?.position.x ?? spawn.x,
            y: restored?.position.y ?? spawn.y,
            z: restored?.position.z ?? spawn.z,
            heading: restored
              ? radiansToEqHeading(restored.heading)
              : spawn.heading,
          },
        };
      }),
    });
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "client_join",
      sessionId,
      entityId,
      characterId,
      x,
      y,
      z,
      heading,
      characterName: character?.name ?? characterName,
      level: Number(character?.level ?? 1),
      race: Number(character?.race_id ?? 1),
      gender: Number(character?.gender ?? 0),
      charClass: Number(character?.class_id ?? 1),
      face: Number(character?.face ?? 0),
      combat: effectiveCombat,
      bind: {
        zoneId: Number(bind?.zone_id ?? zoneId),
        instanceId: Number(bind?.instance_id ?? 0),
        x: Number(bind?.x ?? zone.safe_x),
        y: Number(bind?.y ?? zone.safe_y),
        z: Number(bind?.z ?? zone.safe_z),
        heading: Number(bind?.heading ?? 0),
      },
    });
  }

  private async handlePcDeath(message: ZonePcDeathMessage): Promise<void> {
    await this.locationWrites.get(message.sessionId)?.catch(() => {});
    const runtime = this.databases.backend("runtime");
    await runtime.execute(
      `UPDATE character_positions
       SET zone_id = ?, instance_id = ?, x = ?, y = ?, z = ?, heading = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE character_id = ?`,
      [
        message.bind.zoneId,
        message.bind.instanceId,
        message.bind.x,
        message.bind.y,
        message.bind.z,
        message.bind.heading,
        message.characterId,
      ],
    );
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
    const character = (
      await runtime.query<{ name: string }>(
        "SELECT name FROM characters WHERE id = ? LIMIT 1",
        [message.characterId],
      )
    ).rows[0];
    if (character) {
      const current = this.sessionRoutes.get(message.sessionId);
      if (current) {
        this.workerPool.enqueue(current.zoneId, current.instanceId, {
          type: "client_leave",
          sessionId: message.sessionId,
        });
      }
      this.sessionRoutes.delete(message.sessionId);
      this.removeSessionEntityDefinition(message.sessionId);
      await this.attachSession(
        message.sessionId,
        message.bind.zoneId,
        message.bind.instanceId,
        character.name,
      );
    }
  }

  private async handleLootAward(message: ZoneLootAwardMessage): Promise<void> {
    const runtime = this.databases.backend("runtime");
    const occupied = (
      await runtime.query<{ slot: number }>(
        `SELECT slot FROM player_inventory
       WHERE character_id = ? AND bag = -1 AND slot BETWEEN 22 AND 30`,
        [message.characterId],
      )
    ).rows;
    const used = new Set(occupied.map((row) => Number(row.slot)));
    const destination = [22, 23, 24, 25, 26, 27, 28, 29, 30].find(
      (slot) => !used.has(slot),
    );
    if (destination === undefined) {
      this.restoreLoot(message, "Your inventory is full.");
      return;
    }
    await runtime.execute(
      `INSERT INTO player_inventory
       (character_id, bag, slot, item_id, quantity, charges)
       VALUES (?, -1, ?, ?, ?, ?)`,
      [
        message.characterId,
        destination,
        Number(message.item.itemId ?? message.item.id),
        Math.max(1, Number(message.item.quantity ?? 1)),
        Number(message.item.charges ?? 0),
      ],
    );
    await this.sendReliable(
      message.sessionId,
      OP.ADD_ITEM_PACKET,
      encodeSidecar(SIDECAR_SCHEMA.ITEM, {
        ...message.item,
        slot: destination,
        bagSlot: -1,
      }),
    );
  }

  private queueLootAward(message: ZoneLootAwardMessage): void {
    const previous = this.lootWrites.get(message.sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() =>
      this.handleLootAward(message)
    );
    this.lootWrites.set(message.sessionId, next);
    void next
      .catch((error: unknown) => {
        this.logger.error("Loot award failed", {
          sessionId: message.sessionId,
          corpseId: message.corpseId,
          error: error instanceof Error ? error.message : String(error),
        });
        this.restoreLoot(message, "Unable to award that item.");
      })
      .finally(() => {
        if (this.lootWrites.get(message.sessionId) === next) {
          this.lootWrites.delete(message.sessionId);
        }
      });
  }

  private queueMerchantIntent(message: ZoneMerchantIntentMessage): void {
    const previous = this.merchantWrites.get(message.sessionId)
      ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() =>
      this.handleMerchantIntent(message)
    );
    this.merchantWrites.set(message.sessionId, next);
    void next
      .catch((error: unknown) => this.sendMerchantError(
        message.sessionId,
        message.npcId,
        error instanceof MerchantTransactionError
          ? error.message
          : "Unable to complete that merchant transaction.",
      ))
      .finally(() => {
        if (this.merchantWrites.get(message.sessionId) === next) {
          this.merchantWrites.delete(message.sessionId);
        }
      });
  }

  private async handleMerchantIntent(
    message: ZoneMerchantIntentMessage,
  ): Promise<void> {
    const merchant = this.merchantRepository;
    if (!merchant) throw new Error("merchant repository is not initialized");
    if (message.action === "buy") {
      const result = await merchant.buy({
        characterId: message.characterId,
        npcArchetypeId: message.npcArchetypeId,
        zoneId: message.zoneId,
        instanceId: message.instanceId,
        merchantSlot: Number(message.merchantSlot),
        quantity: Number(message.quantity),
      });
      await this.sendMerchantMutation(message.sessionId, result.mutation);
    } else if (message.action === "sell") {
      const result = await merchant.sell({
        characterId: message.characterId,
        npcArchetypeId: message.npcArchetypeId,
        zoneId: message.zoneId,
        instanceId: message.instanceId,
        slot: Number(message.slot),
        bag: Number(message.bag),
        quantity: Number(message.quantity),
      });
      await this.sendMerchantMutation(message.sessionId, result.mutation);
    }
    const window = await merchant.open(
      message.characterId,
      message.npcArchetypeId,
      message.npcId,
      message.merchantName,
      message.zoneId,
      message.instanceId,
    );
    await this.sendReliable(
      message.sessionId,
      OP.MERCHANT_WINDOW,
      encodeSidecar(SIDECAR_SCHEMA.MERCHANT_WINDOW, window),
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

    const previous = this.locationWrites.get(sessionId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() =>
        this.databases.backend("runtime").execute(
          `UPDATE character_positions
           SET zone_id = ?, instance_id = ?, x = ?, y = ?, z = ?, heading = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE character_id = ?`,
          [
            route.zoneId,
            route.instanceId,
            location.x,
            location.y,
            location.z,
            radiansToEqHeading(location.heading),
            owned.characterId,
          ],
        ),
      )
      .then(() => undefined);
    this.locationWrites.set(sessionId, next);
    const removeSettledWrite = () => {
      if (this.locationWrites.get(sessionId) === next) {
        this.locationWrites.delete(sessionId);
      }
    };
    void next.then(removeSettledWrite, removeSettledWrite);
    void next.catch((error: unknown) => {
      this.logger.warn("Player location persistence failed", {
        sessionId,
        characterId: owned.characterId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
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
  const restored = persisted?.npcArchetypeId === spawn.npcArchetypeId
    ? persisted
    : undefined;
  const isCorpse = restored?.lifecycle === "corpse";
  return {
    id: spawn.npcArchetypeId,
    spawnId: spawn.spawnId,
    name: isCorpse ? corpseName(spawn.name) : spawn.name,
    ...(isCorpse ? { kind: 3 } : {}),
    level: spawn.level,
    race: spawn.race,
    gender: spawn.gender,
    modelKey: spawn.modelKey,
    isNpc: true,
    size: spawn.size,
    face: spawn.face,
    helm: spawn.helm,
    equipChest: spawn.equipChest,
    equipment: {
      head: spawn.helm,
      chest: spawn.equipChest,
      primary: spawn.primary,
      secondary: spawn.secondary,
    },
    charClass: spawn.charClass,
    bodytype: spawn.bodyType,
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

interface ZoneRow extends DatabaseRow {
  id: number;
  key: string;
  name: string;
  safe_x: number;
  safe_y: number;
  safe_z: number;
}

interface CharacterProfileRow extends DatabaseRow {
  id: number;
  name: string;
  level: number;
  class_id: number;
  race_id: number;
  gender: number;
  deity_id: number;
  face: number;
  str: number;
  sta: number;
  dex: number;
  agi: number;
  intelligence: number;
  wis: number;
  cha: number;
  x: number | null;
  y: number | null;
  z: number | null;
  heading: number | null;
}

interface CharacterBindRow extends DatabaseRow {
  zone_id: number;
  instance_id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}
