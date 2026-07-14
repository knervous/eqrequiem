export interface PersistCharacter {
  id?: number;
  name: string;
  level: number;
  class?: number;
  race?: number;
  gender?: number;
  deity?: number;
  zoneId?: number;
  zoneInstance?: number;
  lastLogin?: number;
  face?: number;
  items?: Record<string, unknown>[];
}

export interface PersistLoginResult {
  accountId: number;
  characters: PersistCharacter[];
}

export interface PersistCreateCharacterResult {
  ok: boolean;
  characters: PersistCharacter[];
}

export interface PersistDeleteCharacterResult {
  ok: boolean;
  characters: PersistCharacter[];
}

export interface PersistMoveItemInput {
  sessionId: number;
  fromSlot: number;
  toSlot: number;
  fromBag: number;
  toBag: number;
}

export interface PersistSlotMove {
  fromSlot: number;
  toSlot: number;
  fromBag: number;
  toBag: number;
}

export interface PersistDeleteItemInput {
  sessionId: number;
  slot: number;
  bag: number;
}

export interface PersistMoveItemResult {
  ok: boolean;
  moves: PersistSlotMove[];
}

export interface PersistDeleteItemResult {
  ok: boolean;
}

export type PersistCommand =
  | { type: "login_load"; token: string }
  | { type: "character_create"; accountId: number; character: import("../backend/contracts.js").BackendCharacterCreate }
  | { type: "character_delete"; accountId: number; name: string }
  | ({ type: "inventory_move" } & PersistMoveItemInput)
  | ({ type: "inventory_delete" } & PersistDeleteItemInput);

export type PersistResult =
  | { type: "login_load"; data: PersistLoginResult }
  | { type: "character_create"; data: PersistCreateCharacterResult }
  | { type: "character_delete"; data: PersistDeleteCharacterResult }
  | { type: "inventory_move"; data: PersistMoveItemResult }
  | { type: "inventory_delete"; data: PersistDeleteItemResult };

export interface PersistRequestEnvelope {
  requestId: number;
  command: PersistCommand;
}

export interface PersistResponseEnvelope {
  requestId: number;
  ok: boolean;
  result?: PersistResult;
  error?: string;
}
