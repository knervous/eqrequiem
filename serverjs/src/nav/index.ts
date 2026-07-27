import { Worker } from "node:worker_threads";
import { resolve } from "node:path";

import type { AppEnv } from "../config/env.js";
import type { Logger } from "../shared/logger.js";
import type {
  NavPathRequest,
  NavPathResult,
  NavWorkerInboundMessage,
  NavWorkerOutboundMessage,
} from "./types.js";

interface PendingPath {
  readonly resolve: (value: NavPathResult) => void;
  readonly reject: (reason: Error) => void;
  readonly timeout: NodeJS.Timeout;
}

interface NavWorkerHandle {
  readonly zoneKey: string;
  readonly worker: Worker;
  readonly ready: Promise<void>;
  readonly resolveReady: () => void;
  readonly rejectReady: (reason: Error) => void;
  readonly pending: Map<number, PendingPath>;
  tileCount: number;
  layoutHash: string;
}

export interface NavZoneStatus {
  readonly zoneKey: string;
  readonly tileCount: number;
  readonly pendingQueries: number;
  readonly layoutHash: string;
}

export class NavService {
  private readonly workers = new Map<string, NavWorkerHandle>();
  private nextRequestId = 1;
  private stopped = true;

  constructor(
    private readonly env: AppEnv,
    private readonly logger: Logger,
  ) {}

  start(): Promise<void> {
    this.stopped = false;
    this.logger.info("Navigation service started", {
      enabled: this.env.features.navWorker,
      meshDir: this.env.nav.meshDir,
    });
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const terminations: Promise<number>[] = [];
    for (const handle of this.workers.values()) {
      const error = new Error(`Navigation worker for ${handle.zoneKey} stopped`);
      handle.rejectReady(error);
      rejectPending(handle, error);
      terminations.push(handle.worker.terminate());
    }
    this.workers.clear();
    await Promise.all(terminations);
    this.logger.info("Navigation service stopped");
  }

  async findPath(request: NavPathRequest): Promise<NavPathResult> {
    if (this.stopped) throw new Error("Navigation service is not running");
    if (!this.env.features.navWorker) throw new Error("Navigation workers are disabled");
    validatePoint(request.start);
    validatePoint(request.end);
    const handle = this.getOrCreate(request.zoneKey);
    await handle.ready;

    const requestId = this.allocateRequestId();
    return new Promise<NavPathResult>((resolvePath, rejectPath) => {
      const timeout = setTimeout(() => {
        handle.pending.delete(requestId);
        rejectPath(new Error(`Navigation query ${requestId} timed out`));
      }, this.env.nav.queryTimeoutMs);
      handle.pending.set(requestId, {
        resolve: resolvePath,
        reject: rejectPath,
        timeout,
      });
      handle.worker.postMessage({
        type: "find_path",
        requestId,
        zoneId: request.zoneId,
        instanceId: request.instanceId,
        start: request.start,
        end: request.end,
      } satisfies NavWorkerInboundMessage);
    });
  }

  listZones(): NavZoneStatus[] {
    return [...this.workers.values()]
      .map((handle) => ({
        zoneKey: handle.zoneKey,
        tileCount: handle.tileCount,
        pendingQueries: handle.pending.size,
        layoutHash: handle.layoutHash,
      }))
      .sort((a, b) => a.zoneKey.localeCompare(b.zoneKey));
  }

  private getOrCreate(inputZoneKey: string): NavWorkerHandle {
    const zoneKey = normalizeZoneKey(inputZoneKey);
    const existing = this.workers.get(zoneKey);
    if (existing) return existing;

    let resolveReady!: () => void;
    let rejectReady!: (reason: Error) => void;
    const ready = new Promise<void>((resolvePromise, rejectPromise) => {
      resolveReady = resolvePromise;
      rejectReady = rejectPromise;
    });
    const workerEntry = import.meta.url.endsWith(".ts")
      ? new URL("./nav-worker.ts", import.meta.url)
      : new URL("./nav-worker.js", import.meta.url);
    const worker = new Worker(workerEntry, {
      workerData: {
        meshPath: resolve(this.env.nav.meshDir, `${zoneKey}.bin`),
        spatialPath: resolve(
          this.env.nav.worldPackageDir,
          `${zoneKey}.spatial.json.gz`,
        ),
        zoneKey,
        maxNodes: this.env.nav.maxNodes,
      },
    });
    const handle: NavWorkerHandle = {
      zoneKey,
      worker,
      ready,
      resolveReady,
      rejectReady,
      pending: new Map(),
      tileCount: 0,
      layoutHash: "",
    };
    this.workers.set(zoneKey, handle);

    worker.on("message", (message: NavWorkerOutboundMessage) => {
      if (message.type === "ready") {
        handle.tileCount = message.tileCount;
        handle.layoutHash = message.layoutHash;
        handle.resolveReady();
        this.logger.info("Navigation mesh loaded", {
          zoneKey,
          tileCount: message.tileCount,
          layoutHash: message.layoutHash,
        });
        return;
      }
      if (message.type === "path") {
        const pending = handle.pending.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        handle.pending.delete(message.requestId);
        pending.resolve({
          zoneId: message.zoneId,
          instanceId: message.instanceId,
          path: message.path,
        });
        return;
      }
      const error = new Error(message.message);
      if (message.requestId !== undefined) {
        const pending = handle.pending.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timeout);
        handle.pending.delete(message.requestId);
        pending.reject(error);
      } else {
        handle.rejectReady(error);
        rejectPending(handle, error);
      }
    });
    worker.on("error", (cause: Error) => {
      const error = new Error(`Navigation worker for ${zoneKey} crashed`, { cause });
      handle.rejectReady(error);
      rejectPending(handle, error);
      if (this.workers.get(zoneKey) === handle) this.workers.delete(zoneKey);
      this.logger.error(error.message, { cause: cause.message });
    });
    worker.on("exit", (code) => {
      if (this.workers.get(zoneKey) === handle) this.workers.delete(zoneKey);
      if (code === 0 || this.stopped) return;
      const error = new Error(`Navigation worker for ${zoneKey} exited with code ${code}`);
      handle.rejectReady(error);
      rejectPending(handle, error);
      this.logger.error(error.message);
    });
    return handle;
  }

  private allocateRequestId(): number {
    const requestId = this.nextRequestId;
    this.nextRequestId = requestId === 0xffff_ffff ? 1 : requestId + 1;
    return requestId;
  }
}

function normalizeZoneKey(value: string): string {
  const zoneKey = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(zoneKey)) {
    throw new Error("Zone key contains invalid navigation path characters");
  }
  return zoneKey;
}

function validatePoint(point: { readonly x: number; readonly y: number; readonly z: number }): void {
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new Error("Navigation point contains a non-finite coordinate");
  }
}

function rejectPending(handle: NavWorkerHandle, error: Error): void {
  for (const pending of handle.pending.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  handle.pending.clear();
}

export type {
  NavPathRequest,
  NavPathResult,
  NavPoint,
} from "./types.js";
