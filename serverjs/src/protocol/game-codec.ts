import {
  decodeDeleteItemNet,
  decodeMoveItemNet,
  decodeZoneSessionNet,
  encodeIntValueNet,
  type DeleteItemNet,
  type MoveItemNet,
  type ZoneSessionNet,
} from "./generated/net-structs.js";
import {
  decodeSidecar,
  encodeSidecar,
  SIDECAR_SCHEMA,
} from "./sidecar-codec.js";
import type { PersistCharacter } from "../persist/types.js";

export type ZoneRouteRequest = ZoneSessionNet;
export type MoveItemRequest = MoveItemNet;
export type DeleteItemRequest = DeleteItemNet;

export function decodeJwtLoginToken(payload: Uint8Array): string {
  return (
    (decodeSidecar<{ token?: unknown }>(SIDECAR_SCHEMA.JWT_LOGIN, payload)
      ?.token as string) ?? ""
  );
}

export function decodeCharacterCreateName(payload: Uint8Array): string {
  const value = decodeSidecar<{ name?: unknown }>(
    SIDECAR_SCHEMA.CHARACTER_CREATE,
    payload,
  )?.name;
  return typeof value === "string" ? value.trim() : "";
}

export function decodeCharacterCreate(payload: Uint8Array): Record<string, unknown> | null {
  return decodeSidecar<Record<string, unknown>>(SIDECAR_SCHEMA.CHARACTER_CREATE, payload);
}

export function decodeCharacterDeleteName(payload: Uint8Array): string {
  const value = decodeSidecar<{ value?: unknown }>(
    SIDECAR_SCHEMA.STRING,
    payload,
  )?.value;
  return typeof value === "string" ? value.trim() : "";
}

export function decodeEnterWorldName(payload: Uint8Array): string {
  const value = decodeSidecar<{ name?: unknown }>(
    SIDECAR_SCHEMA.ENTER_WORLD,
    payload,
  )?.name;
  return typeof value === "string" ? value.trim() : "";
}

export function decodeZoneRouteRequest(payload: Uint8Array): ZoneRouteRequest {
  const packed = decodeZoneSessionNet(payload);
  if (packed) return packed;
  const value =
    decodeSidecar<{ zoneId?: unknown; instanceId?: unknown }>(
      SIDECAR_SCHEMA.ZONE_SESSION,
      payload,
    ) ??
    decodeSidecar<{ zoneId?: unknown; instanceId?: unknown }>(
      SIDECAR_SCHEMA.ZONE_CHANGE,
      payload,
    );
  return {
    zoneId:
      typeof value?.zoneId === "number"
        ? value.zoneId
        : Number(value?.zoneId ?? -1),
    instanceId: typeof value?.instanceId === "number" ? value.instanceId : 0,
  };
}

export function decodeMoveItemRequest(
  payload: Uint8Array,
): MoveItemRequest | null {
  const packed = decodeMoveItemNet(payload);
  if (packed) return packed;
  const value = decodeSidecar<Record<string, unknown>>(
    SIDECAR_SCHEMA.MOVE_ITEM,
    payload,
  );
  if (!value) return null;
  const fromSlot = Number(value.fromSlot);
  const toSlot = Number(value.toSlot);
  const fromBag = Number(value.fromBag ?? value.fromBagSlot);
  const toBag = Number(value.toBag ?? value.toBagSlot);
  return [fromSlot, toSlot, fromBag, toBag].every(Number.isFinite)
    ? { fromSlot, toSlot, fromBag, toBag }
    : null;
}

export function encodeMoveItemResponse(value: MoveItemRequest): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.MOVE_ITEM, {
    ...value,
    fromBagSlot: value.fromBag,
    toBagSlot: value.toBag,
    numberInStack: 1,
  });
}

export function decodeDeleteItemRequest(
  payload: Uint8Array,
): DeleteItemRequest | null {
  const packed = decodeDeleteItemNet(payload);
  if (packed) return packed;
  const value = decodeSidecar<{ slot?: unknown; bag?: unknown }>(
    SIDECAR_SCHEMA.DELETE_ITEM,
    payload,
  );
  const slot = Number(value?.slot);
  const bag = Number(value?.bag);
  return Number.isFinite(slot) && Number.isFinite(bag) ? { slot, bag } : null;
}

export function encodeJwtResponse(status: number): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.JWT_RESPONSE, { status });
}

export function encodeIntValue(value: number): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.INT, { value });
}

export function encodeCharacterSelect(
  characters: PersistCharacter[],
): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.CHARACTER_SELECT, {
    characterCount: characters.length,
    characters: characters.map((character) => ({
      name: character.name,
      level: character.level,
      charClass: character.class ?? 0,
      race: character.race ?? 0,
      gender: character.gender ?? 0,
      deity: character.deity ?? 0,
      zone: character.zoneId ?? 0,
      instance: character.zoneInstance ?? 0,
      lastLogin: character.lastLogin ?? 0,
      face: character.face ?? 0,
      enabled: 1,
      items: character.items ?? [],
    })),
  });
}

export function encodeInteger(value: number): Uint8Array {
  return encodeIntValueNet({ value });
}

export function encodeNewZone(value: Record<string, unknown>): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.NEW_ZONE, value);
}

export function encodePlayerProfile(
  value: Record<string, unknown>,
): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.PLAYER_PROFILE, value);
}

export function encodeZoneSpawns(value: Record<string, unknown>): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.SPAWNS, value);
}

export function encodeZoneSpawn(value: Record<string, unknown>): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.SPAWN, value);
}

export function encodeDeleteSpawn(value: Record<string, unknown>): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.DELETE_SPAWN, value);
}

export function encodeChannelMessage(
  value: Record<string, unknown>,
): Uint8Array {
  return encodeSidecar(SIDECAR_SCHEMA.CHANNEL, value);
}
