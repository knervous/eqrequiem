import type { BackendEvent, BackendRequest, BackendTransport, GameBackend } from "./contracts.js";
export interface BackendInboundPacket {
    opcode: number;
    payload: Uint8Array;
    transport: BackendTransport;
}
export interface BackendOutboundPacket {
    opcode: number;
    payload: Uint8Array;
    transport: BackendTransport;
}
/** The single packet-to-domain adapter used by Worker and network transports. */
export declare class GameBackendPacketAdapter {
    private readonly backend;
    constructor(backend: GameBackend);
    connect(sessionId: number): Promise<BackendOutboundPacket[]>;
    disconnect(sessionId: number): Promise<void>;
    close(sessionId: number): Promise<void>;
    receive(sessionId: number, packet: BackendInboundPacket): Promise<BackendOutboundPacket[]>;
    private encodeEvents;
}
export declare function decodeRequest(opcode: number, payload: Uint8Array): BackendRequest | null;
export declare function encodeEvent(event: BackendEvent): BackendOutboundPacket;
