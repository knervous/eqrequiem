import type { ShadoWorldSpatialPackage } from './types';

const CELL_FIELDS = [
  'kind',
  'minX',
  'minY',
  'minZ',
  'maxX',
  'maxY',
  'maxZ',
  'firstCluster',
  'clusterCount',
  'phaseMask',
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
  const float = new Float32Array(1);
  const bits = new Uint32Array(float.buffer);
  const feedFloatArray = (values: ArrayLike<number>) => {
    feed(values.length);
    for (let index = 0; index < values.length; index++) {
      float[0] = Number(values[index]);
      feed(bits[0]!);
    }
  };

  feed(world.version);
  feed(world.sourceTransform === 'mirror-x' ? 1 : 0);
  feed(world.triangleCount);
  feed(world.collision.vertexCount);
  feed(world.collision.triangleCount);
  feed(world.collision.chunkCount);
  feed(world.collision.sourceTriangleCount);
  feedFloatArray([world.collision.chunkSize]);
  feed(Number.parseInt(world.collision.contentHash, 16));
  const topology: ArrayLike<number>[] = [
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
  ];
  topology.splice(
    16,
    0,
    world.navigation.modifiers.region,
    world.navigation.modifiers.area,
    world.navigation.modifiers.flags,
    world.navigation.modifiers.excluded
  );
  topology.forEach(feedArray);
  if (world.visibility) {
    feed(world.visibility.version);
    feed(world.visibility.mode === 'distance-flood' ? 1 : 0);
    feedFloatArray([
      world.visibility.size,
      world.visibility.originX,
      world.visibility.originZ,
      world.visibility.maxDistance,
    ]);
    feed(world.visibility.width);
    feed(world.visibility.height);
    feed(world.visibility.occluderCount);
    feed(world.visibility.visibleRegionPairs);
    feedArray(world.visibility.cellRegion);
    feedArray(world.visibility.persistentRegions);
    feedArray(world.visibility.persistentCells);
    feed(world.visibility.pvs.wordsPerRow);
    feedArray(world.visibility.pvs.words);
  }
  const stampIrradiance = world.objects?.stamps.irradianceR
    ? [
        world.objects.stamps.irradianceR,
        world.objects.stamps.irradianceG!,
        world.objects.stamps.irradianceB!,
        world.objects.stamps.irradianceA!,
      ]
    : [];
  stampIrradiance.forEach(feedFloatArray);
  if (world.grass) {
    [
      world.grass.cells.x,
      world.grass.cells.z,
      world.grass.cells.firstPlacement,
      world.grass.cells.placementCount,
    ].forEach(feedArray);
    Object.values(world.grass.placements).forEach(feedFloatArray);
    if (world.grass.coverage) world.grass.coverage.words.forEach(feed);
  }
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
    world.version !== 5 ||
    world.coordinateSystem !== 'babylon-y-up' ||
    !['identity', 'mirror-x'].includes(world.sourceTransform) ||
    (world.lighting !== undefined &&
      (!['dynamic', 'hybrid', 'baked'].includes(world.lighting.mode) ||
        !['material-tint', 'baked-irradiance'].includes(world.lighting.vertexColors) ||
        (world.lighting.mode === 'baked' && world.lighting.vertexColors !== 'baked-irradiance'))) ||
    world.navigation?.runtimeToRecast !== 'z-y-negative-x' ||
    world.collision?.format !== 'shado-collision-v2' ||
    !world.collision.source ||
    !Number.isFinite(world.collision.chunkSize) ||
    world.collision.chunkSize <= 0 ||
    !Number.isInteger(world.collision.chunkCount) ||
    world.collision.chunkCount <= 0 ||
    !Number.isInteger(world.collision.sourceTriangleCount) ||
    world.collision.sourceTriangleCount <= 0 ||
    !Number.isInteger(world.collision.vertexCount) ||
    world.collision.vertexCount <= 0 ||
    !Number.isInteger(world.collision.triangleCount) ||
    world.collision.triangleCount <= 0 ||
    !/^[0-9a-f]{8}$/.test(world.collision.contentHash) ||
    !validBounds(world.bounds) ||
    !validBounds(world.collision.bounds) ||
    !boundsContain(world.bounds, world.collision.bounds)
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
    world.clusters.centerX,
    world.clusters.centerY,
    world.clusters.centerZ,
    world.clusters.coneX,
    world.clusters.coneY,
    world.clusters.coneZ,
    world.clusters.coneCutoff,
    world.clusters.firstIndex,
    world.clusters.indexCount,
    world.clusters.primitive,
    world.clusters.materialPacket,
    world.clusters.renderChunk,
    world.clusters.lodParent,
    world.clusters.cellId,
  ].forEach(values => sameLength('cluster SoA', clusterCount, values));
  CELL_FIELDS.forEach(field => sameLength(`cell.${field}`, cellCount, world.cells[field]));
  sameLength('tiles.x', cellCount, world.tiles.x);
  sameLength('tiles.z', cellCount, world.tiles.z);
  sameLength('tiles.firstCluster', cellCount, world.tiles.firstCluster);
  sameLength('tiles.clusterCount', cellCount, world.tiles.clusterCount);
  {
    const modifierCount = world.navigation.modifiers.region.length;
    [
      world.navigation.modifiers.area,
      world.navigation.modifiers.flags,
      world.navigation.modifiers.excluded,
      world.navigation.modifiers.centerX,
      world.navigation.modifiers.centerY,
      world.navigation.modifiers.centerZ,
      world.navigation.modifiers.sizeX,
      world.navigation.modifiers.sizeY,
      world.navigation.modifiers.sizeZ,
    ].forEach(values => sameLength('navigation modifier SoA', modifierCount, values));
    world.navigation.modifiers.region.forEach(region => {
      if (region < 0 || region >= world.regions.id.length) {
        throw new Error(`Invalid Shado world navigation region reference ${region}`);
      }
    });
    world.navigation.modifiers.area.forEach(area => {
      if (!Number.isInteger(area) || area < 0 || area > 63) {
        throw new Error(`Invalid Shado world navigation area ${area}`);
      }
    });
    world.navigation.modifiers.flags.forEach(flags => {
      if (!Number.isInteger(flags) || flags < 0 || flags > 0xffff) {
        throw new Error(`Invalid Shado world navigation flags ${flags}`);
      }
    });
  }
  const portalCount = world.portals.fromCell.length;
  sameLength('portals.toCell', portalCount, world.portals.toCell);
  sameLength('portals.dynamicStateId', portalCount, world.portals.dynamicStateId);
  sameLength('portals.flags', portalCount, world.portals.flags);
  const regionCount = world.regions.id.length;
  [
    world.regions.name,
    world.regions.kind,
    world.regions.enabled,
    world.regions.centerX,
    world.regions.centerY,
    world.regions.centerZ,
    world.regions.sizeX,
    world.regions.sizeY,
    world.regions.sizeZ,
    world.regions.phaseMask,
    world.regions.tags,
    world.regions.metadata,
  ].forEach(values => sameLength('region SoA', regionCount, values));
  if (new Set(world.regions.id).size !== regionCount) {
    throw new Error('Invalid duplicate Shado world region IDs');
  }
  if (world.objects) validateObjects(world.objects, cellCount, sameLength);
  if (world.grass) validateGrass(world.grass, sameLength);
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
    if (cell < 0 || cell >= cellCount)
      throw new Error(`Invalid Shado world cell reference ${cell}`);
  }
  const bvhSlots = world.bvh.nodeCount * 4;
  [
    world.bvh.childMinX,
    world.bvh.childMinY,
    world.bvh.childMinZ,
    world.bvh.childMaxX,
    world.bvh.childMaxY,
    world.bvh.childMaxZ,
    world.bvh.childRef,
  ].forEach(values => sameLength('BVH4 lanes', bvhSlots, values));
  if (world.pvs) {
    const expectedWords = cellCount * world.pvs.wordsPerRow;
    sameLength('PVS words', expectedWords, world.pvs.words);
  }
  if (world.visibility) {
    const visibility = world.visibility;
    const visibilityRegionCount = visibility.width * visibility.height;
    if (
      visibility.version !== 1 ||
      visibility.mode !== 'distance-flood' ||
      !Number.isFinite(visibility.size) || visibility.size <= 0 ||
      !Number.isFinite(visibility.originX) || !Number.isFinite(visibility.originZ) ||
      !Number.isFinite(visibility.maxDistance) || visibility.maxDistance <= 0 ||
      !Number.isInteger(visibility.width) || visibility.width <= 0 ||
      !Number.isInteger(visibility.height) || visibility.height <= 0 ||
      visibility.occluderCount !== 0 ||
      !Number.isInteger(visibility.visibleRegionPairs) || visibility.visibleRegionPairs <= 0 ||
      visibility.pvs.wordsPerRow !== Math.ceil(visibilityRegionCount / 32)
    ) throw new Error('Invalid Shado world visibility topology header');
    sameLength('visibility.cellRegion', cellCount, visibility.cellRegion);
    sameLength(
      'visibility PVS words',
      visibilityRegionCount * visibility.pvs.wordsPerRow,
      visibility.pvs.words
    );
    for (const region of visibility.cellRegion) {
      if (!Number.isInteger(region) || region < 0 || region >= visibilityRegionCount) {
        throw new Error(`Invalid Shado world render-cell visibility region ${region}`);
      }
    }
    let previous = -1;
    for (const region of visibility.persistentRegions) {
      if (!Number.isInteger(region) || region <= previous || region >= visibilityRegionCount) {
        throw new Error(`Invalid Shado world persistent visibility region ${region}`);
      }
      previous = region;
    }
    previous = -1;
    for (const cell of visibility.persistentCells) {
      if (!Number.isInteger(cell) || cell <= previous || cell >= cellCount) {
        throw new Error(`Invalid Shado world persistent render cell ${cell}`);
      }
      previous = cell;
    }
    let pairCount = 0;
    for (const word of visibility.pvs.words) pairCount += popcount32(word);
    if (pairCount !== visibility.visibleRegionPairs) {
      throw new Error(
        `Invalid Shado world visible-region pair count: expected ${visibility.visibleRegionPairs}, got ${pairCount}`
      );
    }
    for (let region = 0; region < visibilityRegionCount; region++) {
      const word = visibility.pvs.words[
        region * visibility.pvs.wordsPerRow + (region >>> 5)
      ] >>> 0;
      if (!(word & (1 << (region & 31)))) {
        throw new Error(`Shado world visibility region ${region} cannot see itself`);
      }
    }
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

function popcount32(value: number): number {
  let word = value >>> 0;
  word -= (word >>> 1) & 0x55555555;
  word = (word & 0x33333333) + ((word >>> 2) & 0x33333333);
  return (((word + (word >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function validateGrass(
  grass: NonNullable<ShadoWorldSpatialPackage['grass']>,
  sameLength: (label: string, expected: number, values: { length: number }) => void
): void {
  if (grass.version !== 1 || !Number.isFinite(grass.cellSize) || grass.cellSize <= 0) {
    throw new Error('Invalid Shado world grass package header');
  }
  const cellCount = grass.cells.x.length;
  [grass.cells.z, grass.cells.firstPlacement, grass.cells.placementCount].forEach(values =>
    sameLength('grass cell SoA', cellCount, values)
  );
  const placementCount = grass.placements.positionX.length;
  Object.values(grass.placements).forEach(values =>
    sameLength('grass placement SoA', placementCount, values)
  );
  let nextPlacement = 0;
  for (let cell = 0; cell < cellCount; cell++) {
    if (
      !Number.isInteger(grass.cells.x[cell]) ||
      !Number.isInteger(grass.cells.z[cell]) ||
      grass.cells.firstPlacement[cell] !== nextPlacement ||
      !Number.isInteger(grass.cells.placementCount[cell]) ||
      grass.cells.placementCount[cell] <= 0
    ) {
      throw new Error(`Invalid Shado world grass cell ${cell}`);
    }
    nextPlacement += grass.cells.placementCount[cell];
  }
  if (nextPlacement !== placementCount) {
    throw new Error('Invalid Shado world grass placement ranges');
  }
  if (grass.coverage) {
    const { resolution, wordsPerCell, words } = grass.coverage;
    if (
      !Number.isInteger(resolution) ||
      resolution <= 0 ||
      resolution > 128 ||
      !Number.isInteger(wordsPerCell) ||
      wordsPerCell !== Math.ceil((resolution * resolution) / 32)
    ) {
      throw new Error('Invalid Shado world grass coverage header');
    }
    sameLength('grass coverage words', cellCount * wordsPerCell, words);
    if (words.some(word => !Number.isInteger(word) || word < 0 || word > 0xffff_ffff)) {
      throw new Error('Invalid Shado world grass coverage words');
    }
  }
  for (let placement = 0; placement < placementCount; placement++) {
    const finite = [
      grass.placements.positionX[placement],
      grass.placements.positionY[placement],
      grass.placements.positionZ[placement],
      grass.placements.yaw[placement],
      grass.placements.width[placement],
      grass.placements.height[placement],
      grass.placements.phase[placement],
      grass.placements.stiffness[placement],
      grass.placements.colorVariation[placement],
    ].every(Number.isFinite);
    if (
      !finite ||
      grass.placements.width[placement] <= 0 ||
      grass.placements.height[placement] <= 0 ||
      grass.placements.phase[placement] < 0 ||
      grass.placements.phase[placement] > 1 ||
      grass.placements.stiffness[placement] < 0 ||
      grass.placements.stiffness[placement] > 1 ||
      grass.placements.colorVariation[placement] < 0 ||
      grass.placements.colorVariation[placement] > 1
    ) {
      throw new Error(`Invalid Shado world grass placement ${placement}`);
    }
  }
}

function validBounds(bounds: ShadoWorldSpatialPackage['bounds'] | undefined): boolean {
  return Boolean(
    bounds &&
    bounds.min?.length === 3 &&
    bounds.max?.length === 3 &&
    [...bounds.min, ...bounds.max].every(Number.isFinite) &&
    bounds.min.every((value, axis) => value <= bounds.max[axis]!)
  );
}

function boundsContain(
  outer: ShadoWorldSpatialPackage['bounds'],
  inner: ShadoWorldSpatialPackage['bounds']
): boolean {
  return outer.min.every(
    (value, axis) => inner.min[axis]! >= value - 1e-4 && inner.max[axis]! <= outer.max[axis]! + 1e-4
  );
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
    objects.stamps.prototype,
    objects.stamps.enabled,
    objects.stamps.positionX,
    objects.stamps.positionY,
    objects.stamps.positionZ,
    objects.stamps.rotationX,
    objects.stamps.rotationY,
    objects.stamps.rotationZ,
    objects.stamps.scaleX,
    objects.stamps.scaleY,
    objects.stamps.scaleZ,
    objects.stamps.radius,
    objects.stamps.cellId,
    objects.stamps.phaseMask,
    objects.stamps.tags,
    objects.stamps.metadata,
  ].forEach(values => sameLength('object stamp SoA', stampCount, values));
  const irradiance = [
    objects.stamps.irradianceR,
    objects.stamps.irradianceG,
    objects.stamps.irradianceB,
    objects.stamps.irradianceA,
  ];
  if (irradiance.some(Boolean)) {
    if (!irradiance.every(Boolean)) {
      throw new Error('Incomplete Shado world object stamp irradiance');
    }
    irradiance.forEach(values => sameLength('object stamp irradiance', stampCount, values!));
    if (
      irradiance.some(values =>
        values!.some(value => !Number.isFinite(value) || value < 0 || value > 1)
      )
    ) {
      throw new Error('Invalid Shado world object stamp irradiance');
    }
  }
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
