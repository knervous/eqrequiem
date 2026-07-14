import type { LocalBackendMessage, LocalBackendStorage } from "./protocol";

export interface LocalBackendInfo {
  storage: LocalBackendStorage;
  sqliteVersion: string;
  contentVersion: string;
}

export class LocalBackendConnection {
  private worker: Worker | null = null;
  private packetHandler:
    | ((opcode: number, payload: Uint8Array) => void)
    | null = null;

  async connect(options: { refreshContent?: boolean } = {}): Promise<LocalBackendInfo> {
    if (this.worker) throw new Error("Local backend is already connected");
    const worker = new Worker(
      new URL("./local-backend.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker = worker;

    return new Promise<LocalBackendInfo>((resolve, reject) => {
      const onInitialMessage = (event: MessageEvent<LocalBackendMessage>) => {
        if (event.data.type === "ready") {
          worker.removeEventListener("message", onInitialMessage);
          worker.addEventListener("message", this.onMessage);
          resolve({
            storage: event.data.storage,
            sqliteVersion: event.data.sqliteVersion,
            contentVersion: event.data.contentVersion,
          });
        } else if (event.data.type === "error") {
          worker.removeEventListener("message", onInitialMessage);
          this.close();
          reject(new Error(event.data.message));
        }
      };
      worker.addEventListener("message", onInitialMessage);
      worker.postMessage({
        type: "initialize",
        refreshContent: options.refreshContent === true,
      } satisfies LocalBackendMessage);
      worker.addEventListener(
        "error",
        (event) => reject(event.error ?? new Error(event.message)),
        { once: true },
      );
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

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.packetHandler = null;
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
    connection.close();
  }
}
