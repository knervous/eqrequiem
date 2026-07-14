import {
  decodePacket,
  encodeControlStreamFrame,
  encodePacket,
} from "../protocol/index.js";
import type {
  GamePacketRouter,
  GameTransportService,
} from "./game-transport.js";
import type {
  WorkerMessagePort,
  WorkerTransportMessage,
} from "./worker-protocol.js";

/** Server-side adapter used when the backend itself runs in a browser Worker. */
export class WorkerGatewayService implements GameTransportService {
  readonly kind = "worker" as const;

  constructor(
    private readonly port: WorkerMessagePort,
    private readonly router: GamePacketRouter,
  ) {}

  start(): Promise<void> {
    this.port.addEventListener("message", this.onMessage);
    this.port.start?.();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.port.removeEventListener("message", this.onMessage);
    return Promise.resolve();
  }

  sendDatagram(
    sessionId: number,
    opcode: number,
    payload = new Uint8Array(),
  ): Promise<void> {
    this.send(sessionId, "datagram", encodePacket(opcode, payload));
    return Promise.resolve();
  }

  sendStream(
    sessionId: number,
    opcode: number,
    payload = new Uint8Array(),
  ): Promise<void> {
    this.send(
      sessionId,
      "control-stream",
      encodeControlStreamFrame(opcode, payload),
    );
    return Promise.resolve();
  }

  private readonly onMessage = (
    event: MessageEvent<WorkerTransportMessage>,
  ): void => {
    const message = event.data;
    if (message.type === "connect") {
      this.router.onSessionConnected(message.sessionId, "worker-loopback");
      return;
    }
    if (message.type === "disconnect") {
      this.router.onSessionDisconnected(message.sessionId);
      return;
    }
    if (message.direction !== "client-to-server") return;

    const encoded =
      message.transport === "control-stream"
        ? message.packet.slice(4)
        : message.packet;
    const decoded = decodePacket(encoded);
    if (!decoded) return;
    const packet = {
      ...decoded,
      sessionId: message.sessionId,
      transport: message.transport,
    };
    const route = this.router.handleWorldPacket(packet);
    if (route.forwardToZone)
      this.router.handleZonePacket(packet, route.zoneId, route.instanceId, route.characterName);
  };

  private send(
    sessionId: number,
    transport: "datagram" | "control-stream",
    packet: Uint8Array,
  ): void {
    this.port.postMessage({
      type: "packet",
      direction: "server-to-client",
      sessionId,
      transport,
      packet,
    });
  }
}
