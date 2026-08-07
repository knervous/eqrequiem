/** Dependency-free Shado sidecar codec for variable-size control messages. */
export interface NetMessageCodec<T> {
  readonly schemaId: number;
  readonly name: string;
  encode(value: Partial<T>): Uint8Array;
  decode(bytes: Uint8Array): T;
}

const MAGIC = 0x4a534853; // SHSJ
const VERSION = 1;
const HEADER_BYTES = 16;
const MAX_SIDECAR_BYTES = 8 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export function defineNetMessage<T>(
  schemaId: number,
  name: string,
): NetMessageCodec<T> {
  return Object.freeze({
    schemaId,
    name,
    encode(value: Partial<T>): Uint8Array {
      const payload = textEncoder.encode(JSON.stringify(value));
      if (payload.byteLength > MAX_SIDECAR_BYTES)
        throw new RangeError(`${name} sidecar is too large`);
      const bytes = new Uint8Array(HEADER_BYTES + payload.byteLength);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, MAGIC, true);
      view.setUint16(4, VERSION, true);
      view.setUint32(8, schemaId, true);
      view.setUint32(12, payload.byteLength, true);
      bytes.set(payload, HEADER_BYTES);
      return bytes;
    },
    decode(bytes: Uint8Array): T {
      if (bytes.byteLength < HEADER_BYTES)
        throw new RangeError(`Truncated ${name} sidecar`);
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const payloadBytes = view.getUint32(12, true);
      if (
        view.getUint32(0, true) !== MAGIC ||
        view.getUint16(4, true) !== VERSION ||
        view.getUint32(8, true) !== schemaId ||
        payloadBytes > MAX_SIDECAR_BYTES ||
        bytes.byteLength !== HEADER_BYTES + payloadBytes
      )
        throw new TypeError(`${name} sidecar schema mismatch`);
      return JSON.parse(textDecoder.decode(bytes.subarray(HEADER_BYTES))) as T;
    },
  });
}

interface OpenMessage {
  [key: string]: any;
}

export interface Int {
  value: number;
}
export const Int = defineNetMessage<Int>(1, "Int");
export interface String {
  value: string;
}
export const String = defineNetMessage<String>(2, "String");
export interface JWTLogin {
  token: string;
}
export const JWTLogin = defineNetMessage<JWTLogin>(3, "JWTLogin");
export interface JWTResponse {
  status: number;
}
export const JWTResponse = defineNetMessage<JWTResponse>(4, "JWTResponse");

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
export const ItemInstance = defineNetMessage<ItemInstance>(10, "ItemInstance");
export interface BulkItemPacket {
  items: ItemInstance[];
}
export const BulkItemPacket = defineNetMessage<BulkItemPacket>(
  11,
  "BulkItemPacket",
);
export interface DeleteItem {
  slot: number;
  bag: number;
}
export const DeleteItem = defineNetMessage<DeleteItem>(12, "DeleteItem");
export interface BulkDeleteItem {
  items: DeleteItem[];
}
export const BulkDeleteItem = defineNetMessage<BulkDeleteItem>(
  13,
  "BulkDeleteItem",
);
export interface MoveItem extends OpenMessage {
  fromSlot: number;
  toSlot: number;
  fromBag?: number;
  toBag?: number;
  fromBagSlot: number;
  toBagSlot: number;
}
export const MoveItem = defineNetMessage<MoveItem>(14, "MoveItem");

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
  appearanceSchemaVersion?: number;
  bodyFamilyId?: string;
  bodyComponentId?: string;
  faceComponentId?: string;
  presentationId?: string;
  callingId?: string;
  originId?: string;
}
export interface CharacterSelect {
  characterCount: number;
  characters: CharacterSelectEntry[];
}
export const CharacterSelect = defineNetMessage<CharacterSelect>(
  20,
  "CharacterSelect",
);
export interface PlayerProfile extends OpenMessage {
  name: string;
  level: number;
  charClass: number;
  race: number;
  inventoryItems: ItemInstance[];
}
export const PlayerProfile = defineNetMessage<PlayerProfile>(
  21,
  "PlayerProfile",
);
export interface CharCreate extends OpenMessage {
  name: string;
  race: number;
  charClass: number;
  gender: number;
  deity: number;
  face: number;
  startZone: number;
  str?: number;
  sta?: number;
  agi?: number;
  dex?: number;
  wis?: number;
  intel?: number;
  cha?: number;
  appearanceSchemaVersion?: number;
  bodyFamilyId?: string;
  bodyComponentId?: string;
  faceComponentId?: string;
  presentationId?: string;
  callingId?: string;
  originId?: string;
}
export const CharCreate = defineNetMessage<CharCreate>(22, "CharCreate");
export interface EnterWorld {
  name: string;
  tutorial: number;
  returnHome: number;
}
export const EnterWorld = defineNetMessage<EnterWorld>(23, "EnterWorld");

