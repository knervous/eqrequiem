export type BackendTransport = "datagram" | "control-stream";

export interface BackendCharacterCreate {
  name: string;
  charClass: number;
  race: number;
  gender: number;
  deity: number;
  startZone: number;
  face: number;
  str?: number;
  sta?: number;
  agi?: number;
  dex?: number;
  wis?: number;
  intel?: number;
  cha?: number;
}

export interface BackendMoveItem {
  fromSlot: number;
  toSlot: number;
  fromBag: number;
  toBag: number;
}

export type BackendRequest =
  | { type: "login"; token: string }
  | { type: "character_create"; character: BackendCharacterCreate }
  | { type: "character_delete"; name: string }
  | { type: "enter_world"; name: string }
  | { type: "zone_session"; zoneId: number | string; instanceId: number }
  | { type: "zone_change"; zoneId?: number | string; instanceId: number }
  | { type: "gm_command"; command: string; args: string[] }
  | {
      type: "channel_message";
      sender: string;
      targetName: string;
      message: string;
      channel: number;
    }
  | ({ type: "move_item" } & BackendMoveItem)
  | { type: "delete_item"; slot: number; bag: number };

export type BackendEventKind =
  | "jwt_response"
  | "character_select"
  | "approve_name"
  | "post_enter_world"
  | "zone_session_valid"
  | "new_zone"
  | "player_profile"
  | "zone_spawns"
  | "channel_message"
  | "level_update"
  | "add_item"
  | "bulk_items"
  | "delete_item"
  | "bulk_delete_items"
  | "move_item";

export interface BackendEvent {
  type: BackendEventKind;
  value: Record<string, unknown>;
  transport?: BackendTransport;
}

export interface GameBackend {
  initialize(): Promise<void>;
  connect(sessionId: number): Promise<BackendEvent[]>;
  disconnect(sessionId: number): Promise<void>;
  handle(sessionId: number, request: BackendRequest): Promise<BackendEvent[]>;
  close(): Promise<void>;
}

export interface BackendItemTemplate {
  id: number;
  name: string;
  idfile: string;
  icon: number;
  material: number;
  color: number;
  itemtype: number;
  slots: number;
  ac: number;
  bagslots: number;
  classes: number;
  races: number;
  stackable: number;
  stacksize: number;
  maxcharges: number;
  weight?: number;
  damage?: number;
  delay?: number;
  astr?: number;
  asta?: number;
  adex?: number;
  aagi?: number;
  aint?: number;
  awis?: number;
  acha?: number;
  hp?: number;
  mana?: number;
  dr?: number;
  mr?: number;
  cr?: number;
  fr?: number;
  pr?: number;
  haste?: number;
  magic?: number;
  nodrop?: number;
}

export interface BackendZoneDefinition {
  id: number;
  shortName: string;
  longName: string;
  safeX?: number;
  safeY?: number;
  safeZ?: number;
}

export interface EmbeddedBackendContent {
  items: readonly BackendItemTemplate[];
  gearSets: Readonly<Record<string, readonly (readonly [number, number])[]>>;
  zones: readonly BackendZoneDefinition[];
  /** Replaceable canonical content SQLite attached to the persistent runtime DB. */
  contentDatabasePath?: string;
  quests?: readonly import("../zone/quest-types.js").QuestDefinition[];
}
