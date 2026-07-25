import { OpCodes } from "@game/Net/opcodes";
import type { NetMessageCodec } from "@game/Net/messages";
export declare class EqSocket {
    private localBackend;
    private connectingLocalBackend;
    private localConnectPromise;
    private webtransport;
    private datagramWriter;
    private controlWriter;
    private writeQueue;
    private opCodeHandlers;
    isConnected: boolean;
    private onClose;
    private url;
    private port;
    private sessionId;
    private allowReconnect;
    private maxRetries;
    private retryCount;
    private reconnectTimer;
    constructor(config?: {
        maxRetries?: number;
        allowReconnect?: boolean;
    });
    setSessionId(id: number): void;
    connect(url: string, port: number | string, onClose: () => void): Promise<boolean>;
    /** Fire-and-forget datagram */
    sendMessage<T>(opCode: number, codec: NetMessageCodec<T> | null, data: Partial<T> | null): Promise<void>;
    /** Reliable, ordered “stream” message */
    sendStreamMessage<T>(opCode: number, codec: NetMessageCodec<T>, data: Partial<T>): Promise<void>;
    registerOpCodeHandler<T>(opCode: OpCodes, codec: NetMessageCodec<T>, handler: (msg: T) => void | Promise<void>): void;
    registerRawOpCodeHandler(opCode: OpCodes, handler: (payload: Uint8Array) => void): void;
    close(scheduleReconnect?: boolean): void;
    private connectLocalBackend;
    private sendDatagram;
    private startDatagramLoop;
    private startControlReadLoop;
    private scheduleReconnect;
    private clearReconnectTimer;
}
