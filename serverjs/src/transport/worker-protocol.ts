import type { InboundTransport } from "../protocol/index.js";

export type WorkerTransportMessage =
  | { type: "connect"; sessionId: number }
  | { type: "disconnect"; sessionId: number }
  | {
      type: "packet";
      direction: "client-to-server" | "server-to-client";
      sessionId: number;
      transport: InboundTransport;
      packet: Uint8Array;
    };

export interface WorkerMessagePort {
  postMessage(message: WorkerTransportMessage): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerTransportMessage>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerTransportMessage>) => void,
  ): void;
  start?(): void;
}
