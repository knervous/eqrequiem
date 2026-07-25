import { type RenderSnapshotNetBatchView } from "./generated/net-structs.js";
export declare const WORLD_STATE_FLAGS: Readonly<{
    DELTA: 0;
    FULL: number;
    HAS_SIDECAR: number;
}>;
export interface WorldStatePacketView {
    readonly revision: number;
    readonly flags: number;
    readonly full: boolean;
    readonly state: RenderSnapshotNetBatchView;
    /** UTF-8 string table. Offsets in the public SoA are relative to this view. */
    readonly sidecar: Uint8Array;
}
export interface WritableWorldStatePacket extends WorldStatePacketView {
    readonly bytes: Uint8Array;
}
export declare function createWorldStatePacket(count: number, sidecar?: Uint8Array, flags?: number, revision?: number): WritableWorldStatePacket;
export interface WorldSpawnInput {
    readonly id?: number;
    readonly spawnId: number;
    readonly kind?: number;
    readonly isNpc?: boolean;
    readonly name?: string;
    readonly level?: number;
    readonly race?: number;
    readonly gender?: number;
    readonly modelKey?: string | null;
    readonly size?: number;
    readonly face?: number;
    readonly helm?: number;
    readonly equipChest?: number;
    readonly charClass?: number;
    readonly bodytype?: number;
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
    readonly heading?: number;
    readonly equipment?: {
        readonly head?: number;
        readonly chest?: number;
        readonly primary?: number;
        readonly secondary?: number;
    };
}
export declare function encodeWorldStatePacket(state: RenderSnapshotNetBatchView, sidecar?: Uint8Array, flags?: number, revision?: number): Uint8Array;
export declare function viewWorldStatePacket(bytes: Uint8Array): WorldStatePacketView | null;
export declare function encodeWorldSpawnBatch(spawns: readonly WorldSpawnInput[], revision?: number): Uint8Array;
export declare function readWorldStateString(sidecar: Uint8Array, offset: number, length: number): string;
export declare function readWorldSpawn(state: RenderSnapshotNetBatchView, sidecar: Uint8Array, index: number): WorldSpawnInput & {
    readonly isNpc: boolean;
};
