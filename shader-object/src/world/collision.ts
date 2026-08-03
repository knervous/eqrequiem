import type {
  ShadoWorldBounds,
  ShadoWorldCollisionDescriptor,
  ShadoWorldPrimitive,
} from './types';

const MAGIC = 0x4c434853; // "SHCL" in little-endian byte order.
const VERSION = 2;
const HEADER_BYTES = 56;
const DIRECTORY_ENTRY_BYTES = 48;
const WELD_SCALE = 10_000;
const DEFAULT_CHUNK_SIZE = 256;

export const ShadoCollisionFlags = {
  Terrain: 1 << 0,
  Architecture: 1 << 1,
  StaticObject: 1 << 2,
  PlayerSolid: 1 << 3,
  AlwaysResident: 1 << 4,
} as const;

export type ShadoWorldCollisionChunk = {
  id: number;
  x: number;
  z: number;
  flags: number;
  positions: Float32Array;
  indices: Uint32Array;
  bounds: ShadoWorldBounds;
};

export type ShadoWorldCollisionData = {
  chunks: ShadoWorldCollisionChunk[];
  chunkSize: number;
  sourceTriangleCount: number;
  vertexCount: number;
  triangleCount: number;
  bounds: ShadoWorldBounds;
};

export type ShadoWorldCollisionArtifact = ShadoWorldCollisionData & {
  bytes: Uint8Array;
  descriptor: Omit<ShadoWorldCollisionDescriptor, 'source'>;
};

/**
 * Produces deterministic chunk-local triangle soups in final Babylon world
 * coordinates. Triangles are conservatively copied to every XZ chunk their
 * bounds intersect so streamed collision cannot open cracks at chunk seams.
 */
