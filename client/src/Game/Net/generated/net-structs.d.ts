export declare const NET_HEADER_BYTES = 32;
export declare const NET_MAGIC = 1414419272;
export declare const NET_CODEC_VERSION = 1;
export interface ZoneSessionNet {
    zoneId: number;
    instanceId: number;
}
export declare class ZoneSessionNetView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 8;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get zoneId(): number;
    set zoneId(value: number);
    get instanceId(): number;
    set instanceId(value: number);
}
export declare function writeZoneSessionNet(target: ZoneSessionNetView, value: Readonly<ZoneSessionNet>): void;
export declare function readZoneSessionNet(source: ZoneSessionNetView): ZoneSessionNet;
export interface MoveItemNet {
    fromSlot: number;
    toSlot: number;
    fromBag: number;
    toBag: number;
}
export declare class MoveItemNetView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 16;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get fromSlot(): number;
    set fromSlot(value: number);
    get toSlot(): number;
    set toSlot(value: number);
    get fromBag(): number;
    set fromBag(value: number);
    get toBag(): number;
    set toBag(value: number);
}
export declare function writeMoveItemNet(target: MoveItemNetView, value: Readonly<MoveItemNet>): void;
export declare function readMoveItemNet(source: MoveItemNetView): MoveItemNet;
export interface DeleteItemNet {
    slot: number;
    bag: number;
}
export declare class DeleteItemNetView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 8;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get slot(): number;
    set slot(value: number);
    get bag(): number;
    set bag(value: number);
}
export declare function writeDeleteItemNet(target: DeleteItemNetView, value: Readonly<DeleteItemNet>): void;
export declare function readDeleteItemNet(source: DeleteItemNetView): DeleteItemNet;
export interface IntValueNet {
    value: number;
}
export declare class IntValueNetView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 4;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get value(): number;
    set value(value: number);
}
export declare function writeIntValueNet(target: IntValueNetView, value: Readonly<IntValueNet>): void;
export declare function readIntValueNet(source: IntValueNetView): IntValueNet;
export interface WorldEntityStateNet {
    kind: number;
    position: readonly number[];
    orientation: readonly number[];
    velocity: readonly number[];
    animation: number;
    movementState: number;
    appearance: number;
    nameOffset: number;
    nameLength: number;
    archetypeId: number;
    level: number;
    race: number;
    gender: number;
    classId: number;
    bodyType: number;
    size: number;
    face: number;
    helm: number;
    chest: number;
    primary: number;
    secondary: number;
    modelKeyOffset: number;
    modelKeyLength: number;
    heading: number;
    serverFlags: number;
    combatTimer: number;
    aggroTarget: number;
}
export declare class WorldEntityStateNetView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 112;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get kind(): number;
    set kind(value: number);
    get position(): Float32Array;
    get orientation(): Float32Array;
    get velocity(): Float32Array;
    get animation(): number;
    set animation(value: number);
    get movementState(): number;
    set movementState(value: number);
    get appearance(): number;
    set appearance(value: number);
    get nameOffset(): number;
    set nameOffset(value: number);
    get nameLength(): number;
    set nameLength(value: number);
    get archetypeId(): number;
    set archetypeId(value: number);
    get level(): number;
    set level(value: number);
    get race(): number;
    set race(value: number);
    get gender(): number;
    set gender(value: number);
    get classId(): number;
    set classId(value: number);
    get bodyType(): number;
    set bodyType(value: number);
    get size(): number;
    set size(value: number);
    get face(): number;
    set face(value: number);
    get helm(): number;
    set helm(value: number);
    get chest(): number;
    set chest(value: number);
    get primary(): number;
    set primary(value: number);
    get secondary(): number;
    set secondary(value: number);
    get modelKeyOffset(): number;
    set modelKeyOffset(value: number);
    get modelKeyLength(): number;
    set modelKeyLength(value: number);
    get heading(): number;
    set heading(value: number);
    get serverFlags(): number;
    set serverFlags(value: number);
    get combatTimer(): number;
    set combatTimer(value: number);
    get aggroTarget(): number;
    set aggroTarget(value: number);
}
export declare function writeWorldEntityStateNet(target: WorldEntityStateNetView, value: Readonly<WorldEntityStateNet>): void;
export declare function readWorldEntityStateNet(source: WorldEntityStateNetView): WorldEntityStateNet;
export interface RenderSnapshotNetState {
    kind: number;
    position: readonly number[];
    orientation: readonly number[];
    velocity: readonly number[];
    animation: number;
    movementState: number;
    appearance: number;
    nameOffset: number;
    nameLength: number;
    archetypeId: number;
    level: number;
    race: number;
    gender: number;
    classId: number;
    bodyType: number;
    size: number;
    face: number;
    helm: number;
    chest: number;
    primary: number;
    secondary: number;
    modelKeyOffset: number;
    modelKeyLength: number;
    heading: number;
}
export declare class RenderSnapshotNetStateView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 100;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get kind(): number;
    set kind(value: number);
    get position(): Float32Array;
    get orientation(): Float32Array;
    get velocity(): Float32Array;
    get animation(): number;
    set animation(value: number);
    get movementState(): number;
    set movementState(value: number);
    get appearance(): number;
    set appearance(value: number);
    get nameOffset(): number;
    set nameOffset(value: number);
    get nameLength(): number;
    set nameLength(value: number);
    get archetypeId(): number;
    set archetypeId(value: number);
    get level(): number;
    set level(value: number);
    get race(): number;
    set race(value: number);
    get gender(): number;
    set gender(value: number);
    get classId(): number;
    set classId(value: number);
    get bodyType(): number;
    set bodyType(value: number);
    get size(): number;
    set size(value: number);
    get face(): number;
    set face(value: number);
    get helm(): number;
    set helm(value: number);
    get chest(): number;
    set chest(value: number);
    get primary(): number;
    set primary(value: number);
    get secondary(): number;
    set secondary(value: number);
    get modelKeyOffset(): number;
    set modelKeyOffset(value: number);
    get modelKeyLength(): number;
    set modelKeyLength(value: number);
    get heading(): number;
    set heading(value: number);
}
export declare function writeRenderSnapshotNetState(target: RenderSnapshotNetStateView, value: Readonly<RenderSnapshotNetState>): void;
export declare function readRenderSnapshotNetState(source: RenderSnapshotNetStateView): RenderSnapshotNetState;
export interface RenderSnapshotNet {
    entityId: number;
    state: RenderSnapshotNetState;
}
export declare class RenderSnapshotNetView {
    readonly buffer: ArrayBufferLike;
    readonly byteOffset: number;
    static readonly STRIDE = 104;
    constructor(buffer: ArrayBufferLike, byteOffset?: number);
    get entityId(): number;
    set entityId(value: number);
    get state(): RenderSnapshotNetStateView;
}
export declare function writeRenderSnapshotNet(target: RenderSnapshotNetView, value: Readonly<RenderSnapshotNet>): void;
export declare function readRenderSnapshotNet(source: RenderSnapshotNetView): RenderSnapshotNet;
export declare const ZONE_SESSION_NET_SCHEMA_ID = 4097;
export declare const ZONE_SESSION_NET_VERSION = 1;
export declare const ZONE_SESSION_NET_STRIDE = 8;
export declare const ZONE_SESSION_NET_SCHEMA_HASH = 15259181517842481960n;
export declare class ZoneSessionNetBatchView {
    readonly bytes: Uint8Array;
    readonly count: number;
    readonly payload: Uint8Array;
    constructor(bytes: Uint8Array);
    record(index: number): ZoneSessionNetView;
}
export declare function createZoneSessionNetBatch(count: number, target?: Uint8Array): ZoneSessionNetBatchView;
export declare function viewZoneSessionNet(bytes: Uint8Array, index?: number): ZoneSessionNetView | null;
export declare function encodeZoneSessionNet(value: Readonly<ZoneSessionNet>, target?: Uint8Array): Uint8Array;
export declare function decodeZoneSessionNet(bytes: Uint8Array): ZoneSessionNet | null;
export declare const MOVE_ITEM_NET_SCHEMA_ID = 4098;
export declare const MOVE_ITEM_NET_VERSION = 1;
export declare const MOVE_ITEM_NET_STRIDE = 16;
export declare const MOVE_ITEM_NET_SCHEMA_HASH = 9872981526227491101n;
export declare class MoveItemNetBatchView {
    readonly bytes: Uint8Array;
    readonly count: number;
    readonly payload: Uint8Array;
    constructor(bytes: Uint8Array);
    record(index: number): MoveItemNetView;
}
export declare function createMoveItemNetBatch(count: number, target?: Uint8Array): MoveItemNetBatchView;
export declare function viewMoveItemNet(bytes: Uint8Array, index?: number): MoveItemNetView | null;
export declare function encodeMoveItemNet(value: Readonly<MoveItemNet>, target?: Uint8Array): Uint8Array;
export declare function decodeMoveItemNet(bytes: Uint8Array): MoveItemNet | null;
export declare const DELETE_ITEM_NET_SCHEMA_ID = 4099;
export declare const DELETE_ITEM_NET_VERSION = 1;
export declare const DELETE_ITEM_NET_STRIDE = 8;
export declare const DELETE_ITEM_NET_SCHEMA_HASH = 9936901788470201176n;
export declare class DeleteItemNetBatchView {
    readonly bytes: Uint8Array;
    readonly count: number;
    readonly payload: Uint8Array;
    constructor(bytes: Uint8Array);
    record(index: number): DeleteItemNetView;
}
export declare function createDeleteItemNetBatch(count: number, target?: Uint8Array): DeleteItemNetBatchView;
export declare function viewDeleteItemNet(bytes: Uint8Array, index?: number): DeleteItemNetView | null;
export declare function encodeDeleteItemNet(value: Readonly<DeleteItemNet>, target?: Uint8Array): Uint8Array;
export declare function decodeDeleteItemNet(bytes: Uint8Array): DeleteItemNet | null;
export declare const INT_VALUE_NET_SCHEMA_ID = 4100;
export declare const INT_VALUE_NET_VERSION = 1;
export declare const INT_VALUE_NET_STRIDE = 4;
export declare const INT_VALUE_NET_SCHEMA_HASH = 5114060541421971776n;
export declare class IntValueNetBatchView {
    readonly bytes: Uint8Array;
    readonly count: number;
    readonly payload: Uint8Array;
    constructor(bytes: Uint8Array);
    record(index: number): IntValueNetView;
}
export declare function createIntValueNetBatch(count: number, target?: Uint8Array): IntValueNetBatchView;
export declare function viewIntValueNet(bytes: Uint8Array, index?: number): IntValueNetView | null;
export declare function encodeIntValueNet(value: Readonly<IntValueNet>, target?: Uint8Array): Uint8Array;
export declare function decodeIntValueNet(bytes: Uint8Array): IntValueNet | null;
export declare const WORLD_ENTITY_STATE_NET_SCHEMA_ID = 8193;
export declare const WORLD_ENTITY_STATE_NET_VERSION = 1;
export declare const WORLD_ENTITY_STATE_NET_STRIDE = 112;
export declare const WORLD_ENTITY_STATE_NET_SCHEMA_HASH = 17373580964325630024n;
export declare const WORLD_ENTITY_STATE_NET_KINDS: Readonly<{
    player: 1;
    npc: 2;
}>;
export declare class WorldEntityStateNetBatchView {
    readonly bytes: Uint8Array;
    readonly count: number;
    readonly payload: Uint8Array;
    constructor(bytes: Uint8Array);
    get kind(): Uint8Array;
    get position(): Float32Array;
    get orientation(): Float32Array;
    get velocity(): Float32Array;
    get animation(): Uint32Array;
    get movementState(): Uint16Array;
    get appearance(): Uint16Array;
    get nameOffset(): Uint32Array;
    get nameLength(): Uint16Array;
    get archetypeId(): Uint32Array;
    get level(): Uint16Array;
    get race(): Uint16Array;
    get gender(): Uint8Array;
    get classId(): Uint8Array;
    get bodyType(): Uint16Array;
    get size(): Float32Array;
    get face(): Uint8Array;
    get helm(): Uint8Array;
    get chest(): Uint16Array;
    get primary(): Uint32Array;
    get secondary(): Uint32Array;
    get modelKeyOffset(): Uint32Array;
    get modelKeyLength(): Uint16Array;
    get heading(): Float32Array;
    get serverFlags(): Uint32Array;
    get combatTimer(): Uint32Array;
    get aggroTarget(): Uint32Array;
}
export declare function createWorldEntityStateNetBatch(count: number, target?: Uint8Array): WorldEntityStateNetBatchView;
export declare function viewWorldEntityStateNetBatch(bytes: Uint8Array): WorldEntityStateNetBatchView | null;
export declare const RENDER_SNAPSHOT_NET_SCHEMA_ID = 8194;
export declare const RENDER_SNAPSHOT_NET_VERSION = 1;
export declare const RENDER_SNAPSHOT_NET_STRIDE = 104;
export declare const RENDER_SNAPSHOT_NET_SCHEMA_HASH = 17447644818749773616n;
export declare class RenderSnapshotNetBatchView {
    readonly bytes: Uint8Array;
    readonly count: number;
    readonly payload: Uint8Array;
    constructor(bytes: Uint8Array);
    get entityId(): Uint32Array;
    get stateKind(): Uint8Array;
    get statePosition(): Float32Array;
    get stateOrientation(): Float32Array;
    get stateVelocity(): Float32Array;
    get stateAnimation(): Uint32Array;
    get stateMovementState(): Uint16Array;
    get stateAppearance(): Uint16Array;
    get stateNameOffset(): Uint32Array;
    get stateNameLength(): Uint16Array;
    get stateArchetypeId(): Uint32Array;
    get stateLevel(): Uint16Array;
    get stateRace(): Uint16Array;
    get stateGender(): Uint8Array;
    get stateClassId(): Uint8Array;
    get stateBodyType(): Uint16Array;
    get stateSize(): Float32Array;
    get stateFace(): Uint8Array;
    get stateHelm(): Uint8Array;
    get stateChest(): Uint16Array;
    get statePrimary(): Uint32Array;
    get stateSecondary(): Uint32Array;
    get stateModelKeyOffset(): Uint32Array;
    get stateModelKeyLength(): Uint16Array;
    get stateHeading(): Float32Array;
}
export declare function createRenderSnapshotNetBatch(count: number, target?: Uint8Array): RenderSnapshotNetBatchView;
export declare function viewRenderSnapshotNetBatch(bytes: Uint8Array): RenderSnapshotNetBatchView | null;
