import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type { ShadoWorldGrassPackage } from "@knervous/shado/world";

export type GrassPatchOptions = {
  width?: number;
  depth?: number;
  columns?: number;
  rows?: number;
  minHeight?: number;
  maxHeight?: number;
  bladeWidth?: number;
  seed?: number;
};

export type GrassSurfaceOptions = {
  density?: number;
  maxBlades?: number;
  minHeight?: number;
  maxHeight?: number;
  bladeWidth?: number;
  seed?: number;
  minimumUpNormal?: number;
  /** Optional primitive-local triangle subset, normally supplied by a Shado cluster. */
  sourceIndices?: ArrayLike<number>;
  nameSuffix?: string;
};

export type GrassPlacement = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  height: number;
  phase: number;
  stiffness: number;
  colorVariation: number;
};

export type GrassCellOptions = GrassSurfaceOptions & {
  cellSize?: number;
  /** Conservative local-space padding for vertex-shader wind displacement. */
  windBoundsPadding?: number;
};

export type GrassCell = {
  x: number;
  z: number;
  mesh: BJS.Mesh;
  bladeCount: number;
};

export type PromotedGrassCellRenderOptions = {
  sampleRate?: number;
  widthScale?: number;
  heightScale?: number;
  nameSuffix?: string;
  seedSalt?: number;
  lod?: "near" | "far";
};

export const PROMOTED_GRASS_BLADES_PER_CELL = 1_024;
export const PROMOTED_GRASS_STRATA_SIDE = 32;
export const PROMOTED_GRASS_HEIGHT_SCALE = 1.75;
const PROMOTED_GRASS_WIDTH_SCALE = 1.45;
const PROMOTED_GRASS_MAX_HEIGHT_ANCHORS = 64;

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function countSetBits(value: number): number {
  let word = value >>> 0;
  let count = 0;
  while (word) {
    word &= word - 1;
    count++;
  }
  return count;
}

