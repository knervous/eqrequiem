import {
  decodePacket,
  encodeControlStreamFrame,
  encodePacket,
  type PacketEnvelope,
} from "../protocol/index.js";
import type {
  WorkerMessagePort,
  WorkerTransportMessage,
} from "./worker-protocol.js";

/** Browser-side connection with the same packet semantics as WebTransport. */
export class WorkerClientTransport {
  private readonly listeners = new Set<(packet: PacketEnvelope) => void>();

  constructor(
    private readonly port: WorkerMessagePort,
    readonly sessionId = 1,
  ) {}

  connect(): void {
    this.port.addEventListener("message", this.onMessage);
    this.port.start?.();
    this.port.postMessage({ type: "connect", sessionId: this.sessionId });
  }

  close(): void {
    this.port.postMessage({ type: "disconnect", sessionId: this.sessionId });
    this.port.removeEventListener("message", this.onMessage);
  }

  onPacket(listener: (packet: PacketEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sendDatagram(opcode: number, payload = new Uint8Array()): void {
    this.send("datagram", encodePacket(opcode, payload));
  }

  sendStream(opcode: number, payload = new Uint8Array()): void {
    this.send("control-stream", encodeControlStreamFrame(opcode, payload));
  }

  private readonly onMessage = (
    event: MessageEvent<WorkerTransportMessage>,
  ): void => {
    const message = event.data;
    if (message.type !== "packet" || message.direction !== "server-to-client")
      return;
    if (message.sessionId !== this.sessionId) return;
    const encoded =
      message.transport === "control-stream"
        ? message.packet.slice(4)
        : message.packet;
    const packet = decodePacket(encoded);
    if (packet) for (const listener of this.listeners) listener(packet);
  };

  private send(
    transport: "datagram" | "control-stream",
    packet: Uint8Array,
  ): void {
    this.port.postMessage({
      type: "packet",
      direction: "client-to-server",
      sessionId: this.sessionId,
      transport,
      packet,
    });
  }
}