export function encodeShadoWorldCollision(
  primitives: readonly ShadoWorldPrimitive[],
  options: { chunkSize?: number } = {}
): ShadoWorldCollisionArtifact {
  const chunkSize = positive(options.chunkSize ?? DEFAULT_CHUNK_SIZE, 'collision chunkSize');
  type SourceTriangle = {
    vertices: [[number, number, number], [number, number, number], [number, number, number]];
    flags: number;
  };
  const sourceTriangles: SourceTriangle[] = [];
  const triangles = new Set<string>();

  for (const primitive of primitives) {
    if (primitive.positions.length % 3 !== 0 || primitive.indices.length % 3 !== 0) {
      throw new Error(`Collision primitive '${primitive.name}' is not indexed triangle geometry`);
    }
    const vertex = (sourceIndex: number): [number, number, number] => {
      const offset = sourceIndex * 3;
      if (sourceIndex < 0 || offset + 2 >= primitive.positions.length) {
        throw new Error(`Collision primitive '${primitive.name}' has an invalid vertex index`);
      }
      const x = Number(primitive.positions[offset]);
      const y = Number(primitive.positions[offset + 1]);
      const z = Number(primitive.positions[offset + 2]);
      if (![x, y, z].every(Number.isFinite)) {
        throw new Error(`Collision primitive '${primitive.name}' has a non-finite position`);
      }
      return [x, y, z];
    };
    for (let index = 0; index < primitive.indices.length; index += 3) {
      const a = vertex(Number(primitive.indices[index]));
      const b = vertex(Number(primitive.indices[index + 1]));
      const c = vertex(Number(primitive.indices[index + 2]));
      const vertexKeys = [a, b, c].map(vertexKey);
      if (new Set(vertexKeys).size !== 3) continue;
      if (triangleAreaSquared(a, b, c) <= 1e-12) continue;
      const key = vertexKeys.sort().join('|');
      if (triangles.has(key)) continue;
      triangles.add(key);
      sourceTriangles.push({
        vertices: [a, b, c],
        flags:
          primitive.collisionFlags ??
          (ShadoCollisionFlags.Architecture | ShadoCollisionFlags.PlayerSolid),
      });
    }
  }
  if (!sourceTriangles.length) {
    throw new Error('World collision bake produced no non-degenerate triangles');
  }

  type ChunkBuilder = {
    x: number;
    z: number;
    flags: number;
    vertices: number[];
    indices: number[];
    welded: Map<string, number>;
  };
  const chunkBuilders = new Map<string, ChunkBuilder>();
  for (const triangle of sourceTriangles) {
    const xs = triangle.vertices.map(vertex => vertex[0]);
    const zs = triangle.vertices.map(vertex => vertex[2]);
    const minX = Math.floor(Math.min(...xs) / chunkSize);
    const maxX = Math.floor(Math.max(...xs) / chunkSize);
    const minZ = Math.floor(Math.min(...zs) / chunkSize);
    const maxZ = Math.floor(Math.max(...zs) / chunkSize);
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const key = chunkKey(x, z);
        let chunk = chunkBuilders.get(key);
        if (!chunk) {
          chunk = { x, z, flags: 0, vertices: [], indices: [], welded: new Map() };
          chunkBuilders.set(key, chunk);
        }
        chunk.flags |= triangle.flags;
        for (const position of triangle.vertices) {
          const positionKey = vertexKey(position);
          let target = chunk.welded.get(positionKey);
          if (target == null) {
            target = chunk.vertices.length / 3;
            chunk.welded.set(positionKey, target);
            chunk.vertices.push(...position);
          }
          chunk.indices.push(target);
        }
      }
    }
  }
  const chunks = [...chunkBuilders.values()]
    .sort((left, right) => left.x - right.x || left.z - right.z)
    .map((chunk, id): ShadoWorldCollisionChunk => {
      const positions = Float32Array.from(chunk.vertices);
      return {
        id,
        x: chunk.x,
        z: chunk.z,
        flags: chunk.flags,
        positions,
        indices: Uint32Array.from(chunk.indices),
        bounds: boundsOfPositions(positions),
      };
    });
  const sourcePositions = Float32Array.from(
    sourceTriangles.flatMap(triangle => triangle.vertices.flat())
  );
  const bounds = boundsOfPositions(sourcePositions);
  const vertexCount = chunks.reduce((sum, chunk) => sum + chunk.positions.length / 3, 0);
  const triangleCount = chunks.reduce((sum, chunk) => sum + chunk.indices.length / 3, 0);
  const directoryBytes = chunks.length * DIRECTORY_ENTRY_BYTES;
  const payloadBytes = chunks.reduce(
    (sum, chunk) => sum + chunk.positions.byteLength + chunk.indices.byteLength,
    0
  );
  const bytes = new Uint8Array(HEADER_BYTES + directoryBytes + payloadBytes);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setFloat32(8, chunkSize, true);
  view.setUint32(12, chunks.length, true);
  view.setUint32(16, sourceTriangles.length, true);
  view.setUint32(20, vertexCount, true);
  view.setUint32(24, triangleCount * 3, true);
  view.setUint32(28, directoryBytes, true);
  [...bounds.min, ...bounds.max].forEach((value, index) => {
    view.setFloat32(32 + index * 4, value, true);
  });
  let payloadOffset = HEADER_BYTES + directoryBytes;
  chunks.forEach((chunk, id) => {
    const entry = HEADER_BYTES + id * DIRECTORY_ENTRY_BYTES;
    view.setInt32(entry, chunk.x, true);
    view.setInt32(entry + 4, chunk.z, true);
    view.setUint32(entry + 8, chunk.flags, true);
    view.setUint32(entry + 12, chunk.positions.length / 3, true);
    view.setUint32(entry + 16, chunk.indices.length, true);
    view.setUint32(entry + 20, payloadOffset, true);
    [...chunk.bounds.min, ...chunk.bounds.max].forEach((value, index) => {
      view.setFloat32(entry + 24 + index * 4, value, true);
    });
    bytes.set(new Uint8Array(chunk.positions.buffer), payloadOffset);
    payloadOffset += chunk.positions.byteLength;
    bytes.set(new Uint8Array(chunk.indices.buffer), payloadOffset);
    payloadOffset += chunk.indices.byteLength;
  });

  return {
    bytes,
    chunks,
    chunkSize,
    sourceTriangleCount: sourceTriangles.length,
    vertexCount,
    triangleCount,
    bounds,
    descriptor: {
      format: 'shado-collision-v2',
      chunkSize,
      chunkCount: chunks.length,
      sourceTriangleCount: sourceTriangles.length,
      vertexCount,
      triangleCount,
      bounds,
      contentHash: fnv1a32Bytes(bytes),
    },
  };
}