export enum ZoneChangeType {
  FROM_WORLD = 0,
  FROM_ZONE = 1,
}
export interface ZoneSession {
  zoneId: number;
  instanceId: number;
}
export const ZoneSession = defineNetMessage<ZoneSession>(30, "ZoneSession");
export interface RequestClientZoneChange extends OpenMessage {
  zoneId?: number;
  instanceId?: number;
  type: ZoneChangeType;
  useSafeLocation?: boolean;
  x?: number;
  y?: number;
  z?: number;
  heading?: number;
}
export const RequestClientZoneChange =
  defineNetMessage<RequestClientZoneChange>(31, "RequestClientZoneChange");
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
export const NewZone = defineNetMessage<NewZone>(32, "NewZone");

export interface Spawn extends OpenMessage {
  id: number;
  spawnId: number;
  name: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  currentHp?: number;
  maximumHp?: number;
  kind?: number;
  isNpc?: boolean;
  isCorpse?: boolean;
  /** Hydrated from the render snapshot; 41 marks a merchant. */
  charClass?: number;
  equipment?: {
    head?: number;
    chest?: number;
    primary?: number;
    secondary?: number;
  };
}
export const Spawn = defineNetMessage<Spawn>(40, "Spawn");
export interface DeleteSpawn {
  spawnId: number;
}
export const DeleteSpawn = defineNetMessage<DeleteSpawn>(48, "DeleteSpawn");
export interface Spawns {
  spawns: Spawn[];
}
export const Spawns = defineNetMessage<Spawns>(41, "Spawns");
export interface EntityPositionUpdate extends OpenMessage {
  updates: EntityPositionUpdateBase[];
}
export const EntityPositionUpdate = defineNetMessage<EntityPositionUpdate>(
  42,
  "EntityPositionUpdate",
);
export interface EntityPositionUpdateBase extends OpenMessage {
  spawnId: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  heading: number;
  animation: number;
}
export interface ClientPositionUpdate extends OpenMessage {
  x: number;
  y: number;
  z: number;
  heading: number;
}
export const ClientPositionUpdate = defineNetMessage<ClientPositionUpdate>(
  43,
  "ClientPositionUpdate",
);
export interface AutoAttack {
  enabled: boolean;
  targetId: number;
}
export const AutoAttack = defineNetMessage<AutoAttack>(60, "AutoAttack");
export interface CombatEvent {
  tick: number;
  attackerId: number;
  targetId: number;
  outcome:
    | "started"
    | "stopped"
    | "hit"
    | "miss"
    | "out-of-range"
    | "invalid-target";
  swingSequence: number;
  damage: number;
  targetCurrentHp: number;
  targetMaximumHp: number;
  killed: boolean;
}
export const CombatEvent = defineNetMessage<CombatEvent>(61, "CombatEvent");
export interface NpcDebugPoint {
  x: number;
  y: number;
  z: number;
}
export interface NpcDebugState {
  npcId: number;
  tick: number;
  engaged: boolean;
  aggroTargetId: number;
  position: NpcDebugPoint;
  movementTarget: NpcDebugPoint;
  moveSpeed: number;
  hateList: {
    entityId: number;
    hate: number;
    damage: number;
    lastModifiedTick: number;
  }[];
  roam: {
    suspended: boolean;
    targetIndex: number;
    pauseUntilMs: number;
    path: NpcDebugPoint[];
  } | null;
  navigation: {
    status:
      | "idle"
      | "melee"
      | "path-pending"
      | "following-path"
      | "direct-fallback"
      | "no-target";
    requestId: number;
    requestedAtTick: number;
    nextRepathTick: number;
    waypointIndex: number;
    path: NpcDebugPoint[];
    requestedDestination: NpcDebugPoint | null;
    error: string | null;
  };
}
export const NpcDebugState = defineNetMessage<NpcDebugState>(
  67,
  "NpcDebugState",
);
export interface DeathEvent {
  victimId: number;
  victimKind: "pc" | "npc";
  killerId: number;
  corpseId: number;
  bindZoneId: number;
  x: number;
  y: number;
  z: number;
  heading: number;
}
export const DeathEvent = defineNetMessage<DeathEvent>(62, "DeathEvent");
export interface LootRequest {
  corpseId: number;
}
export const LootRequest = defineNetMessage<LootRequest>(63, "LootRequest");
export interface LootWindow {
  corpseId: number;
  corpseName: string;
  items: ItemInstance[];
}
export const LootWindow = defineNetMessage<LootWindow>(64, "LootWindow");
export interface LootItem {
  corpseId: number;
  lootSlot: number;
}
export const LootItem = defineNetMessage<LootItem>(65, "LootItem");
export interface LootError {
  corpseId: number;
  message: string;
}
export const LootError = defineNetMessage<LootError>(66, "LootError");
export interface MerchantOpen {
  npcId: number;
}
export const MerchantOpen = defineNetMessage<MerchantOpen>(68, "MerchantOpen");
export interface MerchantWindowItem {
  merchantSlot: number;
  itemId: number;
  name: string;
  quantity: number | null;
  unitPrice: number;
  item: ItemInstance;
}
export interface MerchantSellQuote {
  slot: number;
  bag: number;
  quantity: number;
  unitPrice: number;
  item: ItemInstance;
}
export interface MerchantWindow {
  npcId: number;
  merchantName: string;
  currencyCopper: number;
  items: MerchantWindowItem[];
  sellItems: MerchantSellQuote[];
}
export const MerchantWindow = defineNetMessage<MerchantWindow>(
  69,
  "MerchantWindow",
);
export interface MerchantBuy {
  npcId: number;
  merchantSlot: number;
  quantity: number;
}
export const MerchantBuy = defineNetMessage<MerchantBuy>(70, "MerchantBuy");
export interface MerchantSell {
  npcId: number;
  slot: number;
  bag: number;
  quantity: number;
}
export const MerchantSell = defineNetMessage<MerchantSell>(71, "MerchantSell");
export interface MerchantError {
  npcId: number;
  message: string;
}
export const MerchantError = defineNetMessage<MerchantError>(
  72,
  "MerchantError",
);
export interface EntityAnimation extends OpenMessage {
  spawnId: number;
  /** Canonical EQ animation clip key such as `l01` or `p01`. */
  animation: string;
}
export const EntityAnimation = defineNetMessage<EntityAnimation>(
  44,
  "EntityAnimation",
);
export interface LevelUpdate {
  level: number;
  exp: number;
}
export const LevelUpdate = defineNetMessage<LevelUpdate>(45, "LevelUpdate");
export interface ChannelMessage extends OpenMessage {
  sender: string;
  target: string;
  message: string;
  chanNum: number;
}
export const ChannelMessage = defineNetMessage<ChannelMessage>(
  46,
  "ChannelMessage",
);
export interface CommandMessage extends OpenMessage {
  command: string;
  args?: string[];
}
export const CommandMessage = defineNetMessage<CommandMessage>(
  47,
  "CommandMessage",
);
