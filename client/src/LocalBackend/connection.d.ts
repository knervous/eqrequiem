import type { LocalBackendStorage } from "./protocol";
export interface LocalBackendInfo {
    storage: LocalBackendStorage;
    sqliteVersion: string;
    contentVersion: string;
}
export declare class LocalBackendConnection {
    private worker;
    private closePromise;
    private rejectConnect;
    private lifecycleGeneration;
    private packetHandler;
    connect(options?: {
        refreshContent?: boolean;
    }): Promise<LocalBackendInfo>;
    onPacket(handler: (opcode: number, payload: Uint8Array) => void): void;
    send(transport: "datagram" | "control-stream", opcode: number, payload: Uint8Array): void;
    close(): Promise<void>;
    private readonly onMessage;
}
export declare function refreshOfflineContent(): Promise<LocalBackendInfo>;
