import type {
  ShadoWorldBounds,
  ShadoWorldCollisionDescriptor,
  ShadoWorldPrimitive,
} from './types';

const MAGIC = 0x4c434853; // "SHCL" in little-endian byte order.
const VERSION = 1;
const HEADER_BYTES = 40;
const WELD_SCALE = 10_000;

export type ShadoWorldCollisionData = {
  positions: Float32Array;
  indices: Uint32Array;
  bounds: ShadoWorldBounds;
};

export type ShadoWorldCollisionArtifact = ShadoWorldCollisionData & {
  bytes: Uint8Array;
  descriptor: Omit<ShadoWorldCollisionDescriptor, 'source'>;
};

/**
 * Produces one deterministic, welded triangle soup in final Babylon world
 * coordinates. Render materials and source-node structure are intentionally
 * absent from the runtime collision product.
 */
export function encodeShadoWorldCollision(
  primitives: readonly ShadoWorldPrimitive[]
): ShadoWorldCollisionArtifact {
  const vertices: number[] = [];
  const indices: number[] = [];
  const welded = new Map<string, number>();
  const triangles = new Set<string>();

  for (const primitive of primitives) {
    if (primitive.positions.length % 3 !== 0 || primitive.indices.length % 3 !== 0) {
      throw new Error(`Collision primitive '${primitive.name}' is not indexed triangle geometry`);
    }
    const remap = new Map<number, number>();
    const vertex = (sourceIndex: number): number => {
      const existing = remap.get(sourceIndex);
      if (existing != null) return existing;
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
      const key = `${Math.round(x * WELD_SCALE)},${Math.round(y * WELD_SCALE)},${Math.round(z * WELD_SCALE)}`;
      let target = welded.get(key);
      if (target == null) {
        target = vertices.length / 3;
        welded.set(key, target);
        vertices.push(x, y, z);
      }
      remap.set(sourceIndex, target);
      return target;
    };
    for (let index = 0; index < primitive.indices.length; index += 3) {
      const a = vertex(Number(primitive.indices[index]));
      const b = vertex(Number(primitive.indices[index + 1]));
      const c = vertex(Number(primitive.indices[index + 2]));
      if (a === b || b === c || c === a) continue;
      const key = [a, b, c].sort((left, right) => left - right).join(',');
      if (triangles.has(key)) continue;
      triangles.add(key);
      indices.push(a, b, c);
    }
  }
  if (!vertices.length || !indices.length) {
    throw new Error('World collision bake produced no non-degenerate triangles');
  }

  const positions = Float32Array.from(vertices);
  const triangleIndices = Uint32Array.from(indices);
  const bounds = boundsOfPositions(positions);
  const bytes = new Uint8Array(
    HEADER_BYTES + positions.byteLength + triangleIndices.byteLength
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, VERSION, true);
  view.setUint32(8, positions.length / 3, true);
  view.setUint32(12, triangleIndices.length, true);
  [...bounds.min, ...bounds.max].forEach((value, index) => {
    view.setFloat32(16 + index * 4, value, true);
  });
  bytes.set(new Uint8Array(positions.buffer), HEADER_BYTES);
  bytes.set(
    new Uint8Array(triangleIndices.buffer),
    HEADER_BYTES + positions.byteLength
  );

  return {
    bytes,
    positions,
    indices: triangleIndices,
    bounds,
    descriptor: {
      format: 'shado-collision-v1',
      vertexCount: positions.length / 3,
      triangleCount: triangleIndices.length / 3,
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
  const vertexCount = view.getUint32(8, true);
  const indexCount = view.getUint32(12, true);
  const expectedLength = HEADER_BYTES + vertexCount * 12 + indexCount * 4;
  if (
    view.getUint32(0, true) !== MAGIC ||
    view.getUint32(4, true) !== VERSION ||
    expected.format !== 'shado-collision-v1' ||
    vertexCount !== expected.vertexCount ||
    indexCount !== expected.triangleCount * 3 ||
    indexCount % 3 !== 0 ||
    bytes.byteLength !== expectedLength
  ) {
    throw new Error('Shado world collision artifact has an incompatible layout');
  }
  const bounds: ShadoWorldBounds = {
    min: [view.getFloat32(16, true), view.getFloat32(20, true), view.getFloat32(24, true)],
    max: [view.getFloat32(28, true), view.getFloat32(32, true), view.getFloat32(36, true)],
  };
  if (!sameBounds(bounds, expected.bounds)) {
    throw new Error('Shado world collision artifact bounds do not match its package');
  }

  // Copy through DataView so callers are independent of the input's alignment.
  const positions = new Float32Array(vertexCount * 3);
  let offset = HEADER_BYTES;
  for (let index = 0; index < positions.length; index++, offset += 4) {
    positions[index] = view.getFloat32(offset, true);
  }
  const indices = new Uint32Array(indexCount);
  for (let index = 0; index < indices.length; index++, offset += 4) {
    indices[index] = view.getUint32(offset, true);
  }
  return { positions, indices, bounds };
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
