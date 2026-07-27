/** Dependency-free Shado sidecar codec for variable-size control messages. */
export interface NetMessageCodec<T> {
    readonly schemaId: number;
    readonly name: string;
    encode(value: Partial<T>): Uint8Array;
    decode(bytes: Uint8Array): T;
}
export declare function defineNetMessage<T>(schemaId: number, name: string): NetMessageCodec<T>;
interface OpenMessage {
    [key: string]: any;
}
export interface Int {
    value: number;
}
export declare const Int: NetMessageCodec<Int>;
export interface String {
    value: string;
}
export declare const String: NetMessageCodec<String>;
export interface JWTLogin {
    token: string;
}
export declare const JWTLogin: NetMessageCodec<JWTLogin>;
export interface JWTResponse {
    status: number;
}
export declare const JWTResponse: NetMessageCodec<JWTResponse>;
export interface ItemInstance extends OpenMessage {
    id: number;
    itemId: number;
    name: string;
    slot: number;
    bagSlot: number;
    idfile: string;
    icon: number;
    material: number;
    color: number;
    itemtype: number;
    slots: number;
    ac: number;
    weight: number;
    damage: number;
    delay: number;
    astr: number;
    asta: number;
    adex: number;
    aagi: number;
    aint: number;
    awis: number;
    acha: number;
    hp: number;
    mana: number;
    dr: number;
    mr: number;
    cr: number;
    fr: number;
    pr: number;
    haste: number;
    magic: number;
    nodrop: number;
    classes: number;
    races: number;
}
export declare const ItemInstance: NetMessageCodec<ItemInstance>;
export interface BulkItemPacket {
    items: ItemInstance[];
}
export declare const BulkItemPacket: NetMessageCodec<BulkItemPacket>;
export interface DeleteItem {
    slot: number;
    bag: number;
}
export declare const DeleteItem: NetMessageCodec<DeleteItem>;
export interface BulkDeleteItem {
    items: DeleteItem[];
}
export declare const BulkDeleteItem: NetMessageCodec<BulkDeleteItem>;
export interface MoveItem extends OpenMessage {
    fromSlot: number;
    toSlot: number;
    fromBag?: number;
    toBag?: number;
    fromBagSlot: number;
    toBagSlot: number;
}
export declare const MoveItem: NetMessageCodec<MoveItem>;
export interface CharacterSelectEntry extends OpenMessage {
    name: string;
    level?: number;
    charClass?: number;
    race?: number | string;
    gender?: number;
    deity?: number;
    zone?: number;
    instance?: number;
    lastLogin?: number;
    face?: number;
    enabled?: number;
    items?: ItemInstance[];
}
export interface CharacterSelect {
    characterCount: number;
    characters: CharacterSelectEntry[];
}
export declare const CharacterSelect: NetMessageCodec<CharacterSelect>;
export interface PlayerProfile extends OpenMessage {
    name: string;
    level: number;
    charClass: number;
    race: number;
    inventoryItems: ItemInstance[];
}
export declare const PlayerProfile: NetMessageCodec<PlayerProfile>;
export interface CharCreate extends OpenMessage {
    name: string;
    race: number;
    charClass: number;
    gender: number;
    deity: number;
    face: number;
    startZone: number;
    str: number;
    sta: number;
    agi: number;
    dex: number;
    wis: number;
    intel: number;
    cha: number;
}
export declare const CharCreate: NetMessageCodec<CharCreate>;
export interface EnterWorld {
    name: string;
    tutorial: number;
    returnHome: number;
}
export declare const EnterWorld: NetMessageCodec<EnterWorld>;
export declare enum ZoneChangeType {
    FROM_WORLD = 0,
    FROM_ZONE = 1
}
export interface ZoneSession {
    zoneId: number;
    instanceId: number;
}
export declare const ZoneSession: NetMessageCodec<ZoneSession>;
export interface RequestClientZoneChange extends OpenMessage {
    zoneId?: number;
    instanceId?: number;
    type: ZoneChangeType;
}
export declare const RequestClientZoneChange: NetMessageCodec<RequestClientZoneChange>;
export interface ZonePoint extends OpenMessage {
    number: number;
    zoneId: number;
    instanceId: number;
}
export interface NewZone extends OpenMessage {
    zoneId: number;
    zoneIdNumber: number;
    instanceId: number;
    zonePoints: ZonePoint[];
}
export declare const NewZone: NetMessageCodec<NewZone>;
export interface Spawn extends OpenMessage {
    id: number;
    spawnId: number;
    name: string;
    x: number;
    y: number;
    z: number;
    heading: number;
    equipment?: {
        head?: number;
        chest?: number;
        primary?: number;
        secondary?: number;
    };
}
export declare const Spawn: NetMessageCodec<Spawn>;
export interface DeleteSpawn {
    spawnId: number;
}
export declare const DeleteSpawn: NetMessageCodec<DeleteSpawn>;
export interface Spawns {
    spawns: Spawn[];
}
export declare const Spawns: NetMessageCodec<Spawns>;
export interface EntityPositionUpdate extends OpenMessage {
    updates: EntityPositionUpdateBase[];
}
export declare const EntityPositionUpdate: NetMessageCodec<EntityPositionUpdate>;
export interface EntityPositionUpdateBase extends OpenMessage {
    spawnId: number;
    position: {
        x: number;
        y: number;
        z: number;
    };
    velocity: {
        x: number;
        y: number;
        z: number;
    };
    heading: number;
    animation: number;
}
export interface ClientPositionUpdate extends OpenMessage {
    x: number;
    y: number;
    z: number;
    heading: number;
}
export declare const ClientPositionUpdate: NetMessageCodec<ClientPositionUpdate>;
export interface EntityAnimation extends OpenMessage {
    spawnId: number;
    animation: number;
}
export declare const EntityAnimation: NetMessageCodec<EntityAnimation>;
export interface LevelUpdate {
    level: number;
    exp: number;
}
export declare const LevelUpdate: NetMessageCodec<LevelUpdate>;
export interface ChannelMessage extends OpenMessage {
    sender: string;
    target: string;
    message: string;
    chanNum: number;
}
export declare const ChannelMessage: NetMessageCodec<ChannelMessage>;
export interface CommandMessage extends OpenMessage {
    command: string;
    args?: string[];
}
export declare const CommandMessage: NetMessageCodec<CommandMessage>;
export {};
