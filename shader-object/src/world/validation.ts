import type { ShadoWorldSpatialPackage } from './types';

const CELL_FIELDS = [
  'kind', 'minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ',
  'firstCluster', 'clusterCount', 'phaseMask',
] as const;

/** Deterministic checksum for the package's index topology and reducer-facing layout. */
export function computeShadoWorldLayoutHash(world: ShadoWorldSpatialPackage): string {
  let hash = 0x811c9dc5;
  const feed = (value: number) => {
    let word = value >>> 0;
    for (let byte = 0; byte < 4; byte++) {
      hash ^= word & 0xff;
      hash = Math.imul(hash, 0x01000193) >>> 0;
      word >>>= 8;
    }
  };
  const feedArray = (values: ArrayLike<number>) => {
    feed(values.length);
    for (let i = 0; i < values.length; i++) feed(Number(values[i]));
  };

  feed(world.version);
  feed(world.triangleCount);
  [
    world.clusterIndices,
    world.renderChunkClusters,
    world.clusters.firstIndex,
    world.clusters.indexCount,
    world.clusters.primitive,
    world.clusters.materialPacket,
    world.clusters.renderChunk,
    world.clusters.cellId,
    world.packets.cellId,
    world.packets.firstCluster,
    world.packets.clusterCount,
    world.renderChunks.primitive,
    world.renderChunks.firstClusterRef,
    world.renderChunks.clusterRefCount,
    world.tiles.x,
    world.tiles.z,
    world.cells.kind,
    world.cells.firstCluster,
    world.cells.clusterCount,
    world.cells.phaseMask,
    world.portals.fromCell,
    world.portals.toCell,
    world.portals.dynamicStateId,
    world.portals.flags,
    world.regions.enabled,
    world.regions.phaseMask,
    world.objects?.prototypes.firstStampRef ?? [],
    world.objects?.prototypes.stampRefCount ?? [],
    world.objects?.prototypeStampRefs ?? [],
    world.objects?.stamps.prototype ?? [],
    world.objects?.stamps.enabled ?? [],
    world.objects?.stamps.cellId ?? [],
    world.objects?.stamps.phaseMask ?? [],
    world.pvs?.words ?? [],
    world.bvh.childRef,
  ].forEach(feedArray);
  return hash.toString(16).padStart(8, '0');
}

export function stampShadoWorldIntegrity(world: ShadoWorldSpatialPackage): void {
  world.integrity = {
    algorithm: 'fnv1a32-layout',
    layoutHash: computeShadoWorldLayoutHash(world),
  };
}