function promotedGrassSampleRandom(
  cellX: number,
  cellZ: number,
  sample: number,
  salt: number,
): number {
  let value =
    (Math.imul(cellX, 73_856_093) ^
      Math.imul(cellZ, 19_349_663) ^
      Math.imul(sample, 83_492_791) ^
      salt) >>>
    0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

export function createGrassPatch(
  scene: BJS.Scene,
  options: GrassPatchOptions = {},
): BJS.Mesh {
  const width = options.width ?? 16;
  const depth = options.depth ?? 14;
  const columns = options.columns ?? 72;
  const rows = options.rows ?? 64;
  const minHeight = options.minHeight ?? 0.38;
  const maxHeight = options.maxHeight ?? 0.82;
  const bladeWidth = options.bladeWidth ?? 0.065;
  const random = randomGenerator(options.seed ?? 0xe17a_91a);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const appendQuad = (
    anchorX: number,
    anchorZ: number,
    height: number,
    angle: number,
    widthScale: number,
  ) => {
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const halfWidth = bladeWidth * widthScale;
    const leftX = -directionX * halfWidth;
    const leftZ = -directionZ * halfWidth;
    const normalX = -directionZ;
    const normalZ = directionX;
    const base = positions.length / 3;
    positions.push(
      anchorX + leftX,
      0,
      anchorZ + leftZ,
      anchorX - leftX,
      0,
      anchorZ - leftZ,
      anchorX + leftX * 0.24,
      height,
      anchorZ + leftZ * 0.24,
      anchorX - leftX * 0.24,
      height,
      anchorZ - leftZ * 0.24,
    );
    for (let index = 0; index < 4; index++) {
      normals.push(normalX, 0.18, normalZ);
    }
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const anchorX =
        ((column + 0.18 + random() * 0.64) / columns - 0.5) * width;
      const anchorZ = ((row + 0.18 + random() * 0.64) / rows - 0.5) * depth;
      const height = minHeight + (maxHeight - minHeight) * random();
      const angle = random() * Math.PI;
      const widthScale = 0.72 + random() * 0.52;
      appendQuad(anchorX, anchorZ, height, angle, widthScale);
      appendQuad(
        anchorX,
        anchorZ,
        height * 0.94,
        angle + Math.PI * 0.5,
        widthScale,
      );
    }
  }

  const mesh = new BABYLON.Mesh("RequiemGrassPatch", scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.freezeWorldMatrix();
  return mesh;
}

/** Shared unit crossed-card geometry used by every production grass cell. */
export function createGrassCrossGeometry(
  scene: BJS.Scene,
  name = "RequiemGrassTemplate",
): BJS.Mesh {
  const mesh = new BABYLON.Mesh(name, scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = [
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1,
    0.5, 0, 1, -0.5,
  ];
  vertexData.normals = [
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
  ];
  vertexData.uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  vertexData.indices = [0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6];
  vertexData.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  return mesh;
}

/** Irregular multi-blade tuft used by the production near/mid grass field. */
export function createGrassClumpGeometry(
  scene: BJS.Scene,
  name = "RequiemGrassClumpTemplate",
): BJS.Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const blades = [
    { x: 0, z: 0, angle: 0.08, width: 1, height: 1, lean: 0.12 },
    { x: -0.92, z: 0.28, angle: 1.17, width: 0.82, height: 0.84, lean: -0.18 },
    { x: 0.78, z: -0.38, angle: 2.21, width: 0.88, height: 0.76, lean: 0.2 },
    { x: -0.34, z: -0.84, angle: 0.7, width: 0.72, height: 0.65, lean: -0.14 },
    { x: 0.48, z: 0.76, angle: 1.72, width: 0.68, height: 0.58, lean: 0.16 },
  ] as const;

  for (const blade of blades) {
    const directionX = Math.cos(blade.angle);
    const directionZ = Math.sin(blade.angle);
    const normalX = -directionZ;
    const normalZ = directionX;
    const halfWidth = blade.width * 0.5;
    const tipX = blade.x + normalX * blade.lean;
    const tipZ = blade.z + normalZ * blade.lean;
    const base = positions.length / 3;
    positions.push(
      blade.x - directionX * halfWidth,
      0,
      blade.z - directionZ * halfWidth,
      blade.x + directionX * halfWidth,
      0,
      blade.z + directionZ * halfWidth,
      tipX + directionX * halfWidth,
      blade.height,
      tipZ + directionZ * halfWidth,
      tipX - directionX * halfWidth,
      blade.height,
      tipZ - directionZ * halfWidth,
    );
    for (let vertex = 0; vertex < 4; vertex++) {
      normals.push(normalX, 0.16, normalZ);
    }
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  const mesh = new BABYLON.Mesh(name, scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.checkCollisions = false;
  return mesh;
}

export function sampleGrassPlacements(
  surface: BJS.Mesh,
  options: GrassSurfaceOptions = {},
): GrassPlacement[] {
  const sourcePositions = surface.getVerticesData(
    BABYLON.VertexBuffer.PositionKind,
  );
  const sourceIndices = options.sourceIndices ?? surface.getIndices();
  if (!sourcePositions || !sourceIndices?.length) return [];

  const density = options.density ?? 1.15;
  const maxBlades = options.maxBlades ?? 12_000;
  const minimumUpNormal = options.minimumUpNormal ?? 0.58;
  const minHeight = options.minHeight ?? 0.32;
  const maxHeight = options.maxHeight ?? 0.68;
  const bladeWidth = options.bladeWidth ?? 0.052;
  const random = randomGenerator(options.seed ?? 0xe17a_91a);
  const triangles: Array<{
    a: number;
    b: number;
    c: number;
    cumulativeArea: number;
  }> = [];
  let totalArea = 0;

  for (let index = 0; index + 2 < sourceIndices.length; index += 3) {
    const a = sourceIndices[index]! * 3;
    const b = sourceIndices[index + 1]! * 3;
    const c = sourceIndices[index + 2]! * 3;
    const abX = sourcePositions[b]! - sourcePositions[a]!;
    const abY = sourcePositions[b + 1]! - sourcePositions[a + 1]!;
    const abZ = sourcePositions[b + 2]! - sourcePositions[a + 2]!;
    const acX = sourcePositions[c]! - sourcePositions[a]!;
    const acY = sourcePositions[c + 1]! - sourcePositions[a + 1]!;
    const acZ = sourcePositions[c + 2]! - sourcePositions[a + 2]!;
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    const doubleArea = Math.hypot(normalX, normalY, normalZ);
    if (
      doubleArea <= 1e-6 ||
      Math.abs(normalY) / doubleArea < minimumUpNormal
    ) {
      continue;
    }
    totalArea += doubleArea * 0.5;
    triangles.push({ a, b, c, cumulativeArea: totalArea });
  }
  if (!triangles.length || totalArea <= 0) return [];

  const bladeCount = Math.min(
    maxBlades,
    Math.max(1, Math.round(totalArea * density)),
  );
  const placements: GrassPlacement[] = [];
  for (let blade = 0; blade < bladeCount; blade++) {
    const targetArea = random() * totalArea;
    let low = 0;
    let high = triangles.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (triangles[middle]!.cumulativeArea < targetArea) low = middle + 1;
      else high = middle;
    }
    const triangle = triangles[low]!;
    const rootU = Math.sqrt(random());
    const baryA = 1 - rootU;
    const baryB = rootU * (1 - random());
    const baryC = 1 - baryA - baryB;
    placements.push({
      x:
        sourcePositions[triangle.a]! * baryA +
        sourcePositions[triangle.b]! * baryB +
        sourcePositions[triangle.c]! * baryC,
      y:
        sourcePositions[triangle.a + 1]! * baryA +
        sourcePositions[triangle.b + 1]! * baryB +
        sourcePositions[triangle.c + 1]! * baryC +
        0.012,
      z:
        sourcePositions[triangle.a + 2]! * baryA +
        sourcePositions[triangle.b + 2]! * baryB +
        sourcePositions[triangle.c + 2]! * baryC,
      yaw: random() * Math.PI,
      width: bladeWidth * 2 * (0.72 + random() * 0.52),
      height: minHeight + (maxHeight - minHeight) * random(),
      phase: random(),
      stiffness: random(),
      colorVariation: random(),
    });
  }
  return placements;
}

function populateGrassCell(
  mesh: BJS.Mesh,
  placements: readonly GrassPlacement[],
  windBoundsPadding: number,
): void {
  const matrices = new Float32Array(placements.length * 16);
  const grassData = new Float32Array(placements.length * 4);
  const scale = new BABYLON.Vector3();
  const rotation = new BABYLON.Quaternion();
  const translation = new BABYLON.Vector3();
  const matrix = new BABYLON.Matrix();

  for (let index = 0; index < placements.length; index++) {
    const placement = placements[index]!;
    scale.set(placement.width, placement.height, placement.width);
    BABYLON.Quaternion.RotationYawPitchRollToRef(placement.yaw, 0, 0, rotation);
    translation.set(placement.x, placement.y, placement.z);
    BABYLON.Matrix.ComposeToRef(scale, rotation, translation, matrix);
    matrix.copyToArray(matrices, index * 16);
    const dataOffset = index * 4;
    grassData[dataOffset] = placement.phase;
    grassData[dataOffset + 1] = placement.stiffness;
    grassData[dataOffset + 2] = placement.colorVariation;
    grassData[dataOffset + 3] =
      (placement.phase * 0.618_033_988_75 +
        placement.colorVariation * 0.381_966_011_25) %
      1;
  }

  uploadGrassCell(mesh, matrices, grassData, windBoundsPadding);
}

function uploadGrassCell(
  mesh: BJS.Mesh,
  matrices: Float32Array,
  grassData: Float32Array,
  windBoundsPadding: number,
): void {
  if (
    matrices.length % 16 !== 0 ||
    grassData.length % 4 !== 0 ||
    matrices.length / 16 !== grassData.length / 4
  ) {
    throw new Error(
      `Grass instance buffers disagree: ${matrices.length / 16} matrices and ${grassData.length / 4} data records`,
    );
  }
  const instanceCount = matrices.length / 16;
  // Babylon stores thin-instance vertex buffers on Geometry. Clones share
  // Geometry by default, so one streamed cell would otherwise overwrite the
  // buffers used by every other resident cell.
  mesh.makeGeometryUnique();
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
  mesh.thinInstanceSetBuffer("grassData", grassData, 4, true);
  mesh.thinInstanceCount = instanceCount;
  mesh.thinInstanceRefreshBoundingInfo(true);
  const bounds = mesh.getBoundingInfo().boundingBox;
  const minimum = bounds.minimum.clone();
  const maximum = bounds.maximum.clone();
  minimum.x -= windBoundsPadding;
  minimum.y -= windBoundsPadding * 0.2;
  minimum.z -= windBoundsPadding;
  maximum.x += windBoundsPadding;
  maximum.y += windBoundsPadding * 0.2;
  maximum.z += windBoundsPadding;
  mesh.getBoundingInfo().reConstruct(minimum, maximum);
  mesh.doNotSyncBoundingInfo = true;
  mesh.isPickable = false;
  mesh.checkCollisions = false;
}

/**
 * Samples one authored surface and creates bounded, static thin-instance
 * batches. Cell meshes share the template geometry and the caller's material.
 */
export function createGrassCellsForSurface(
  surface: BJS.Mesh,
  template: BJS.Mesh,
  material: BJS.Material,
  options: GrassCellOptions = {},
): GrassCell[] {
  const cellSize = options.cellSize ?? 24;
  const windBoundsPadding = options.windBoundsPadding ?? 0.4;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error(`Grass cell size must be positive; received ${cellSize}`);
  }
  if (!Number.isFinite(windBoundsPadding) || windBoundsPadding < 0) {
    throw new Error(
      `Grass wind bounds padding cannot be negative; received ${windBoundsPadding}`,
    );
  }
  const buckets = new Map<string, GrassPlacement[]>();
  for (const placement of sampleGrassPlacements(surface, options)) {
    const cellX = Math.floor(placement.x / cellSize);
    const cellZ = Math.floor(placement.z / cellSize);
    const key = `${cellX}:${cellZ}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(placement);
    else buckets.set(key, [placement]);
  }

  const cells: GrassCell[] = [];
  for (const [key, placements] of buckets) {
    const [cellXText, cellZText] = key.split(":");
    const cellX = Number(cellXText);
    const cellZ = Number(cellZText);
    const mesh = template.clone(
      `RequiemGrass:${surface.name}${options.nameSuffix ?? ""}:cell-${cellX}-${cellZ}`,
      surface,
      true,
    );
    if (!mesh) throw new Error(`Failed to create grass cell ${key}`);
    mesh.position.setAll(0);
    mesh.rotation.setAll(0);
    mesh.scaling.setAll(1);
    mesh.material = material;
    mesh.metadata = {
      ...mesh.metadata,
      requiemGrassBladeCount: placements.length,
      requiemGrassCell: [cellX, cellZ],
      requiemGrassSource: surface.name,
    };
    populateGrassCell(mesh, placements, windBoundsPadding);
    mesh.setEnabled(false);
    cells.push({
      x: cellX,
      z: cellZ,
      mesh,
      bladeCount: placements.length,
    });
  }
  return cells;
}

/** Creates production cells directly from promoted offline placement data. */
export function createGrassCellsFromPackage(
  template: BJS.Mesh,
  material: BJS.Material,
  grass: ShadoWorldGrassPackage,
  windBoundsPadding = 0.65,
): GrassCell[] {
  return grass.cells.x.map((_, cell) =>
    createGrassCellFromPackage(
      template,
      material,
      grass,
      cell,
      windBoundsPadding,
    ),
  );
}

/** Builds one resident cell without allocating records for the rest of a zone. */
export function createGrassCellFromPackage(
  template: BJS.Mesh,
  material: BJS.Material,
  grass: ShadoWorldGrassPackage,
  cell: number,
  windBoundsPadding = 0.65,
  renderOptions: PromotedGrassCellRenderOptions = {},
): GrassCell {
  if (cell < 0 || cell >= grass.cells.x.length) {
    throw new Error(`Promoted grass cell index ${cell} is out of range`);
  }
  const scale = new BABYLON.Vector3();
  const rotation = new BABYLON.Quaternion();
  const translation = new BABYLON.Vector3();
  const matrix = new BABYLON.Matrix();
  const first = grass.cells.firstPlacement[cell]!;
  const seedCount = grass.cells.placementCount[cell]!;
  if (seedCount <= 0) {
    throw new Error(`Promoted grass cell ${cell} has no placement anchors`);
  }
  const coverage = grass.coverage;
  const strataSide = coverage?.resolution ?? PROMOTED_GRASS_STRATA_SIDE;
  const candidateCount = strataSide * strataSide;
  const x = grass.cells.x[cell]!;
  const z = grass.cells.z[cell]!;
  const sampleRate = renderOptions.sampleRate ?? 1;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate > 1) {
    throw new Error(
      `Grass cell sample rate must be in (0, 1]; received ${sampleRate}`,
    );
  }
  const seedSalt = renderOptions.seedSalt ?? 0;
  const isCovered = (local: number) => {
    if (!coverage) return true;
    const word = coverage.words[cell * coverage.wordsPerCell + (local >>> 5)]!;
    return ((word >>> (local & 31)) & 1) !== 0;
  };
  let firstCoveredSample = 0;
  while (
    firstCoveredSample < candidateCount &&
    !isCovered(firstCoveredSample)
  ) {
    firstCoveredSample++;
  }
  const isIncluded = (local: number) =>
    isCovered(local) &&
    (sampleRate >= 1 ||
      local === firstCoveredSample ||
      promotedGrassSampleRandom(x, z, local, seedSalt) < sampleRate);
  let bladeCount = 0;
  if (sampleRate >= 1 && coverage) {
    const firstWord = cell * coverage.wordsPerCell;
    for (let word = 0; word < coverage.wordsPerCell; word++) {
      bladeCount += countSetBits(coverage.words[firstWord + word]!);
    }
  } else if (sampleRate >= 1) {
    bladeCount = PROMOTED_GRASS_BLADES_PER_CELL;
  } else {
    for (let local = 0; local < candidateCount; local++) {
      if (isIncluded(local)) bladeCount++;
    }
  }
  const cellMinimumX = x * grass.cellSize;
  const cellMinimumZ = z * grass.cellSize;
  const random = randomGenerator(
    (Math.imul(x, 73_856_093) ^
      Math.imul(z, 19_349_663) ^
      0x0e17_a91a ^
      seedSalt) >>>
      0,
  );
  const matrices = new Float32Array(bladeCount * 16);
  const grassData = new Float32Array(bladeCount * 4);
  const anchorStep = Math.max(
    1,
    Math.ceil(seedCount / PROMOTED_GRASS_MAX_HEIGHT_ANCHORS),
  );
  let outputBlade = 0;
  for (let local = 0; local < candidateCount; local++) {
    if (!isIncluded(local)) continue;
    const column = local % strataSide;
    const row = Math.floor(local / strataSide);
    const normalizedX = (column + 0.15 + random() * 0.7) / strataSide;
    const normalizedZ = (row + 0.15 + random() * 0.7) / strataSide;
    const positionX = cellMinimumX + normalizedX * grass.cellSize;
    const positionZ = cellMinimumZ + normalizedZ * grass.cellSize;

    // Promoted samples preserve the authored surface height and local blade scale,
    // while stratified positions prevent sparse source samples becoming clumps.
    let seed = first;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (let anchor = 0; anchor < seedCount; anchor += anchorStep) {
      const candidate = first + anchor;
      const deltaX = grass.placements.positionX[candidate]! - positionX;
      const deltaZ = grass.placements.positionZ[candidate]! - positionZ;
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        seed = candidate;
      }
    }

    const heightVariation = 0.68 + (random() + random()) * 0.34;
    const widthVariation = 0.78 + random() * 0.5;
    const width =
      grass.placements.width[seed]! *
      PROMOTED_GRASS_WIDTH_SCALE *
      (renderOptions.widthScale ?? 1) *
      widthVariation;
    scale.set(
      width,
      grass.placements.height[seed]! *
        PROMOTED_GRASS_HEIGHT_SCALE *
        (renderOptions.heightScale ?? 1) *
        heightVariation,
      width,
    );
    BABYLON.Quaternion.RotationYawPitchRollToRef(
      random() * Math.PI,
      0,
      0,
      rotation,
    );
    translation.set(positionX, grass.placements.positionY[seed]!, positionZ);
    BABYLON.Matrix.ComposeToRef(scale, rotation, translation, matrix);
    matrix.copyToArray(matrices, outputBlade * 16);
    const dataOffset = outputBlade * 4;
    grassData[dataOffset] = random();
    grassData[dataOffset + 1] = random();
    grassData[dataOffset + 2] = random();
    grassData[dataOffset + 3] = random();
    outputBlade++;
  }
  const mesh = template.clone(
    `RequiemGrass${renderOptions.nameSuffix ?? ""}:cell-${x}-${z}`,
    null,
    true,
  );
  if (!mesh) throw new Error(`Failed to create promoted grass cell ${x}:${z}`);
  mesh.position.setAll(0);
  mesh.rotation.setAll(0);
  mesh.scaling.setAll(1);
  mesh.material = material;
  mesh.metadata = {
    ...mesh.metadata,
    requiemGrassBladeCount: bladeCount,
    requiemGrassSeedCount: seedCount,
    requiemGrassCell: [x, z],
    requiemGrassPromoted: true,
    requiemGrassLod: renderOptions.lod ?? "near",
  };
  uploadGrassCell(mesh, matrices, grassData, windBoundsPadding);
  mesh.setEnabled(false);
  return { x, z, mesh, bladeCount };
}
