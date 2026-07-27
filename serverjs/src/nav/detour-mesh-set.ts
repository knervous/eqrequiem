const RECAST_MESH_SET_MAGIC = 0x4d534554;
const RECAST_MESH_SET_VERSION = 1;
const DETOUR_NAV_MESH_MAGIC = 0x444e4156;
const DETOUR_NAV_MESH_VERSION = 7;
const MESH_SET_HEADER_BYTES = 40;

export interface PreparedDetourMeshSet {
  readonly bytes: Uint8Array;
  readonly tileCount: number;
  readonly normalizedLegacyFormat: boolean;
}

/**
 * Validates a standard Recast MSET or repairs Requiem's legacy size-only tile
 * stream. The legacy asset stores [dataSize, tileData] and writes maxTiles in
 * the header count; standard Detour expects [tileRef, dataSize, tileData].
 */
export function prepareDetourMeshSet(source: Uint8Array): PreparedDetourMeshSet {
  if (source.byteLength < MESH_SET_HEADER_BYTES) {
    throw new Error("Detour mesh set is shorter than its header");
  }
  const view = dataView(source);
  if (view.getUint32(0, true) !== RECAST_MESH_SET_MAGIC) {
    throw new Error("Detour mesh set has an invalid MSET magic");
  }
  if (view.getUint32(4, true) !== RECAST_MESH_SET_VERSION) {
    throw new Error("Detour mesh set has an unsupported version");
  }

  const declaredTileCount = view.getUint32(8, true);
  if (declaredTileCount === 0 && source.byteLength === MESH_SET_HEADER_BYTES) {
    return { bytes: source, tileCount: 0, normalizedLegacyFormat: false };
  }

  const isLegacy =
    source.byteLength >= MESH_SET_HEADER_BYTES + 8
    && view.getUint32(MESH_SET_HEADER_BYTES + 4, true) === DETOUR_NAV_MESH_MAGIC;
  if (!isLegacy) {
    validateStandardTiles(source, declaredTileCount);
    return {
      bytes: source,
      tileCount: declaredTileCount,
      normalizedLegacyFormat: false,
    };
  }

  const tiles = readLegacyTiles(source);
  const maxTiles = view.getUint32(32, true);
  const maxPolys = view.getUint32(36, true);
  if (tiles.length > maxTiles) {
    throw new Error("Legacy Detour mesh contains more tiles than its capacity");
  }
  const tileBits = integerLog2(nextPowerOfTwo(maxTiles));
  const polyBits = integerLog2(nextPowerOfTwo(maxPolys));
  if (tileBits + polyBits >= 32) {
    throw new Error("Detour tile references do not fit in 32 bits");
  }
  const salt = 2 ** (tileBits + polyBits);
  const output = new Uint8Array(source.byteLength + tiles.length * 4);
  output.set(source.subarray(0, MESH_SET_HEADER_BYTES));
  const outputView = dataView(output);
  outputView.setUint32(8, tiles.length, true);
  let outputOffset = MESH_SET_HEADER_BYTES;
  for (let index = 0; index < tiles.length; index++) {
    const tile = tiles[index]!;
    const tileRef = salt + index * 2 ** polyBits;
    outputView.setUint32(outputOffset, tileRef, true);
    outputView.setUint32(outputOffset + 4, tile.byteLength, true);
    output.set(tile, outputOffset + 8);
    outputOffset += 8 + tile.byteLength;
  }
  return {
    bytes: output,
    tileCount: tiles.length,
    normalizedLegacyFormat: true,
  };
}

function validateStandardTiles(source: Uint8Array, tileCount: number): void {
  const view = dataView(source);
  let offset = MESH_SET_HEADER_BYTES;
  for (let index = 0; index < tileCount; index++) {
    if (offset + 12 > source.byteLength) {
      throw new Error("Detour mesh set ends before its declared tiles");
    }
    const tileRef = view.getUint32(offset, true);
    const dataSize = view.getUint32(offset + 4, true);
    if (tileRef === 0 || dataSize === 0 || offset + 8 + dataSize > source.byteLength) {
      throw new Error("Detour mesh set contains an invalid tile header");
    }
    validateTile(view, offset + 8);
    offset += 8 + dataSize;
  }
  if (offset !== source.byteLength) {
    throw new Error("Detour mesh set has trailing or undeclared tile bytes");
  }
}

function readLegacyTiles(source: Uint8Array): Uint8Array[] {
  const view = dataView(source);
  const tiles: Uint8Array[] = [];
  let offset = MESH_SET_HEADER_BYTES;
  while (offset < source.byteLength) {
    if (offset + 8 > source.byteLength) {
      throw new Error("Legacy Detour mesh ends inside a tile header");
    }
    const dataSize = view.getUint32(offset, true);
    const dataOffset = offset + 4;
    if (dataSize < 8 || dataOffset + dataSize > source.byteLength) {
      throw new Error("Legacy Detour mesh contains an invalid tile size");
    }
    validateTile(view, dataOffset);
    tiles.push(source.subarray(dataOffset, dataOffset + dataSize));
    offset = dataOffset + dataSize;
  }
  return tiles;
}

function validateTile(view: DataView, offset: number): void {
  if (
    view.getUint32(offset, true) !== DETOUR_NAV_MESH_MAGIC
    || view.getUint32(offset + 4, true) !== DETOUR_NAV_MESH_VERSION
  ) {
    throw new Error("Detour mesh set contains an incompatible tile");
  }
}

function nextPowerOfTwo(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Detour mesh capacity must be a positive integer");
  }
  return 2 ** Math.ceil(Math.log2(value));
}

function integerLog2(value: number): number {
  return Math.round(Math.log2(value));
}

function dataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
