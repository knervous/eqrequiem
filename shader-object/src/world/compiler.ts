import type {
  ShadoWorldCompileOptions,
  ShadoWorldPrimitive,
  ShadoWorldSpatialPackage,
  WorldVec3,
} from './types';
import { stampShadoWorldIntegrity, validateShadoWorldPackage } from './validation';
import { validateShadoWorldAuthoring } from './authoring';

const LEAF_BIT = 0x80000000;
const EMPTY_REF = 0xffffffff;

type Bounds = { min: WorldVec3; max: WorldVec3 };
type Triangle = {
  indices: [number, number, number];
  x: number;
  y: number;
  z: number;
  morton: number;
};
type Cluster = Bounds & {
  primitive: number;
  material: number;
  indices: number[];
  center: WorldVec3;
  radius: number;
  cone: [number, number, number, number];
  tileX: number;
  tileZ: number;
  cellId: number;
  packet: number;
  renderChunk: number;
};

export function compileShadoWorld(
  primitives: readonly ShadoWorldPrimitive[],
  options: ShadoWorldCompileOptions
): ShadoWorldSpatialPackage {
  if (!options.name) throw new Error('World compile requires a name');
  if (!primitives.length) throw new Error(`World '${options.name}' has no geometry primitives`);
  const authoring = options.authoring
    ? validateShadoWorldAuthoring(options.authoring, options.name)
    : undefined;
  const tileSize = positive(options.tileSize ?? 256, 'tileSize');
  const maxTriangles = Math.floor(
    positive(options.maxClusterTriangles ?? 128, 'maxClusterTriangles')
  );
  const worldBounds = boundsOfPrimitives(primitives);
  const originX = Math.floor(worldBounds.min[0] / tileSize) * tileSize;
  const originZ = Math.floor(worldBounds.min[2] / tileSize) * tileSize;
  const materials = [
    ...new Set(primitives.map(primitive => primitive.material || '__default')),
  ].sort();
  const materialIds = new Map(materials.map((name, index) => [name, index]));
  const clusters: Cluster[] = [];
  let triangleCount = 0;

  primitives.forEach((primitive, primitiveId) => {
    validatePrimitive(primitive);
    const triangles = trianglesForPrimitive(primitive);
    triangleCount += triangles.length;
    const primitiveBounds = boundsOfPositions(primitive.positions);
    for (const triangle of triangles) {
      triangle.morton = mortonForPoint(triangle.x, triangle.y, triangle.z, primitiveBounds);
    }
    triangles.sort((a, b) => a.morton - b.morton);
    for (let start = 0; start < triangles.length; start += maxTriangles) {
      const group = triangles.slice(start, start + maxTriangles);
      const indices = group.flatMap(triangle => triangle.indices);
      const bounds = boundsOfIndices(primitive.positions, indices);
      const center: WorldVec3 = [
        (bounds.min[0] + bounds.max[0]) * 0.5,
        (bounds.min[1] + bounds.max[1]) * 0.5,
        (bounds.min[2] + bounds.max[2]) * 0.5,
      ];
      const tileX = Math.floor((center[0] - originX) / tileSize);
      const tileZ = Math.floor((center[2] - originZ) / tileSize);
      clusters.push({
        ...bounds,
        primitive: primitiveId,
        material: materialIds.get(primitive.material || '__default')!,
        indices,
        center,
        radius: radiusOfIndices(primitive.positions, indices, center),
        cone: normalCone(primitive.positions, group),
        tileX,
        tileZ,
        cellId: 0,
        packet: 0,
        renderChunk: 0,
      });
    }
  });

  const tileKeys = [...new Set(clusters.map(cluster => `${cluster.tileX},${cluster.tileZ}`))]
    .map(key => key.split(',').map(Number) as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const tileIds = new Map(tileKeys.map((tile, id) => [`${tile[0]},${tile[1]}`, id]));
  for (const cluster of clusters)
    cluster.cellId = tileIds.get(`${cluster.tileX},${cluster.tileZ}`)!;
  clusters.sort(
    (a, b) => a.cellId - b.cellId || a.material - b.material || a.center[0] - b.center[0]
  );

  const packetCell: number[] = [];
  const packetMaterial: number[] = [];
  const packetFirst: number[] = [];
  const packetCount: number[] = [];
  for (let i = 0; i < clusters.length;) {
    const first = i;
    const cellId = clusters[i].cellId;
    const material = clusters[i].material;
    const packet = packetCell.length;
    while (
      i < clusters.length &&
      clusters[i].cellId === cellId &&
      clusters[i].material === material
    ) {
      clusters[i++].packet = packet;
    }
    packetCell.push(cellId);
    packetMaterial.push(material);
    packetFirst.push(first);
    packetCount.push(i - first);
  }

  const tileFirst = tileKeys.map(() => -1);
  const tileCount = tileKeys.map(() => 0);
  clusters.forEach((cluster, index) => {
    if (tileFirst[cluster.cellId] < 0) tileFirst[cluster.cellId] = index;
    tileCount[cluster.cellId]++;
  });
  const cellBounds = tileKeys.map((_, cell) =>
    unionBounds(clusters.filter(cluster => cluster.cellId === cell))
  );
  const compiledObjects = compileObjects(authoring, tileIds, originX, originZ, tileSize);

  const clusterIndices: number[] = [];
  const firstIndex: number[] = [];
  const indexCount: number[] = [];
  for (const cluster of clusters) {
    firstIndex.push(clusterIndices.length);
    indexCount.push(cluster.indices.length);
    clusterIndices.push(...cluster.indices);
  }
  const renderChunkClusters: number[] = [];
  const renderChunkPrimitive: number[] = [];
  const renderChunkMaterial: number[] = [];
  const renderChunkFirst: number[] = [];
  const renderChunkCount: number[] = [];
  const clustersByPrimitive = new Map<number, number[]>();
  clusters.forEach((cluster, id) => {
    const ids = clustersByPrimitive.get(cluster.primitive) ?? [];
    ids.push(id);
    clustersByPrimitive.set(cluster.primitive, ids);
  });
  for (const primitive of [...clustersByPrimitive.keys()].sort((a, b) => a - b)) {
    const ids = clustersByPrimitive.get(primitive)!;
    const chunk = renderChunkPrimitive.length;
    renderChunkPrimitive.push(primitive);
    renderChunkMaterial.push(clusters[ids[0]].material);
    renderChunkFirst.push(renderChunkClusters.length);
    renderChunkCount.push(ids.length);
    renderChunkClusters.push(...ids);
    for (const id of ids) clusters[id].renderChunk = chunk;
  }
  const bvh = buildQuantizedBvh(clusters, worldBounds);

  const wordsPerRow = Math.ceil(tileKeys.length / 32);
  const pvsWords = Array.from({ length: tileKeys.length * wordsPerRow }, () => 0);
  for (let row = 0; row < tileKeys.length; row++) {
    for (let cell = 0; cell < tileKeys.length; cell++) {
      const word = row * wordsPerRow + (cell >>> 5);
      pvsWords[word] = (pvsWords[word] | (1 << (cell & 31))) >>> 0;
    }
  }
  const world: ShadoWorldSpatialPackage = {
    kind: 'shado.world.spatial',
    version: 3,
    name: options.name,
    coordinateSystem: 'babylon-y-up',
    source: options.source,
    bounds: worldBounds,
    triangleCount,
    materials,
    primitives: primitives.map(primitive => ({
      name: primitive.name,
      material: materialIds.get(primitive.material || '__default')!,
      vertexCount: primitive.positions.length / 3,
    })),
    clusterIndices,
    renderChunkClusters,
    clusters: {
      centerX: clusters.map(cluster => cluster.center[0]),
      centerY: clusters.map(cluster => cluster.center[1]),
      centerZ: clusters.map(cluster => cluster.center[2]),
      radius: clusters.map(cluster => cluster.radius),
      coneX: clusters.map(cluster => cluster.cone[0]),
      coneY: clusters.map(cluster => cluster.cone[1]),
      coneZ: clusters.map(cluster => cluster.cone[2]),
      coneCutoff: clusters.map(cluster => cluster.cone[3]),
      firstIndex,
      indexCount,
      primitive: clusters.map(cluster => cluster.primitive),
      materialPacket: clusters.map(cluster => cluster.packet),
      renderChunk: clusters.map(cluster => cluster.renderChunk),
      lodParent: clusters.map(() => -1),
      cellId: clusters.map(cluster => cluster.cellId),
    },
    packets: {
      cellId: packetCell,
      material: packetMaterial,
      firstCluster: packetFirst,
      clusterCount: packetCount,
    },
    renderChunks: {
      primitive: renderChunkPrimitive,
      material: renderChunkMaterial,
      firstClusterRef: renderChunkFirst,
      clusterRefCount: renderChunkCount,
    },
    cells: {
      kind: tileKeys.map(() => 0),
      minX: cellBounds.map(bounds => bounds.min[0]),
      minY: cellBounds.map(bounds => bounds.min[1]),
      minZ: cellBounds.map(bounds => bounds.min[2]),
      maxX: cellBounds.map(bounds => bounds.max[0]),
      maxY: cellBounds.map(bounds => bounds.max[1]),
      maxZ: cellBounds.map(bounds => bounds.max[2]),
      firstCluster: tileFirst,
      clusterCount: tileCount,
      phaseMask: tileKeys.map(() => 0xffffffff),
    },
    portals: {
      fromCell: [],
      toCell: [],
      dynamicStateId: [],
      flags: [],
    },
    regions: {
      id: authoring?.regions.map(region => region.id) ?? [],
      name: authoring?.regions.map(region => region.name) ?? [],
      kind: authoring?.regions.map(region => region.kind) ?? [],
      enabled: authoring?.regions.map(region => Number(region.enabled)) ?? [],
      centerX: authoring?.regions.map(region => region.center[0]) ?? [],
      centerY: authoring?.regions.map(region => region.center[1]) ?? [],
      centerZ: authoring?.regions.map(region => region.center[2]) ?? [],
      sizeX: authoring?.regions.map(region => region.size[0]) ?? [],
      sizeY: authoring?.regions.map(region => region.size[1]) ?? [],
      sizeZ: authoring?.regions.map(region => region.size[2]) ?? [],
      phaseMask: authoring?.regions.map(region => region.phaseMask) ?? [],
      tags: authoring?.regions.map(region => [...region.tags]) ?? [],
      metadata: authoring?.regions.map(region => ({ ...region.metadata })) ?? [],
    },
    objects: compiledObjects,
    tiles: {
      size: tileSize,
      originX,
      originZ,
      x: tileKeys.map(tile => tile[0]),
      z: tileKeys.map(tile => tile[1]),
      firstCluster: tileFirst,
      clusterCount: tileCount,
    },
    // With no trustworthy visual portal topology in the source GLB, every outdoor
    // cell remains a conservative candidate. Loaded/distance masks do the pruning.
    pvs: { wordsPerRow, words: pvsWords },
    integrity: { algorithm: 'fnv1a32-layout', layoutHash: '' },
    bvh,
  };
  stampShadoWorldIntegrity(world);
  validateShadoWorldPackage(world);
  return world;
}

function compileObjects(
  authoring: ShadoWorldCompileOptions['authoring'],
  tileIds: ReadonlyMap<string, number>,
  originX: number,
  originZ: number,
  tileSize: number
): NonNullable<ShadoWorldSpatialPackage['objects']> {
  const prototypes = authoring?.objects.prototypes ?? [];
  const stamps = authoring?.objects.stamps ?? [];
  const prototypeIds = new Map(prototypes.map((prototype, index) => [prototype.id, index]));
  const stampPrototype = stamps.map(stamp => prototypeIds.get(stamp.prototype) ?? -1);
  const prototypeStampRefs: number[] = [];
  const firstStampRef: number[] = [];
  const stampRefCount: number[] = [];
  for (let prototype = 0; prototype < prototypes.length; prototype++) {
    firstStampRef.push(prototypeStampRefs.length);
    stamps.forEach((_, stamp) => {
      if (stampPrototype[stamp] === prototype) prototypeStampRefs.push(stamp);
    });
    stampRefCount.push(prototypeStampRefs.length - firstStampRef[prototype]);
  }
  const cellId = stamps.map(stamp => {
    const tileX = Math.floor((stamp.position[0] - originX) / tileSize);
    const tileZ = Math.floor((stamp.position[2] - originZ) / tileSize);
    return tileIds.get(`${tileX},${tileZ}`) ?? -1;
  });
  return {
    prototypes: {
      id: prototypes.map(prototype => prototype.id),
      source: prototypes.map(prototype => prototype.source),
      boundsRadius: prototypes.map(prototype => prototype.boundsRadius),
      firstStampRef,
      stampRefCount,
      metadata: prototypes.map(prototype => ({ ...prototype.metadata })),
    },
    prototypeStampRefs,
    stamps: {
      id: stamps.map(stamp => stamp.id),
      prototype: stampPrototype,
      enabled: stamps.map(stamp => Number(stamp.enabled)),
      positionX: stamps.map(stamp => stamp.position[0]),
      positionY: stamps.map(stamp => stamp.position[1]),
      positionZ: stamps.map(stamp => stamp.position[2]),
      rotationX: stamps.map(stamp => stamp.rotationDegrees[0]),
      rotationY: stamps.map(stamp => stamp.rotationDegrees[1]),
      rotationZ: stamps.map(stamp => stamp.rotationDegrees[2]),
      scaleX: stamps.map(stamp => stamp.scale[0]),
      scaleY: stamps.map(stamp => stamp.scale[1]),
      scaleZ: stamps.map(stamp => stamp.scale[2]),
      radius: stamps.map((stamp, index) =>
        prototypes[stampPrototype[index]].boundsRadius * Math.max(...stamp.scale)
      ),
      cellId,
      phaseMask: stamps.map(stamp => stamp.phaseMask),
      tags: stamps.map(stamp => [...stamp.tags]),
      metadata: stamps.map(stamp => ({ ...stamp.metadata })),
    },
  };
}

/** JavaScript reference query used as the correctness oracle for a WASM reducer. */
export function queryShadoWorldFrustum(
  world: ShadoWorldSpatialPackage,
  planes: ArrayLike<number>
): Uint32Array {
  if (planes.length < 24) throw new Error('A world frustum query requires six vec4 planes');
  if (!world.bvh.nodeCount) return new Uint32Array();
  const out: number[] = [];
  const stack = [world.bvh.root];
  while (stack.length) {
    const node = stack.pop()!;
    for (let lane = 0; lane < 4; lane++) {
      const slot = node * 4 + lane;
      const ref = world.bvh.childRef[slot] >>> 0;
      if (ref === EMPTY_REF) continue;
      const bounds = decodeChildBounds(world, slot);
      if (!aabbInFrustum(bounds, planes)) continue;
      if (ref & LEAF_BIT) out.push(ref & ~LEAF_BIT);
      else stack.push(ref);
    }
  }
  out.sort((a, b) => a - b);
  return Uint32Array.from(out);
}

function buildQuantizedBvh(clusters: Cluster[], bounds: Bounds): ShadoWorldSpatialPackage['bvh'] {
  type NodeChild = { bounds: Bounds; ref: number };
  const nodes: NodeChild[][] = [];
  const build = (ids: number[]): number => {
    const nodeIndex = nodes.length;
    nodes.push([]);
    if (ids.length <= 4) {
      nodes[nodeIndex] = ids.map(id => ({ bounds: clusters[id], ref: (LEAF_BIT | id) >>> 0 }));
      return nodeIndex;
    }
    const aggregate = unionBounds(ids.map(id => clusters[id]));
    const extent = aggregate.max.map((value, axis) => value - aggregate.min[axis]);
    const axis =
      extent[1] > extent[0] && extent[1] >= extent[2] ? 1 : extent[2] > extent[0] ? 2 : 0;
    ids.sort((a, b) => clusters[a].center[axis] - clusters[b].center[axis]);
    const groupSize = Math.ceil(ids.length / 4);
    const children: NodeChild[] = [];
    for (let start = 0; start < ids.length; start += groupSize) {
      const group = ids.slice(start, start + groupSize);
      children.push({ bounds: unionBounds(group.map(id => clusters[id])), ref: build(group) });
    }
    nodes[nodeIndex] = children;
    return nodeIndex;
  };
  const root = clusters.length ? build(clusters.map((_, index) => index)) : -1;
  const min = bounds.min;
  const extent = bounds.max.map((value, axis) => Math.max(1e-6, value - min[axis])) as WorldVec3;
  const arrays = {
    childMinX: [] as number[],
    childMinY: [] as number[],
    childMinZ: [] as number[],
    childMaxX: [] as number[],
    childMaxY: [] as number[],
    childMaxZ: [] as number[],
    childRef: [] as number[],
  };
  for (const children of nodes) {
    for (let lane = 0; lane < 4; lane++) {
      const child = children[lane];
      if (!child) {
        arrays.childMinX.push(0);
        arrays.childMinY.push(0);
        arrays.childMinZ.push(0);
        arrays.childMaxX.push(0);
        arrays.childMaxY.push(0);
        arrays.childMaxZ.push(0);
        arrays.childRef.push(EMPTY_REF);
        continue;
      }
      arrays.childMinX.push(quantizeFloor(child.bounds.min[0], min[0], extent[0]));
      arrays.childMinY.push(quantizeFloor(child.bounds.min[1], min[1], extent[1]));
      arrays.childMinZ.push(quantizeFloor(child.bounds.min[2], min[2], extent[2]));
      arrays.childMaxX.push(quantizeCeil(child.bounds.max[0], min[0], extent[0]));
      arrays.childMaxY.push(quantizeCeil(child.bounds.max[1], min[1], extent[1]));
      arrays.childMaxZ.push(quantizeCeil(child.bounds.max[2], min[2], extent[2]));
      arrays.childRef.push(child.ref >>> 0);
    }
  }
  return {
    root,
    nodeCount: nodes.length,
    quantizationMin: [...min],
    quantizationExtent: extent,
    ...arrays,
  };
}

function decodeChildBounds(world: ShadoWorldSpatialPackage, slot: number): Bounds {
  const bvh = world.bvh;
  const decode = (q: number, axis: number) =>
    bvh.quantizationMin[axis] + (q / 65535) * bvh.quantizationExtent[axis];
  return {
    min: [
      decode(bvh.childMinX[slot], 0),
      decode(bvh.childMinY[slot], 1),
      decode(bvh.childMinZ[slot], 2),
    ],
    max: [
      decode(bvh.childMaxX[slot], 0),
      decode(bvh.childMaxY[slot], 1),
      decode(bvh.childMaxZ[slot], 2),
    ],
  };
}

function aabbInFrustum(bounds: Bounds, planes: ArrayLike<number>): boolean {
  for (let plane = 0; plane < 6; plane++) {
    const offset = plane * 4;
    const nx = planes[offset],
      ny = planes[offset + 1],
      nz = planes[offset + 2];
    const x = nx >= 0 ? bounds.max[0] : bounds.min[0];
    const y = ny >= 0 ? bounds.max[1] : bounds.min[1];
    const z = nz >= 0 ? bounds.max[2] : bounds.min[2];
    if (nx * x + ny * y + nz * z + planes[offset + 3] < 0) return false;
  }
  return true;
}

function trianglesForPrimitive(primitive: ShadoWorldPrimitive): Triangle[] {
  const out: Triangle[] = [];
  for (let i = 0; i < primitive.indices.length; i += 3) {
    const a = Number(primitive.indices[i]),
      b = Number(primitive.indices[i + 1]),
      c = Number(primitive.indices[i + 2]);
    out.push({
      indices: [a, b, c],
      x: centroidAxis(primitive.positions, a, b, c, 0),
      y: centroidAxis(primitive.positions, a, b, c, 1),
      z: centroidAxis(primitive.positions, a, b, c, 2),
      morton: 0,
    });
  }
  return out;
}

function normalCone(
  positions: ArrayLike<number>,
  triangles: Triangle[]
): [number, number, number, number] {
  const normals: WorldVec3[] = [];
  let sx = 0,
    sy = 0,
    sz = 0;
  for (const triangle of triangles) {
    const [a, b, c] = triangle.indices;
    const ab: WorldVec3 = [
      positions[b * 3] - positions[a * 3],
      positions[b * 3 + 1] - positions[a * 3 + 1],
      positions[b * 3 + 2] - positions[a * 3 + 2],
    ];
    const ac: WorldVec3 = [
      positions[c * 3] - positions[a * 3],
      positions[c * 3 + 1] - positions[a * 3 + 1],
      positions[c * 3 + 2] - positions[a * 3 + 2],
    ];
    const normal = normalize([
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]);
    if (!normal) continue;
    normals.push(normal);
    sx += normal[0];
    sy += normal[1];
    sz += normal[2];
  }
  const axis = normalize([sx, sy, sz]);
  if (!axis || !normals.length) return [0, 0, 0, -1];
  let cutoff = 1;
  for (const normal of normals) cutoff = Math.min(cutoff, dot(axis, normal));
  return [axis[0], axis[1], axis[2], cutoff];
}

function validatePrimitive(primitive: ShadoWorldPrimitive) {
  if (primitive.positions.length % 3)
    throw new Error(`Primitive '${primitive.name}' positions are not vec3 data`);
  if (primitive.indices.length % 3)
    throw new Error(`Primitive '${primitive.name}' indices are not triangles`);
  const vertices = primitive.positions.length / 3;
  for (let i = 0; i < primitive.indices.length; i++) {
    const index = Number(primitive.indices[i]);
    if (!Number.isInteger(index) || index < 0 || index >= vertices)
      throw new Error(`Primitive '${primitive.name}' has invalid vertex index ${index}`);
  }
}

function boundsOfPrimitives(primitives: readonly ShadoWorldPrimitive[]): Bounds {
  return unionBounds(primitives.map(primitive => boundsOfPositions(primitive.positions)));
}
function boundsOfPositions(positions: ArrayLike<number>): Bounds {
  const bounds: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (let i = 0; i < positions.length; i += 3)
    include(bounds, Number(positions[i]), Number(positions[i + 1]), Number(positions[i + 2]));
  return bounds;
}
function boundsOfIndices(positions: ArrayLike<number>, indices: number[]): Bounds {
  const bounds: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const index of indices)
    include(
      bounds,
      Number(positions[index * 3]),
      Number(positions[index * 3 + 1]),
      Number(positions[index * 3 + 2])
    );
  return bounds;
}
function unionBounds(boundsList: Bounds[]): Bounds {
  const out: Bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const bounds of boundsList) {
    include(out, ...bounds.min);
    include(out, ...bounds.max);
  }
  return out;
}
function include(bounds: Bounds, x: number, y: number, z: number) {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}
function radiusOfIndices(
  positions: ArrayLike<number>,
  indices: number[],
  center: WorldVec3
): number {
  let radiusSq = 0;
  for (const index of indices) {
    const dx = positions[index * 3] - center[0],
      dy = positions[index * 3 + 1] - center[1],
      dz = positions[index * 3 + 2] - center[2];
    radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(radiusSq);
}
function centroidAxis(p: ArrayLike<number>, a: number, b: number, c: number, axis: number) {
  return (Number(p[a * 3 + axis]) + Number(p[b * 3 + axis]) + Number(p[c * 3 + axis])) / 3;
}
function mortonForPoint(x: number, y: number, z: number, bounds: Bounds) {
  const q = (value: number, axis: number) =>
    Math.max(
      0,
      Math.min(
        1023,
        Math.floor(
          ((value - bounds.min[axis]) / Math.max(1e-9, bounds.max[axis] - bounds.min[axis])) * 1023
        )
      )
    );
  return mortonPart(q(x, 0)) | (mortonPart(q(y, 1)) << 1) | (mortonPart(q(z, 2)) << 2);
}
function mortonPart(value: number) {
  let x = value & 0x3ff;
  x = (x | (x << 16)) & 0x030000ff;
  x = (x | (x << 8)) & 0x0300f00f;
  x = (x | (x << 4)) & 0x030c30c3;
  return (x | (x << 2)) & 0x09249249;
}
function normalize(v: WorldVec3): WorldVec3 | undefined {
  const length = Math.hypot(...v);
  return length > 1e-9 ? [v[0] / length, v[1] / length, v[2] / length] : undefined;
}
function dot(a: WorldVec3, b: WorldVec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function quantizeFloor(value: number, min: number, extent: number) {
  return Math.max(0, Math.min(65535, Math.floor(((value - min) / extent) * 65535)));
}
function quantizeCeil(value: number, min: number, extent: number) {
  return Math.max(0, Math.min(65535, Math.ceil(((value - min) / extent) * 65535)));
}
function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive`);
  return value;
}
