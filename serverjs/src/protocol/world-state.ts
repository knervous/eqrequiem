import {
  createRenderSnapshotNetBatch,
  NET_HEADER_BYTES,
  RENDER_SNAPSHOT_NET_STRIDE,
  viewRenderSnapshotNetBatch,
  type RenderSnapshotNetBatchView,
} from "./generated/net-structs.js";

const WORLD_STATE_MAGIC = 0x57534853; // SHSW
const WORLD_STATE_VERSION = 1;
const WORLD_STATE_HEADER_BYTES = 24;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const WORLD_STATE_FLAGS = Object.freeze({
  DELTA: 0,
  FULL: 1 << 0,
  HAS_SIDECAR: 1 << 1,
});

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

export function createWorldStatePacket(
  count: number,
  sidecar: Uint8Array = new Uint8Array(),
  flags: number = WORLD_STATE_FLAGS.DELTA,
  revision = 0,
): WritableWorldStatePacket {
  const stateLength = NET_HEADER_BYTES + RENDER_SNAPSHOT_NET_STRIDE * count;
  const bytes = new Uint8Array(WORLD_STATE_HEADER_BYTES + stateLength + sidecar.byteLength);
  const header = new DataView(bytes.buffer);
  const finalFlags = flags | (sidecar.byteLength ? WORLD_STATE_FLAGS.HAS_SIDECAR : 0);
  header.setUint32(0, WORLD_STATE_MAGIC, true);
  header.setUint16(4, WORLD_STATE_VERSION, true);
  header.setUint16(6, finalFlags, true);
  header.setUint32(8, revision, true);
  header.setUint32(12, stateLength, true);
  header.setUint32(16, sidecar.byteLength, true);
  header.setUint32(20, count, true);
  const state = createRenderSnapshotNetBatch(
    count,
    bytes.subarray(WORLD_STATE_HEADER_BYTES, WORLD_STATE_HEADER_BYTES + stateLength),
  );
  bytes.set(sidecar, WORLD_STATE_HEADER_BYTES + stateLength);
  return { bytes, revision, flags: finalFlags, full: (flags & WORLD_STATE_FLAGS.FULL) !== 0, state, sidecar: bytes.subarray(WORLD_STATE_HEADER_BYTES + stateLength) };
}

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

export function encodeWorldStatePacket(
  state: RenderSnapshotNetBatchView,
  sidecar: Uint8Array = new Uint8Array(),
  flags: number = WORLD_STATE_FLAGS.DELTA,
  revision = 0,
): Uint8Array {
  const bytes = new Uint8Array(
    WORLD_STATE_HEADER_BYTES + state.bytes.byteLength + sidecar.byteLength,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, WORLD_STATE_MAGIC, true);
  view.setUint16(4, WORLD_STATE_VERSION, true);
  view.setUint16(6, flags | (sidecar.byteLength ? WORLD_STATE_FLAGS.HAS_SIDECAR : 0), true);
  view.setUint32(8, revision, true);
  view.setUint32(12, state.bytes.byteLength, true);
  view.setUint32(16, sidecar.byteLength, true);
  view.setUint32(20, state.count, true);
  bytes.set(state.bytes, WORLD_STATE_HEADER_BYTES);
  bytes.set(sidecar, WORLD_STATE_HEADER_BYTES + state.bytes.byteLength);
  return bytes;
}

export function viewWorldStatePacket(bytes: Uint8Array): WorldStatePacketView | null {
  if (bytes.byteLength >= WORLD_STATE_HEADER_BYTES) {
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (header.getUint32(0, true) === WORLD_STATE_MAGIC) {
      if (header.getUint16(4, true) !== WORLD_STATE_VERSION) return null;
      const stateLength = header.getUint32(12, true);
      const sidecarLength = header.getUint32(16, true);
      if (WORLD_STATE_HEADER_BYTES + stateLength + sidecarLength !== bytes.byteLength)
        return null;
      const state = viewRenderSnapshotNetBatch(
        bytes.subarray(WORLD_STATE_HEADER_BYTES, WORLD_STATE_HEADER_BYTES + stateLength),
      );
      if (!state || state.count !== header.getUint32(20, true)) return null;
      const flags = header.getUint16(6, true);
      return {
        revision: header.getUint32(8, true),
        flags,
        full: (flags & WORLD_STATE_FLAGS.FULL) !== 0,
        state,
        sidecar: bytes.subarray(WORLD_STATE_HEADER_BYTES + stateLength),
      };
    }
  }

  // One-release bridge for direct RenderSnapshotNet datagrams.
  const state = viewRenderSnapshotNetBatch(bytes);
  return state
    ? { revision: 0, flags: WORLD_STATE_FLAGS.DELTA, full: false, state, sidecar: new Uint8Array() }
    : null;
}