/** Parses and validates the current collision artifact before physics creation. */
export function decodeShadoWorldCollision(
  bytes: Uint8Array,
  expected: ShadoWorldCollisionDescriptor
): ShadoWorldCollisionData {
  if (
    bytes.byteLength < HEADER_BYTES ||
    fnv1a32Bytes(bytes) !== expected.contentHash
  ) {
    throw new Error('Shado world collision artifact failed integrity validation');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkSize = view.getFloat32(8, true);
  const chunkCount = view.getUint32(12, true);
  const sourceTriangleCount = view.getUint32(16, true);
  const vertexCount = view.getUint32(20, true);
  const indexCount = view.getUint32(24, true);
  const directoryBytes = view.getUint32(28, true);
  if (
    view.getUint32(0, true) !== MAGIC ||
    view.getUint32(4, true) !== VERSION ||
    expected.format !== 'shado-collision-v2' ||
    chunkSize !== expected.chunkSize ||
    chunkCount !== expected.chunkCount ||
    sourceTriangleCount !== expected.sourceTriangleCount ||
    vertexCount !== expected.vertexCount ||
    indexCount !== expected.triangleCount * 3 ||
    indexCount % 3 !== 0 ||
    directoryBytes !== chunkCount * DIRECTORY_ENTRY_BYTES ||
    HEADER_BYTES + directoryBytes > bytes.byteLength
  ) {
    throw new Error('Shado world collision artifact has an incompatible layout');
  }
  const bounds: ShadoWorldBounds = {
    min: [view.getFloat32(32, true), view.getFloat32(36, true), view.getFloat32(40, true)],
    max: [view.getFloat32(44, true), view.getFloat32(48, true), view.getFloat32(52, true)],
  };
  if (!sameBounds(bounds, expected.bounds)) {
    throw new Error('Shado world collision artifact bounds do not match its package');
  }

  const chunks: ShadoWorldCollisionChunk[] = [];
  let parsedVertices = 0;
  let parsedIndices = 0;
  let expectedPayloadOffset = HEADER_BYTES + directoryBytes;
  for (let id = 0; id < chunkCount; id++) {
    const entry = HEADER_BYTES + id * DIRECTORY_ENTRY_BYTES;
    const chunkVertexCount = view.getUint32(entry + 12, true);
    const chunkIndexCount = view.getUint32(entry + 16, true);
    const payloadOffset = view.getUint32(entry + 20, true);
    const payloadEnd = payloadOffset + chunkVertexCount * 12 + chunkIndexCount * 4;
    if (
      chunkVertexCount === 0 ||
      chunkIndexCount === 0 ||
      chunkIndexCount % 3 !== 0 ||
      payloadOffset !== expectedPayloadOffset ||
      payloadEnd > bytes.byteLength
    ) {
      throw new Error('Shado world collision artifact has an invalid chunk directory');
    }
    const chunkBounds: ShadoWorldBounds = {
      min: [
        view.getFloat32(entry + 24, true),
        view.getFloat32(entry + 28, true),
        view.getFloat32(entry + 32, true),
      ],
      max: [
        view.getFloat32(entry + 36, true),
        view.getFloat32(entry + 40, true),
        view.getFloat32(entry + 44, true),
      ],
    };
    const positions = new Float32Array(chunkVertexCount * 3);
    let offset = payloadOffset;
    for (let index = 0; index < positions.length; index++, offset += 4) {
      positions[index] = view.getFloat32(offset, true);
    }
    const indices = new Uint32Array(chunkIndexCount);
    for (let index = 0; index < indices.length; index++, offset += 4) {
      const target = view.getUint32(offset, true);
      if (target >= chunkVertexCount) {
        throw new Error('Shado world collision artifact has an invalid chunk index');
      }
      indices[index] = target;
    }
    if (!sameBounds(boundsOfPositions(positions), chunkBounds)) {
      throw new Error('Shado world collision chunk bounds do not match its geometry');
    }
    chunks.push({
      id,
      x: view.getInt32(entry, true),
      z: view.getInt32(entry + 4, true),
      flags: view.getUint32(entry + 8, true),
      positions,
      indices,
      bounds: chunkBounds,
    });
    parsedVertices += chunkVertexCount;
    parsedIndices += chunkIndexCount;
    expectedPayloadOffset = payloadEnd;
  }
  if (
    parsedVertices !== vertexCount ||
    parsedIndices !== indexCount ||
    expectedPayloadOffset !== bytes.byteLength
  ) {
    throw new Error('Shado world collision artifact payload totals do not match its package');
  }
  return {
    chunks,
    chunkSize,
    sourceTriangleCount,
    vertexCount,
    triangleCount: indexCount / 3,
    bounds,
  };
}

/** Returns occupied chunk keys in a conservative square halo around a point. */
export function collisionResidencyKeys(
  position: readonly [number, number],
  chunkSize: number,
  radius: number
): string[] {
  const centerX = Math.floor(position[0] / positive(chunkSize, 'collision chunkSize'));
  const centerZ = Math.floor(position[1] / chunkSize);
  const extent = Math.max(0, Math.floor(radius));
  const keys: string[] = [];
  for (let z = centerZ - extent; z <= centerZ + extent; z++) {
    for (let x = centerX - extent; x <= centerX + extent; x++) keys.push(chunkKey(x, z));
  }
  return keys;
}

export function fnv1a32Bytes(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function boundsOfPositions(positions: ArrayLike<number>): ShadoWorldBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = Number(positions[index + axis]);
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }
  return { min, max };
}

function sameBounds(left: ShadoWorldBounds, right: ShadoWorldBounds): boolean {
  return [...left.min, ...left.max].every(
    (value, index) =>
      Math.abs(value - [...right.min, ...right.max][index]!) <= 1e-4
  );
}

function vertexKey(position: readonly number[]): string {
  return position.map(value => Math.round(value * WELD_SCALE)).join(',');
}

export function chunkKey(x: number, z: number): string {
  return `${x},${z}`;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
  return value;
}

function triangleAreaSquared(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[]
): number {
  const abx = b[0]! - a[0]!;
  const aby = b[1]! - a[1]!;
  const abz = b[2]! - a[2]!;
  const acx = c[0]! - a[0]!;
  const acy = c[1]! - a[1]!;
  const acz = c[2]! - a[2]!;
  const x = aby * acz - abz * acy;
  const y = abz * acx - abx * acz;
  const z = abx * acy - aby * acx;
  return x * x + y * y + z * z;
}
