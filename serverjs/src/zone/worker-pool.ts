import { Worker } from "node:worker_threads";

import type { Logger } from "../shared/logger.js";
import type {
  ZoneWorkerInboundMessage,
  ZoneWorkerOutboundMessage,
} from "./worker-types.js";
import type { QuestDefinition } from "./quest-types.js";

interface ZoneWorkerHandle {
  worker: Worker;
  zoneId: number;
  instanceId: number;
  startedAt: number;
  lastMetricsAt: number;
  tick: number;
  queueDepth: number;
  npcCount: number;
  sessionCount: number;
  questRevision: number;
  questCount: number;
}

export interface ZoneShardStatus {
  zoneId: number;
  instanceId: number;
  startedAt: string;
  lastMetricsAt: string | null;
  tick: number;
  queueDepth: number;
  npcCount: number;
  sessionCount: number;
  questRevision: number;
  questCount: number;
}

export class ZoneWorkerPool {
  private readonly workers = new Map<string, ZoneWorkerHandle>();
  private questDefinitions: QuestDefinition[] = [];
  private questRevision = 0;

  constructor(
    private readonly tickRateHz: number,
    private readonly workBudgetMs: number,
    private readonly logger: Logger,
    private readonly onSnapshot?: (
      zoneId: number,
      instanceId: number,
      sessionIds: readonly number[],
      payload: Uint8Array,
    ) => void,
    private readonly onQuestSay?: (
      sessionIds: readonly number[],
      sender: string,
      target: string,
      message: string,
    ) => void,
    private readonly onAoiChange?: (
      zoneId: number,
      instanceId: number,
      sessionId: number,
      enteredSpawnIds: readonly number[],
      exitedSpawnIds: readonly number[],
    ) => void,
  ) {}

  enqueue(
    zoneId: number,
    instanceId: number,
    message: ZoneWorkerInboundMessage,
  ): void {
    const handle = this.getOrCreate(zoneId, instanceId);
    handle.worker.postMessage(message);
  }

  ensureShard(zoneId: number, instanceId = 0): ZoneShardStatus {
    return statusOf(this.getOrCreate(zoneId, instanceId));
  }

  listShards(): ZoneShardStatus[] {
    return [...this.workers.values()]
      .map(statusOf)
      .sort((a, b) => a.zoneId - b.zoneId || a.instanceId - b.instanceId);
  }

  async stopShard(zoneId: number, instanceId = 0): Promise<boolean> {
    const key = shardKey(zoneId, instanceId);
    const handle = this.workers.get(key);
    if (!handle) return false;
    this.workers.delete(key);
    handle.worker.postMessage({ type: "shutdown" } satisfies ZoneWorkerInboundMessage);
    await handle.worker.terminate();
    return true;
  }

  updateQuests(definitions: readonly QuestDefinition[], revision: number): void {
    this.questDefinitions = [...definitions];
    this.questRevision = revision;
    for (const handle of this.workers.values()) {
      handle.worker.postMessage({
        type: "quest_update",
        definitions: this.questDefinitions,
        revision,
      } satisfies ZoneWorkerInboundMessage);
    }
  }

  async stopAll(): Promise<void> {
    const terminations: Promise<number>[] = [];

    for (const [key, handle] of this.workers.entries()) {
      handle.worker.postMessage({
        type: "shutdown",
      } satisfies ZoneWorkerInboundMessage);
      terminations.push(handle.worker.terminate());
      this.workers.delete(key);
    }

    await Promise.all(terminations);
  }

  private getOrCreate(zoneId: number, instanceId: number): ZoneWorkerHandle {
    const key = shardKey(zoneId, instanceId);
    const existing = this.workers.get(key);
    if (existing) {
      return existing;
    }

    const worker = new Worker(new URL("./zone-worker.js", import.meta.url), {
      workerData: {
        zoneId,
        instanceId,
        tickRateHz: this.tickRateHz,
        workBudgetMs: this.workBudgetMs,
        questDefinitions: this.questDefinitions,
        questRevision: this.questRevision,
      },
    });

    worker.on("message", (message: ZoneWorkerOutboundMessage) => {
      if (message.type === "metrics") {
        handle.lastMetricsAt = Date.now();
        handle.tick = message.tick;
        handle.queueDepth = message.queueDepth;
        handle.npcCount = message.npcCount;
        handle.sessionCount = message.sessionCount;
        handle.questRevision = message.questRevision;
        handle.questCount = message.questCount;
        this.logger.debug("Zone worker metrics", {
          zoneId: message.zoneId,
          instanceId: message.instanceId,
          queueDepth: message.queueDepth,
          processedThisTick: message.processedThisTick,
        });
        return;
      }
      if (message.type === "snapshot") {
        this.onSnapshot?.(
          message.zoneId,
          message.instanceId,
          message.sessionIds,
          message.payload,
        );
        return;
      }
      if (message.type === "quest_say") {
        this.onQuestSay?.(
          message.sessionIds,
          message.sender,
          message.target,
          message.message,
        );
        return;
      }
      if (message.type === "aoi_change") {
        this.onAoiChange?.(
          message.zoneId,
          message.instanceId,
          message.sessionId,
          message.enteredSpawnIds,
          message.exitedSpawnIds,
        );
        return;
      }
      switch (message.level) {
        case "debug":
          this.logger.debug(message.message, message.meta);
          break;
        case "info":
          this.logger.info(message.message, message.meta);
          break;
        case "warn":
          this.logger.warn(message.message, message.meta);
          break;
        case "error":
          this.logger.error(message.message, message.meta);
          break;
      }
    });

    worker.on("error", (error: unknown) => {
      this.logger.error("Zone worker crashed", {
        zoneId,
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.workers.get(key)?.worker === worker) this.workers.delete(key);
    });

    worker.on("exit", (code) => {
      this.logger.info("Zone worker exited", { zoneId, instanceId, code });
      if (this.workers.get(key)?.worker === worker) this.workers.delete(key);
    });

    const handle: ZoneWorkerHandle = {
      worker,
      zoneId,
      instanceId,
      startedAt: Date.now(),
      lastMetricsAt: 0,
      tick: 0,
      queueDepth: 0,
      npcCount: 0,
      sessionCount: 0,
      questRevision: this.questRevision,
      questCount: 0,
    };
    this.workers.set(key, handle);
    this.logger.info("Zone worker started", { zoneId, instanceId });
    return handle;
  }
}

function shardKey(zoneId: number, instanceId: number): string {
  return `${zoneId}:${instanceId}`;
}

function statusOf(handle: ZoneWorkerHandle): ZoneShardStatus {
  return {
    zoneId: handle.zoneId,
    instanceId: handle.instanceId,
    startedAt: new Date(handle.startedAt).toISOString(),
    lastMetricsAt: handle.lastMetricsAt > 0 ? new Date(handle.lastMetricsAt).toISOString() : null,
    tick: handle.tick,
    queueDepth: handle.queueDepth,
    npcCount: handle.npcCount,
    sessionCount: handle.sessionCount,
    questRevision: handle.questRevision,
    questCount: handle.questCount,
  };
}
