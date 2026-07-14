const MAGIC = 0x4a534853;
const VERSION = 1;
const HEADER_BYTES = 16;
const MAX_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function encodeSidecar<T>(schemaId: number, value: T): Uint8Array {
  const payload = encoder.encode(JSON.stringify(value));
  if (payload.byteLength > MAX_BYTES)
    throw new RangeError("sidecar payload is too large");
  const bytes = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, VERSION, true);
  view.setUint32(8, schemaId, true);
  view.setUint32(12, payload.byteLength, true);
  bytes.set(payload, HEADER_BYTES);
  return bytes;
}

export function decodeSidecar<T>(
  schemaId: number,
  bytes: Uint8Array,
): T | null {
  if (bytes.byteLength < HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const payloadBytes = view.getUint32(12, true);
  if (
    view.getUint32(0, true) !== MAGIC ||
    view.getUint16(4, true) !== VERSION ||
    view.getUint32(8, true) !== schemaId ||
    payloadBytes > MAX_BYTES ||
    bytes.byteLength !== HEADER_BYTES + payloadBytes
  )
    return null;
  try {
    return JSON.parse(decoder.decode(bytes.subarray(HEADER_BYTES))) as T;
  } catch {
    return null;
  }
}

export const SIDECAR_SCHEMA = Object.freeze({
  INT: 1,
  STRING: 2,
  JWT_LOGIN: 3,
  JWT_RESPONSE: 4,
  ITEM: 10,
  BULK_ITEMS: 11,
  DELETE_ITEM: 12,
  BULK_DELETE_ITEMS: 13,
  MOVE_ITEM: 14,
  CHARACTER_SELECT: 20,
  PLAYER_PROFILE: 21,
  CHARACTER_CREATE: 22,
  ENTER_WORLD: 23,
  ZONE_SESSION: 30,
  ZONE_CHANGE: 31,
  NEW_ZONE: 32,
  SPAWN: 40,
  SPAWNS: 41,
  ENTITY_POSITION: 42,
  CLIENT_POSITION: 43,
  ANIMATION: 44,
  LEVEL: 45,
  CHANNEL: 46,
  COMMAND: 47,
  DELETE_SPAWN: 48,
});
