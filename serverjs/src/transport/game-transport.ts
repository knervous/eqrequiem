import type { InboundPacket } from "../protocol/index.js";

export interface GameMessenger {
  sendDatagram(
    sessionId: number,
    opcode: number,
    payload?: Uint8Array,
  ): Promise<void>;
  sendStream(
    sessionId: number,
    opcode: number,
    payload?: Uint8Array,
  ): Promise<void>;
}

export interface GamePacketRouter {
  onSessionConnected(sessionId: number, address: string): void;
  onSessionDisconnected(sessionId: number): void;
  handleWorldPacket(packet: InboundPacket): {
    forwardToZone: boolean;
    zoneId: number;
    instanceId: number;
    characterName?: string | null;
  };
  handleZonePacket(
    packet: InboundPacket,
    zoneId: number,
    instanceId: number,
    characterName?: string | null,
  ): void;
}

export interface GameTransportService extends GameMessenger {
  readonly kind: "webtransport" | "worker";
  start(): Promise<void>;
  stop(): Promise<void>;
}
