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
  appearanceSchemaVersion?: number;
  bodyFamilyId?: string;
  bodyComponentId?: string;
  faceComponentId?: string;
  presentationId?: string;
  callingId?: string;
  originId?: string;
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
  characterId: number;
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
  characterId: number;
  slot: number;
  bag: number;
}

export interface PersistEnterWorldResult {
  ok: boolean;
  characterId: number | null;
  name: string | null;
  demoStartPending: boolean;
}

export interface PersistZoneSessionResult {
  valid: boolean;
  zoneId: number | null;
  instanceId: number;
}

export type PersistCommand =
  | { type: "login_load"; token: string }
  | { type: "character_create"; accountId: number; character: import("../backend/contracts.js").BackendCharacterCreate }
  | { type: "character_delete"; accountId: number; name: string }
  | { type: "character_enter_world"; name: string }
  | {
      type: "zone_session_resolve";
      zoneId: number | string;
      instanceId: number;
      demoStartPending: boolean;
    };

export type PersistResult =
  | { type: "login_load"; data: PersistLoginResult }
  | { type: "character_create"; data: PersistCreateCharacterResult }
  | { type: "character_delete"; data: PersistDeleteCharacterResult }
  | { type: "character_enter_world"; data: PersistEnterWorldResult }
  | { type: "zone_session_resolve"; data: PersistZoneSessionResult };

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
