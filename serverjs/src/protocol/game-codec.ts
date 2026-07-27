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

export interface ZoneRouteRequest extends ZoneSessionNet {
  x?: number | undefined;
  y?: number | undefined;
  z?: number | undefined;
  heading?: number | undefined;
}
export type MoveItemRequest = MoveItemNet;
export type DeleteItemRequest = DeleteItemNet;

export interface ClientPositionRequest {
  x: number;
  y: number;
  z: number;
  heading: number;
}

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

export function decodeCharacterCreate(
  payload: Uint8Array,
): Record<string, unknown> | null {
  return decodeSidecar<Record<string, unknown>>(
    SIDECAR_SCHEMA.CHARACTER_CREATE,
    payload,
  );
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
    decodeSidecar<{
      zoneId?: unknown;
      instanceId?: unknown;
      x?: unknown;
      y?: unknown;
      z?: unknown;
      heading?: unknown;
    }>(SIDECAR_SCHEMA.ZONE_SESSION, payload) ??
    decodeSidecar<{
      zoneId?: unknown;
      instanceId?: unknown;
      x?: unknown;
      y?: unknown;
      z?: unknown;
      heading?: unknown;
    }>(SIDECAR_SCHEMA.ZONE_CHANGE, payload);
  const optionalFinite = (candidate: unknown): number | undefined => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const x = optionalFinite(value?.x);
  const y = optionalFinite(value?.y);
  const z = optionalFinite(value?.z);
  const heading = optionalFinite(value?.heading);
  const parsedZoneId = Number(value?.zoneId ?? -1);
  return {
    zoneId:
      Number.isInteger(parsedZoneId) && parsedZoneId >= 0 ? parsedZoneId : -1,
    instanceId: typeof value?.instanceId === "number" ? value.instanceId : 0,
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    ...(z === undefined ? {} : { z }),
    ...(heading === undefined ? {} : { heading }),
  };
}

export function decodeClientPositionRequest(
  payload: Uint8Array,
): ClientPositionRequest | null {
  const value = decodeSidecar<{
    x?: unknown;
    y?: unknown;
    z?: unknown;
    heading?: unknown;
  }>(SIDECAR_SCHEMA.CLIENT_POSITION, payload);
  const location = {
    x: Number(value?.x),
    y: Number(value?.y),
    z: Number(value?.z),
    heading: Number(value?.heading),
  };
  return Object.values(location).every(Number.isFinite) ? location : null;
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
      ...(character.appearanceSchemaVersion === undefined
        ? {}
        : {
            appearanceSchemaVersion: character.appearanceSchemaVersion,
            bodyFamilyId: character.bodyFamilyId,
            bodyComponentId: character.bodyComponentId,
            faceComponentId: character.faceComponentId,
            presentationId: character.presentationId,
            callingId: character.callingId,
            originId: character.originId,
          }),
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
