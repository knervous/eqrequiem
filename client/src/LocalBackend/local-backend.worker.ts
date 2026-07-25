/// <reference lib="webworker" />

import { supportedZones } from "@game/Constants/supportedZones";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import contentDatabaseUrl from "../../../serverjs/data/content-db.sqlite.gz?url";
import {
  createOfflineGameBackend,
  GameBackendPacketAdapter,
  OFFLINE_SEED_VERSION,
} from "../../../serverjs/src/backend/index.ts";
import { BrowserSqliteOpfsBackend } from "../../../serverjs/src/db/browser/sqlite-opfs-backend.ts";
import type { LocalBackendMessage } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

const SESSION_ID = 1;
let adapterPromise: Promise<GameBackendPacketAdapter> | null = null;

self.addEventListener("message", (message: MessageEvent<LocalBackendMessage>) => {
  const request = message.data;
  if (request.type === "initialize") {
    adapterPromise ??= initialize(request.refreshContent);
    void adapterPromise.catch(reportError);
    return;
  }
  if (request.type === "close") {
    const close = adapterPromise
      ? adapterPromise.then((adapter) => adapter.close(SESSION_ID))
      : Promise.resolve();
    void close
      .catch(reportError)
      .finally(() => {
        post({ type: "closed" });
        self.close();
      });
    return;
  }
  if (request.type !== "packet" || !adapterPromise) return;
  void adapterPromise
    .then(async (adapter) => {
      const packets = await adapter.receive(SESSION_ID, request);
      for (const packet of packets) post({ type: "packet", ...packet });
    })
    .catch(reportError);
});

async function initialize(refreshContent: boolean): Promise<GameBackendPacketAdapter> {
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
  );
  await backend.initialize();
  const adapter = new GameBackendPacketAdapter(backend);
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
  if (message.type === "packet") self.postMessage(message, [message.payload.buffer]);
  else self.postMessage(message);
}

function reportError(error: unknown): void {
  post({ type: "error", message: error instanceof Error ? error.message : String(error) });
}
