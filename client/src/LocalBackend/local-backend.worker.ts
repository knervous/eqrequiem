/// <reference lib="webworker" />

import { supportedZones } from "@game/Constants/supportedZones";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import contentDatabaseUrl from "../../../serverjs/data/content-db.sqlite.gz?url";
import zoneSimulationWasmUrl from "../../../serverjs/src/zone/wasm/zone-simulation.release.wasm?url";
import qeynos2NavMeshUrl from "../../../server/maps/qeynos2.bin?url";
import {
  createOfflineGameBackend,
  GameBackendPacketAdapter,
  OFFLINE_SEED_VERSION,
} from "../../../serverjs/src/backend/index.ts";
import { BrowserSqliteOpfsBackend } from "../../../serverjs/src/db/browser/sqlite-opfs-backend.ts";
import { ZoneSimulationKernel } from "../../../serverjs/src/zone/zone-kernel.ts";
import { BrowserNavService } from "../../../serverjs/src/nav/browser-nav-service.js";
import type { LocalBackendMessage } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const SESSION_ID = 1;
let adapterPromise: Promise<GameBackendPacketAdapter> | null = null;
let packetQueue: Promise<void> = Promise.resolve();

self.addEventListener(
  "message",
  (message: MessageEvent<LocalBackendMessage>) => {
    const request = message.data;
    if (request.type === "initialize") {
      adapterPromise ??= initialize(request.refreshContent);
      void adapterPromise.catch(reportError);
      return;
    }
    if (request.type === "close") {
      const close = packetQueue.then(() =>
        adapterPromise
          ? adapterPromise.then((adapter) => adapter.close(SESSION_ID))
          : Promise.resolve(),
      );
      void close.catch(reportError).finally(() => {
        post({ type: "closed" });
        self.close();
      });
      return;
    }
    if (request.type !== "packet" || !adapterPromise) return;
    packetQueue = packetQueue.catch(reportError).then(async () => {
      const adapter = await adapterPromise!;
      const packets = await adapter.receive(SESSION_ID, request);
      for (const packet of packets) post({ type: "packet", ...packet });
    });
    void packetQueue.catch(reportError);
  },
);

async function initialize(
  refreshContent: boolean,
): Promise<GameBackendPacketAdapter> {
  const database = await BrowserSqliteOpfsBackend.open(
    "/eqrequiem-runtime.sqlite3",
    sqliteWasmUrl,
    {
      filename: "/eqrequiem-content.sqlite3",
      url: contentDatabaseUrl,
      version: OFFLINE_SEED_VERSION,
      compressed: "gzip",
      force: refreshContent,
    },
  );
  const backend = createOfflineGameBackend(
    database,
    supportedZones,
    "file:/eqrequiem-content.sqlite3?vfs=eqrequiem-opfs",
    {
      devDiagnostics: import.meta.env.DEV,
      findPath: (() => {
        const navigation = new BrowserNavService({
          qeynos2: qeynos2NavMeshUrl,
        });
        return (request) => navigation.findPath(request);
      })(),
      createZoneKernel: async () => {
        const response = await fetch(zoneSimulationWasmUrl);
        if (!response.ok) {
          throw new Error(
            `Unable to fetch offline movement kernel (${response.status} ${response.statusText})`,
          );
        }
        return ZoneSimulationKernel.instantiate(await response.arrayBuffer());
      },
    },
  );
  await backend.initialize();
  const adapter = new GameBackendPacketAdapter(backend);
  adapter.onPacket((sessionIds, packet) => {
    if (sessionIds.includes(SESSION_ID)) {
      post({ type: "packet", ...packet });
    }
  });
  for (const packet of await adapter.connect(SESSION_ID)) {
    post({ type: "packet", ...packet });
  }
  post({
    type: "ready",
    storage: database.storage,
    sqliteVersion: database.sqliteVersion,
    contentVersion: OFFLINE_SEED_VERSION,
  });
  return adapter;
}

function post(message: LocalBackendMessage): void {
  if (message.type === "packet")
    self.postMessage(message, [message.payload.buffer]);
  else self.postMessage(message);
}

function reportError(error: unknown): void {
  post({
    type: "error",
    message: error instanceof Error ? error.message : String(error),
  });
}
