import type {
  ShadoWorldGrassCompileOptions,
  ShadoWorldGrassPackage,
  ShadoWorldPrimitive,
} from './types';

type Placement = {
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

type SurfaceTriangle = {
  a: number;
  b: number;
  c: number;
  cumulativeArea: number;
};

type ResolvedGrassSettings = Required<ShadoWorldGrassCompileOptions>;

type CoverageCell = {
  x: number;
  z: number;
  heights: Float64Array;
};

const COVERAGE_RESOLUTION = 32;
const BLOCKER_BELOW_TOLERANCE = 0.12;
const BLOCKER_MAXIMUM_CLEARANCE = 2;

const DEFAULTS = {
  cellSize: 24,
  density: 1.15,
  maxPlacements: 48_000,
  maxPlacementsPerPrimitive: 18_000,
  minimumUpNormal: 0.58,
  minHeight: 0.32,
  maxHeight: 0.68,
  bladeWidth: 0.052,
  seed: 0x0e17_a91a,
} satisfies ResolvedGrassSettings;

/** Converts tagged source surfaces into deterministic, cell-owned placements. */
export function compileShadoWorldGrass(
  primitives: readonly ShadoWorldPrimitive[],
  options: ShadoWorldGrassCompileOptions | false | undefined
): ShadoWorldGrassPackage | undefined {
  if (options === false) return undefined;
  const settings = { ...DEFAULTS, ...options };
  validateSettings(settings);
  const sources = primitives
    .map((primitive, index) => ({ primitive, index }))
    .filter(({ primitive }) => primitive.extraShader === 'grass');
  // An explicit grass policy is also a runtime package contract. Preserve an
  // empty versioned package when the authored zone has no tagged surfaces so
  // loaders and audits do not have to infer whether grass was intentionally
  // compiled or accidentally skipped. The default `undefined` policy still
  // omits grass for worlds that did not request it.
  if (!sources.length) {
    return options ? bucketPlacements([], settings, new Map()) : undefined;
  }
  const coverage = compileCoverage(primitives, settings);

  const placements: Placement[] = [];
  let remaining = settings.maxPlacements;
  for (let source = 0; source < sources.length && remaining > 0; source++) {
    const { primitive, index } = sources[source]!;
    const triangles = eligibleTriangles(primitive, settings.minimumUpNormal);
    if (!triangles.length) continue;
    const totalArea = triangles[triangles.length - 1]!.cumulativeArea;
    const sourceLimit = Math.min(
      settings.maxPlacementsPerPrimitive,
      Math.ceil(remaining / (sources.length - source))
    );
    const count = Math.min(sourceLimit, Math.max(1, Math.round(totalArea * settings.density)));
    placements.push(
      ...sampleSurface(
        primitive,
        triangles,
        totalArea,
        count,
        settings,
        (settings.seed + Math.imul(index, 0x9e37_79b1)) >>> 0
      )
    );
    remaining -= count;
  }
  if (!placements.length) return bucketPlacements([], settings, coverage);
  return bucketPlacements(placements, settings, coverage);
}

function compileCoverage(
  primitives: readonly ShadoWorldPrimitive[],
  settings: ResolvedGrassSettings
): Map<string, CoverageCell> {
  const cells = new Map<string, CoverageCell>();
  for (const primitive of primitives) {
    if (primitive.extraShader !== 'grass') continue;
    const triangles = eligibleTriangles(primitive, settings.minimumUpNormal);
    for (const triangle of triangles) {
      rasterizeTriangle(primitive, triangle, settings.cellSize, (x, z, sample, y) => {
        const key = `${x}:${z}`;
        let cell = cells.get(key);
        if (!cell) {
          const heights = new Float64Array(COVERAGE_RESOLUTION * COVERAGE_RESOLUTION);
          heights.fill(Number.NaN);
          cell = { x, z, heights };
          cells.set(key, cell);
        }
        const previous = cell.heights[sample]!;
        if (!Number.isFinite(previous) || y > previous) cell.heights[sample] = y;
      });
    }
  }

  // Paths, floors, and other nearby upward-facing geometry suppress the grass
  // below them. High roofs and foliage are intentionally outside the clearance.
  for (const primitive of primitives) {
    if (
      primitive.extraShader === 'grass' ||
      primitive.extraShader === 'water' ||
      primitive.extraShader === 'sky'
    ) {
      continue;
    }
    const triangles = eligibleTriangles(primitive, 0.35);
    for (const triangle of triangles) {
      rasterizeTriangle(primitive, triangle, settings.cellSize, (x, z, sample, y) => {
        const cell = cells.get(`${x}:${z}`);
        const grassY = cell?.heights[sample];
        if (
          cell &&
          Number.isFinite(grassY) &&
          y >= grassY! - BLOCKER_BELOW_TOLERANCE &&
          y <= grassY! + BLOCKER_MAXIMUM_CLEARANCE
        ) {
          cell.heights[sample] = Number.NaN;
        }
      });
    }
  }
  for (const [key, cell] of cells) {
    if (!cell.heights.some(Number.isFinite)) cells.delete(key);
  }
  return cells;
}

function rasterizeTriangle(
  primitive: ShadoWorldPrimitive,
  triangle: SurfaceTriangle,
  cellSize: number,
  visit: (cellX: number, cellZ: number, sample: number, y: number) => void
): void {
  const positions = primitive.positions;
  const ax = Number(positions[triangle.a]);
  const ay = Number(positions[triangle.a + 1]);
  const az = Number(positions[triangle.a + 2]);
  const bx = Number(positions[triangle.b]);
  const by = Number(positions[triangle.b + 1]);
  const bz = Number(positions[triangle.b + 2]);
  const cx = Number(positions[triangle.c]);
  const cy = Number(positions[triangle.c + 1]);
  const cz = Number(positions[triangle.c + 2]);
  const denominator = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
  if (Math.abs(denominator) <= 1e-9) return;
  const spacing = cellSize / COVERAGE_RESOLUTION;
  const minimumGridX = Math.floor(Math.min(ax, bx, cx) / spacing);
  const maximumGridX = Math.floor(Math.max(ax, bx, cx) / spacing);
  const minimumGridZ = Math.floor(Math.min(az, bz, cz) / spacing);
  const maximumGridZ = Math.floor(Math.max(az, bz, cz) / spacing);
  for (let gridZ = minimumGridZ; gridZ <= maximumGridZ; gridZ++) {
    const sampleZ = (gridZ + 0.5) * spacing;
    for (let gridX = minimumGridX; gridX <= maximumGridX; gridX++) {
      const sampleX = (gridX + 0.5) * spacing;
      const deltaX = sampleX - ax;
      const deltaZ = sampleZ - az;
      const baryB = (deltaX * (cz - az) - (cx - ax) * deltaZ) / denominator;
      const baryC = ((bx - ax) * deltaZ - deltaX * (bz - az)) / denominator;
      const baryA = 1 - baryB - baryC;
      if (baryA < -1e-7 || baryB < -1e-7 || baryC < -1e-7) continue;
      const cellX = Math.floor(gridX / COVERAGE_RESOLUTION);
      const cellZ = Math.floor(gridZ / COVERAGE_RESOLUTION);
      const localX = ((gridX % COVERAGE_RESOLUTION) + COVERAGE_RESOLUTION) % COVERAGE_RESOLUTION;
      const localZ = ((gridZ % COVERAGE_RESOLUTION) + COVERAGE_RESOLUTION) % COVERAGE_RESOLUTION;
      visit(
        cellX,
        cellZ,
        localZ * COVERAGE_RESOLUTION + localX,
        ay * baryA + by * baryB + cy * baryC
      );
    }
  }
}

function eligibleTriangles(
  primitive: ShadoWorldPrimitive,
  minimumUpNormal: number
): SurfaceTriangle[] {
  const output: SurfaceTriangle[] = [];
  const positions = primitive.positions;
  let totalArea = 0;
  for (let index = 0; index + 2 < primitive.indices.length; index += 3) {
    const a = Number(primitive.indices[index]) * 3;
    const b = Number(primitive.indices[index + 1]) * 3;
    const c = Number(primitive.indices[index + 2]) * 3;
    const abX = Number(positions[b]) - Number(positions[a]);
    const abY = Number(positions[b + 1]) - Number(positions[a + 1]);
    const abZ = Number(positions[b + 2]) - Number(positions[a + 2]);
    const acX = Number(positions[c]) - Number(positions[a]);
    const acY = Number(positions[c + 1]) - Number(positions[a + 1]);
    const acZ = Number(positions[c + 2]) - Number(positions[a + 2]);
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    const doubleArea = Math.hypot(normalX, normalY, normalZ);
    if (doubleArea <= 1e-6 || Math.abs(normalY) / doubleArea < minimumUpNormal) {
      continue;
    }
    totalArea += doubleArea * 0.5;
    output.push({ a, b, c, cumulativeArea: totalArea });
  }
  return output;
}

function sampleSurface(
  primitive: ShadoWorldPrimitive,
  triangles: readonly SurfaceTriangle[],
  totalArea: number,
  count: number,
  settings: ResolvedGrassSettings,
  seed: number
): Placement[] {
  const random = randomGenerator(seed);
  const positions = primitive.positions;
  const output: Placement[] = [];
  for (let placement = 0; placement < count; placement++) {
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
    const interpolate = (axis: number) =>
      Number(positions[triangle.a + axis]) * baryA +
      Number(positions[triangle.b + axis]) * baryB +
      Number(positions[triangle.c + axis]) * baryC;
    output.push({
      x: interpolate(0),
      y: interpolate(1) + 0.012,
      z: interpolate(2),
      yaw: random() * Math.PI,
      width: settings.bladeWidth * 2 * (0.72 + random() * 0.52),
      height: settings.minHeight + (settings.maxHeight - settings.minHeight) * random(),
      phase: random(),
      stiffness: random(),
      colorVariation: random(),
    });
  }
  return output;
}

function bucketPlacements(
  placements: readonly Placement[],
  settings: ResolvedGrassSettings,
  coverage: ReadonlyMap<string, CoverageCell>
): ShadoWorldGrassPackage {
  const cellSize = settings.cellSize;
  const buckets = new Map<string, Placement[]>();
  for (const placement of placements) {
    const x = Math.floor(placement.x / cellSize);
    const z = Math.floor(placement.z / cellSize);
    const key = `${x}:${z}`;
    const coverageCell = coverage.get(key);
    const localX = Math.min(
      COVERAGE_RESOLUTION - 1,
      Math.max(0, Math.floor(((placement.x - x * cellSize) / cellSize) * COVERAGE_RESOLUTION))
    );
    const localZ = Math.min(
      COVERAGE_RESOLUTION - 1,
      Math.max(0, Math.floor(((placement.z - z * cellSize) / cellSize) * COVERAGE_RESOLUTION))
    );
    if (!Number.isFinite(coverageCell?.heights[localZ * COVERAGE_RESOLUTION + localX])) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(placement);
    else buckets.set(key, [placement]);
  }
  const cells = [...coverage.values()]
    .map(cell => {
      const key = `${cell.x}:${cell.z}`;
      const values = buckets.get(key) ?? [];
      if (!values.length) {
        const sample = cell.heights.findIndex(Number.isFinite);
        const localX = sample % COVERAGE_RESOLUTION;
        const localZ = Math.floor(sample / COVERAGE_RESOLUTION);
        const random = randomGenerator(
          (Math.imul(cell.x, 73_856_093) ^ Math.imul(cell.z, 19_349_663) ^ settings.seed) >>> 0
        );
        values.push({
          x: cell.x * cellSize + ((localX + 0.5) / COVERAGE_RESOLUTION) * cellSize,
          y: cell.heights[sample]! + 0.012,
          z: cell.z * cellSize + ((localZ + 0.5) / COVERAGE_RESOLUTION) * cellSize,
          yaw: random() * Math.PI,
          width: settings.bladeWidth * 2 * (0.72 + random() * 0.52),
          height: settings.minHeight + (settings.maxHeight - settings.minHeight) * random(),
          phase: random(),
          stiffness: random(),
          colorVariation: random(),
        });
      }
      return { ...cell, values };
    })
    .sort((a, b) => a.z - b.z || a.x - b.x);
  const output: ShadoWorldGrassPackage = {
    version: 1,
    cellSize,
    cells: {
      x: [],
      z: [],
      firstPlacement: [],
      placementCount: [],
    },
    placements: {
      positionX: [],
      positionY: [],
      positionZ: [],
      yaw: [],
      width: [],
      height: [],
      phase: [],
      stiffness: [],
      colorVariation: [],
    },
    coverage: {
      resolution: COVERAGE_RESOLUTION,
      wordsPerCell: COVERAGE_RESOLUTION,
      words: [],
    },
  };
  for (const cell of cells) {
    output.cells.x.push(cell.x);
    output.cells.z.push(cell.z);
    output.cells.firstPlacement.push(output.placements.positionX.length);
    output.cells.placementCount.push(cell.values.length);
    for (let word = 0; word < COVERAGE_RESOLUTION; word++) {
      let bits = 0;
      for (let bit = 0; bit < 32; bit++) {
        if (Number.isFinite(cell.heights[word * 32 + bit])) bits = (bits | (1 << bit)) >>> 0;
      }
      output.coverage!.words.push(bits);
    }
    for (const placement of cell.values) {
      output.placements.positionX.push(placement.x);
      output.placements.positionY.push(placement.y);
      output.placements.positionZ.push(placement.z);
      output.placements.yaw.push(placement.yaw);
      output.placements.width.push(placement.width);
      output.placements.height.push(placement.height);
      output.placements.phase.push(placement.phase);
      output.placements.stiffness.push(placement.stiffness);
      output.placements.colorVariation.push(placement.colorVariation);
    }
  }
  return output;
}

function randomGenerator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function validateSettings(settings: ResolvedGrassSettings): void {
  const positive = [
    ['cellSize', settings.cellSize],
    ['density', settings.density],
    ['maxPlacements', settings.maxPlacements],
    ['maxPlacementsPerPrimitive', settings.maxPlacementsPerPrimitive],
    ['maxHeight', settings.maxHeight],
    ['bladeWidth', settings.bladeWidth],
  ] as const;
  for (const [name, value] of positive) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`grass.${name} must be positive`);
    }
  }
  if (
    !Number.isFinite(settings.minHeight) ||
    settings.minHeight <= 0 ||
    settings.minHeight > settings.maxHeight
  ) {
    throw new Error('grass.minHeight must be positive and not exceed maxHeight');
  }
  if (
    !Number.isFinite(settings.minimumUpNormal) ||
    settings.minimumUpNormal < 0 ||
    settings.minimumUpNormal > 1
  ) {
    throw new Error('grass.minimumUpNormal must be between zero and one');
  }
  if (
    !Number.isInteger(settings.maxPlacements) ||
    !Number.isInteger(settings.maxPlacementsPerPrimitive)
  ) {
    throw new Error('grass placement limits must be integers');
  }
}