export function encodeWorldSpawnBatch(
  spawns: readonly WorldSpawnInput[],
  revision = 0,
): Uint8Array {
  const strings = new StringTable();
  const names = spawns.map((spawn) => strings.add(spawn.name ?? ""));
  const modelKeys = spawns.map((spawn) => strings.add(spawn.modelKey ?? ""));
  const packet = createWorldStatePacket(
    spawns.length,
    strings.bytes(),
    WORLD_STATE_FLAGS.FULL,
    revision,
  );
  const state = packet.state;
  for (let index = 0; index < spawns.length; index++) {
    const spawn = spawns[index]!;
    const position = index * 3;
    const orientation = index * 4;
    const name = names[index]!;
    const modelKey = modelKeys[index]!;
    state.entityId[index] = spawn.spawnId >>> 0;
    state.stateKind[index] = spawn.kind ?? (spawn.isNpc === false ? 1 : 2);
    state.statePosition[position] = finite(spawn.x);
    state.statePosition[position + 1] = finite(spawn.y);
    state.statePosition[position + 2] = finite(spawn.z);
    state.stateOrientation[orientation + 3] = 1;
    state.stateNameOffset[index] = name.offset;
    state.stateNameLength[index] = name.length;
    state.stateArchetypeId[index] = finite(spawn.id) >>> 0;
    state.stateLevel[index] = finite(spawn.level) & 0xffff;
    state.stateRace[index] = finite(spawn.race) & 0xffff;
    state.stateGender[index] = finite(spawn.gender) & 0xff;
    state.stateClassId[index] = finite(spawn.charClass) & 0xff;
    state.stateBodyType[index] = finite(spawn.bodytype) & 0xffff;
    state.stateSize[index] = finite(spawn.size, 1);
    state.stateFace[index] = finite(spawn.face) & 0xff;
    state.stateHelm[index] = finite(spawn.equipment?.head ?? spawn.helm) & 0xff;
    state.stateChest[index] = finite(spawn.equipment?.chest ?? spawn.equipChest) & 0xffff;
    state.statePrimary[index] = finite(spawn.equipment?.primary) >>> 0;
    state.stateSecondary[index] = finite(spawn.equipment?.secondary) >>> 0;
    state.stateModelKeyOffset[index] = modelKey.offset;
    state.stateModelKeyLength[index] = modelKey.length;
    state.stateHeading[index] = finite(spawn.heading);
  }
  return packet.bytes;
}

export function readWorldStateString(
  sidecar: Uint8Array,
  offset: number,
  length: number,
): string {
  if (offset < 0 || length < 0 || offset + length > sidecar.byteLength) return "";
  return textDecoder.decode(sidecar.subarray(offset, offset + length));
}

export function readWorldSpawn(
  state: RenderSnapshotNetBatchView,
  sidecar: Uint8Array,
  index: number,
): WorldSpawnInput & { readonly isNpc: boolean } {
  if (index < 0 || index >= state.count) throw new RangeError("World state row is out of bounds");
  const position = index * 3;
  return {
    id: state.stateArchetypeId[index]!,
    spawnId: state.entityId[index]!,
    name: readWorldStateString(sidecar, state.stateNameOffset[index]!, state.stateNameLength[index]!),
    level: state.stateLevel[index]!,
    race: state.stateRace[index]!,
    gender: state.stateGender[index]!,
    modelKey: readWorldStateString(
      sidecar,
      state.stateModelKeyOffset[index]!,
      state.stateModelKeyLength[index]!,
    ) || null,
    size: state.stateSize[index]!,
    face: state.stateFace[index]!,
    helm: state.stateHelm[index]!,
    equipChest: state.stateChest[index]!,
    charClass: state.stateClassId[index]!,
    bodytype: state.stateBodyType[index]!,
    x: state.statePosition[position]!,
    y: state.statePosition[position + 1]!,
    z: state.statePosition[position + 2]!,
    heading: state.stateHeading[index]!,
    equipment: {
      head: state.stateHelm[index]!,
      chest: state.stateChest[index]!,
      primary: state.statePrimary[index]!,
      secondary: state.stateSecondary[index]!,
    },
    isNpc: state.stateKind[index] === 2,
  };
}

class StringTable {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  add(value: string): { offset: number; length: number } {
    const bytes = textEncoder.encode(value);
    const offset = this.length;
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
    return { offset, length: bytes.byteLength };
  }

  bytes(): Uint8Array {
    const result = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
