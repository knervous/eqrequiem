export type LocalBackendStorage = "opfs" | "memory";

export type LocalBackendMessage =
  | { type: "initialize"; refreshContent: boolean }
  | { type: "ready"; storage: LocalBackendStorage; sqliteVersion: string; contentVersion: string }
  | { type: "error"; message: string }
  | {
      type: "packet";
      transport: "datagram" | "control-stream";
      opcode: number;
      payload: Uint8Array;
    };
