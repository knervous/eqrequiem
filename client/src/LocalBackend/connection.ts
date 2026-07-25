import type { LocalBackendMessage, LocalBackendStorage } from "./protocol";

export interface LocalBackendInfo {
  storage: LocalBackendStorage;
  sqliteVersion: string;
  contentVersion: string;
}

let activeConnection: LocalBackendConnection | null = null;
let closeGate: Promise<void> = Promise.resolve();

export class LocalBackendConnection {
  private worker: Worker | null = null;
  private closePromise: Promise<void> | null = null;
  private rejectConnect: ((error: Error) => void) | null = null;
  private lifecycleGeneration = 0;
  private packetHandler:
    | ((opcode: number, payload: Uint8Array) => void)
    | null = null;

  async connect(options: { refreshContent?: boolean } = {}): Promise<LocalBackendInfo> {
    if (this.worker) throw new Error("Local backend is already connected");
    const generation = ++this.lifecycleGeneration;
    await closeGate;
    if (generation !== this.lifecycleGeneration) {
      throw new Error("Local backend connection was closed during startup");
    }
    if (activeConnection && activeConnection !== this) {
      throw new Error(
        "Local backend storage is already in use by another connection",
      );
    }
    activeConnection = this;

    let worker: Worker;
    try {
      worker = new Worker(
        new URL("./local-backend.worker.ts", import.meta.url),
        { type: "module" },
      );
    } catch (error) {
      if (activeConnection === this) activeConnection = null;
      throw error;
    }
    this.worker = worker;

    return new Promise<LocalBackendInfo>((resolve, reject) => {
      let settled = false;
      const onWorkerError = (event: ErrorEvent) => {
        fail(event.error ?? new Error(event.message));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onInitialMessage);
        worker.removeEventListener("error", onWorkerError);
        if (this.rejectConnect === fail) this.rejectConnect = null;
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        void this.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const onInitialMessage = (event: MessageEvent<LocalBackendMessage>) => {
        if (event.data.type === "ready") {
          if (settled) return;
          settled = true;
          cleanup();
          worker.addEventListener("message", this.onMessage);
          resolve({
            storage: event.data.storage,
            sqliteVersion: event.data.sqliteVersion,
            contentVersion: event.data.contentVersion,
          });
        } else if (event.data.type === "error") {
          fail(new Error(event.data.message));
        } else if (event.data.type === "closed") {
          fail(new Error("Local backend connection was closed during startup"));
        }
      };
      this.rejectConnect = fail;
      worker.addEventListener("message", onInitialMessage);
      worker.addEventListener("error", onWorkerError);
      try {
        worker.postMessage({
          type: "initialize",
          refreshContent: options.refreshContent === true,
        } satisfies LocalBackendMessage);
      } catch (error) {
        fail(error);
      }
    });
  }

  onPacket(handler: (opcode: number, payload: Uint8Array) => void): void {
    this.packetHandler = handler;
  }

  send(
    transport: "datagram" | "control-stream",
    opcode: number,
    payload: Uint8Array,
  ): void {
    if (!this.worker) throw new Error("Local backend is not connected");
    const copy = payload.slice();
    this.worker.postMessage(
      {
        type: "packet",
        transport,
        opcode,
        payload: copy,
      } satisfies LocalBackendMessage,
      [copy.buffer],
    );
  }

  close(): Promise<void> {
    this.lifecycleGeneration++;
    if (this.closePromise) return this.closePromise;
    const worker = this.worker;
    this.worker = null;
    this.packetHandler = null;
    if (!worker) {
      if (activeConnection === this) activeConnection = null;
      return Promise.resolve();
    }

    this.closePromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        worker.removeEventListener("message", onClosed);
        worker.removeEventListener("error", finish);
        worker.terminate();
        if (activeConnection === this) activeConnection = null;
        this.closePromise = null;
        resolve();
      };
      const onClosed = (event: MessageEvent<LocalBackendMessage>) => {
        if (event.data.type === "closed") finish();
      };
      const timeout = setTimeout(finish, 1_000);
      worker.addEventListener("message", onClosed);
      worker.addEventListener("error", finish, { once: true });
      try {
        worker.postMessage({ type: "close" } satisfies LocalBackendMessage);
      } catch {
        finish();
      }
    });
    closeGate = this.closePromise;
    const rejectConnect = this.rejectConnect;
    this.rejectConnect = null;
    rejectConnect?.(new Error("Local backend connection was closed"));
    return this.closePromise;
  }

  private readonly onMessage = (
    event: MessageEvent<LocalBackendMessage>,
  ): void => {
    if (event.data.type === "packet")
      this.packetHandler?.(event.data.opcode, event.data.payload);
    if (event.data.type === "error")
      console.error("[local-backend]", event.data.message);
  };
}

export async function refreshOfflineContent(): Promise<LocalBackendInfo> {
  const connection = new LocalBackendConnection();
  try {
    return await connection.connect({ refreshContent: true });
  } finally {
    await connection.close();
  }
}
