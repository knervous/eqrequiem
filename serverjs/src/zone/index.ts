import type { AppEnv } from "../config/env.js";
import type { DatabaseRow } from "../db/backend.js";
import type { DbService } from "../db/index.js";
import {
  decodeDeleteItemRequest,
  decodeMoveItemRequest,
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
import type { PersistService } from "../persist/index.js";
import { GameDataRepository } from "../persist/game-data-repository.js";
import type { Logger } from "../shared/logger.js";
import type { GameMessenger } from "../transport/game-transport.js";
import { ZoneDispatcher } from "./dispatcher.js";
import type { ZoneNpcSpawnDefinition } from "./zone-content.js";
import { QuestCatalog } from "./quest-catalog.js";
import { ZoneWorkerPool } from "./worker-pool.js";
import type { ZoneShardStatus } from "./worker-pool.js";

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

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
    private readonly persist: PersistService,
    private readonly databases: DbService,
  ) {
    this.dispatcher = new ZoneDispatcher(logger);
    this.workerPool = new ZoneWorkerPool(
      env.zone.tickRateHz,
      env.zone.workBudgetMs,
      logger,
      (_zoneId, _instanceId, sessionIds, payload) => {
        for (const sessionId of sessionIds) {
          void this.messenger
            ?.sendDatagram(sessionId, OP.RENDER_SNAPSHOT, payload)
            .catch((error: unknown) => {
              this.logger.warn("Render snapshot send failed", {
                sessionId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
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
          void this.messenger
            ?.sendStream(sessionId, OP.CHANNEL_MESSAGE, payload)
            .catch((error: unknown) => {
              this.logger.warn("Quest speech send failed", {
                sessionId,
                sender,
                error: error instanceof Error ? error.message : String(error),
              });
            });
        }
      },
      (zoneId, instanceId, sessionId, enteredSpawnIds, exitedSpawnIds) => {
        void this.sendAoiChanges(
          zoneId,
          instanceId,
          sessionId,
          enteredSpawnIds,
          exitedSpawnIds,
        );
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
      void this.attachSession(
        packet.sessionId,
        zoneId,
        instanceId,
        characterName ?? "Player",
      ).catch((error: unknown) =>
        this.logger.warn("Zone session attach failed", {
          sessionId: packet.sessionId,
          zoneId,
          instanceId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
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
    this.sessionRoutes.delete(sessionId);
  }

  async start(): Promise<void> {
    await this.questCatalog.start();
    this.logger.info("Zone service started", {
      tickRateHz: this.env.zone.tickRateHz,
      workBudgetMs: this.env.zone.workBudgetMs,
    });
  }

  async stop(): Promise<void> {
    this.questCatalog.stop();
    await this.workerPool.stopAll();
    this.logger.info("Zone service stopped", this.dispatcher.metrics());
  }

  listShards(): ZoneShardStatus[] {
    return this.workerPool.listShards();
  }

  startShard(zoneId: number, instanceId = 0): ZoneShardStatus {
    return this.workerPool.ensureShard(zoneId, instanceId);
  }

  stopShard(zoneId: number, instanceId = 0): Promise<boolean> {
    this.shardSpawns.delete(shardKey(zoneId, instanceId));
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
    }
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
        p.x, p.y, p.z, p.heading
       FROM characters c LEFT JOIN character_positions p ON p.character_id = c.id
       WHERE lower(c.name) = lower(?) LIMIT 1`,
        [characterName],
      )
    ).rows[0];
    const gameData = new GameDataRepository(content, runtime);
    const x = Number(character?.x ?? zone.safe_x);
    const y = Number(character?.y ?? zone.safe_y);
    const z = Number(character?.z ?? zone.safe_z);
    const heading = Number(character?.heading ?? 0);
    const spawnRows = await gameData.zoneNpcSpawns(zoneId, instanceId);
    this.shardSpawns.set(
      shardKey(zoneId, instanceId),
      new Map(spawnRows.map((spawn) => [spawn.spawnId, spawn])),
    );
    this.sessionRoutes.set(sessionId, { zoneId, instanceId });
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "zone_hydrate",
      npcs: spawnRows,
    });
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "quest_hydrate",
      npcs: spawnRows.map((spawn, npcIndex) => ({
        kind: "npc",
        id: spawn.spawnId,
        npcId: spawn.npcArchetypeId,
        npcIndex,
        name: spawn.name,
        level: spawn.level,
        position: {
          x: spawn.x,
          y: spawn.y,
          z: spawn.z,
          heading: spawn.heading,
        },
      })),
    });
    this.workerPool.enqueue(zoneId, instanceId, {
      type: "client_join",
      sessionId,
      x,
      y,
      z,
      heading,
      characterName: character?.name ?? characterName,
    });
    if (!this.messenger) throw new Error("zone messenger is not attached");
    await this.messenger.sendStream(
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
    await this.messenger.sendStream(
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
        inventoryItems: character
          ? await gameData.inventoryItems(Number(character.id))
          : [],
      }),
    );
    await this.messenger.sendStream(
      sessionId,
      OP.BATCH_ZONE_SPAWNS,
      encodeWorldSpawnBatch(
        spawnRows
          .filter((spawn) => withinAoi(spawn, { x, y, z }))
          .map(toClientSpawn),
      ),
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
    for (const spawnId of exitedSpawnIds) {
      await this.messenger.sendStream(
        sessionId,
        OP.DELETE_SPAWN,
        encodeDeleteSpawn({ spawnId }),
      );
    }
    for (const spawnId of enteredSpawnIds) {
      const spawn = spawns?.get(spawnId);
      if (!spawn) continue;
      await this.messenger.sendStream(
        sessionId,
        OP.ZONE_SPAWNS,
        encodeWorldSpawnBatch([toClientSpawn(spawn)]),
      );
    }
  }
}

function toClientSpawn(spawn: ZoneNpcSpawnDefinition): WorldSpawnInput & { isNpc: true } {
  return {
    id: spawn.npcArchetypeId,
    spawnId: spawn.spawnId,
    name: spawn.name,
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
      primary: 0,
      secondary: 0,
    },
    charClass: spawn.charClass,
    bodytype: spawn.bodyType,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    heading: spawn.heading,
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
  x: number | null;
  y: number | null;
  z: number | null;
  heading: number | null;
}