/** Rejects truncated, stale, or internally inconsistent spatial packages before use. */
export function validateShadoWorldPackage(world: ShadoWorldSpatialPackage): void {
  if (
    world.kind !== 'shado.world.spatial' ||
    world.version !== 3 ||
    world.coordinateSystem !== 'babylon-y-up'
  ) {
    throw new Error('Unsupported Shado world spatial package');
  }
  const clusterCount = world.clusters.radius.length;
  const cellCount = world.cells.kind.length;
  const sameLength = (label: string, expected: number, values: { length: number }) => {
    if (values.length !== expected) {
      throw new Error(`Invalid Shado world ${label}: expected ${expected}, got ${values.length}`);
    }
  };
  [
    world.clusters.centerX, world.clusters.centerY, world.clusters.centerZ,
    world.clusters.coneX, world.clusters.coneY, world.clusters.coneZ,
    world.clusters.coneCutoff, world.clusters.firstIndex, world.clusters.indexCount,
    world.clusters.primitive, world.clusters.materialPacket, world.clusters.renderChunk,
    world.clusters.lodParent, world.clusters.cellId,
  ].forEach(values => sameLength('cluster SoA', clusterCount, values));
  CELL_FIELDS.forEach(field => sameLength(`cell.${field}`, cellCount, world.cells[field]));
  sameLength('tiles.x', cellCount, world.tiles.x);
  sameLength('tiles.z', cellCount, world.tiles.z);
  sameLength('tiles.firstCluster', cellCount, world.tiles.firstCluster);
  sameLength('tiles.clusterCount', cellCount, world.tiles.clusterCount);
  const portalCount = world.portals.fromCell.length;
  sameLength('portals.toCell', portalCount, world.portals.toCell);
  sameLength('portals.dynamicStateId', portalCount, world.portals.dynamicStateId);
  sameLength('portals.flags', portalCount, world.portals.flags);
  const regionCount = world.regions.id.length;
  [world.regions.name, world.regions.kind, world.regions.enabled,
    world.regions.centerX, world.regions.centerY, world.regions.centerZ,
    world.regions.sizeX, world.regions.sizeY, world.regions.sizeZ,
    world.regions.phaseMask, world.regions.tags, world.regions.metadata]
    .forEach(values => sameLength('region SoA', regionCount, values));
  if (new Set(world.regions.id).size !== regionCount) {
    throw new Error('Invalid duplicate Shado world region IDs');
  }
  if (world.objects) validateObjects(world.objects, cellCount, sameLength);
  if (world.renderChunkClusters.length !== clusterCount) {
    throw new Error('Invalid Shado world render-chunk references');
  }
  const referenced = new Uint8Array(clusterCount);
  for (const cluster of world.renderChunkClusters) {
    if (cluster < 0 || cluster >= clusterCount || referenced[cluster]) {
      throw new Error(`Invalid or duplicate Shado world cluster reference ${cluster}`);
    }
    referenced[cluster] = 1;
  }
  for (const cell of world.clusters.cellId) {
    if (cell < 0 || cell >= cellCount) throw new Error(`Invalid Shado world cell reference ${cell}`);
  }
  const bvhSlots = world.bvh.nodeCount * 4;
  [world.bvh.childMinX, world.bvh.childMinY, world.bvh.childMinZ,
    world.bvh.childMaxX, world.bvh.childMaxY, world.bvh.childMaxZ,
    world.bvh.childRef].forEach(values => sameLength('BVH4 lanes', bvhSlots, values));
  if (world.pvs) {
    const expectedWords = cellCount * world.pvs.wordsPerRow;
    sameLength('PVS words', expectedWords, world.pvs.words);
  }
  if (world.integrity?.algorithm !== 'fnv1a32-layout') {
    throw new Error('Missing Shado world package integrity metadata');
  }
  const actual = computeShadoWorldLayoutHash(world);
  if (actual !== world.integrity.layoutHash) {
    throw new Error(
      `Shado world package integrity mismatch: expected ${world.integrity.layoutHash}, got ${actual}`
    );
  }
}

function validateObjects(
  objects: NonNullable<ShadoWorldSpatialPackage['objects']>,
  cellCount: number,
  sameLength: (label: string, expected: number, values: { length: number }) => void
): void {
  const prototypeCount = objects.prototypes.id.length;
  [
    objects.prototypes.source,
    objects.prototypes.boundsRadius,
    objects.prototypes.firstStampRef,
    objects.prototypes.stampRefCount,
    objects.prototypes.metadata,
  ].forEach(values => sameLength('object prototype SoA', prototypeCount, values));
  if (new Set(objects.prototypes.id).size !== prototypeCount) {
    throw new Error('Invalid duplicate Shado world object prototype IDs');
  }
  const stampCount = objects.stamps.id.length;
  [
    objects.stamps.prototype, objects.stamps.enabled,
    objects.stamps.positionX, objects.stamps.positionY, objects.stamps.positionZ,
    objects.stamps.rotationX, objects.stamps.rotationY, objects.stamps.rotationZ,
    objects.stamps.scaleX, objects.stamps.scaleY, objects.stamps.scaleZ,
    objects.stamps.radius, objects.stamps.cellId, objects.stamps.phaseMask,
    objects.stamps.tags, objects.stamps.metadata,
  ].forEach(values => sameLength('object stamp SoA', stampCount, values));
  if (new Set(objects.stamps.id).size !== stampCount) {
    throw new Error('Invalid duplicate Shado world object stamp IDs');
  }
  if (objects.prototypeStampRefs.length !== stampCount) {
    throw new Error('Invalid Shado world object prototype references');
  }
  const referenced = new Uint8Array(stampCount);
  objects.prototypeStampRefs.forEach(stamp => {
    if (stamp < 0 || stamp >= stampCount || referenced[stamp]) {
      throw new Error(`Invalid or duplicate Shado world object stamp reference ${stamp}`);
    }
    referenced[stamp] = 1;
  });
  objects.stamps.prototype.forEach(prototype => {
    if (prototype < 0 || prototype >= prototypeCount) {
      throw new Error(`Invalid Shado world object prototype reference ${prototype}`);
    }
  });
  objects.stamps.cellId.forEach(cell => {
    if (cell < -1 || cell >= cellCount) {
      throw new Error(`Invalid Shado world object cell reference ${cell}`);
    }
  });
}
