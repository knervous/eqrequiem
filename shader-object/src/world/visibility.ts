import type {
  ShadoWorldBounds,
  ShadoWorldPrimitive,
  ShadoWorldSpatialPackage,
} from './types';

type Point2 = [number, number];

// PVS is allowed to overdraw, but it must never create a visible hole around
// the player. Two grid steps cover a 5x5 local neighborhood; the camera-row
// margin makes adjacent rows overlap before the player crosses their boundary.
const LOCAL_FLOOD_RADIUS = 2;
const CAMERA_ROW_MARGIN = 1;

export type ShadoWorldVisibilityCompileInput = {
  bounds: ShadoWorldBounds;
  regionSize: number;
  maxDistance: number;
  renderCellCenters: readonly Point2[];
  persistentRenderCells: ArrayLike<number>;
  collisionPrimitives: readonly ShadoWorldPrimitive[];
};

/**
 * Builds continuous camera/entity regions and a conservative sampled PVS.
 *
 * Regions are deliberately independent of sparse render geometry. Until zones
 * provide authored room/portal topology or height-aware occluders, outdoor PVS
 * is a conservative distance flood. Heightless 2D wall rays cannot prove that
 * an entire vertical region is hidden and caused visible skyline holes.
 */
export function compileShadoWorldVisibility(
  input: ShadoWorldVisibilityCompileInput
): NonNullable<ShadoWorldSpatialPackage['visibility']> {
  const size = input.regionSize;
  const maxDistance = input.maxDistance;
  const originX = Math.floor(input.bounds.min[0] / size) * size;
  const originZ = Math.floor(input.bounds.min[2] / size) * size;
  const width = Math.max(1, Math.ceil((input.bounds.max[0] - originX) / size));
  const height = Math.max(1, Math.ceil((input.bounds.max[2] - originZ) / size));
  const regionCount = width * height;
  const regionForPoint = (x: number, z: number): number => {
    const localX = Math.floor((x - originX) / size);
    const localZ = Math.floor((z - originZ) / size);
    if (localX < 0 || localX >= width || localZ < 0 || localZ >= height) return -1;
    return localZ * width + localX;
  };
  const cellRegion = input.renderCellCenters.map(([x, z]) => regionForPoint(x, z));
  const persistent = new Uint8Array(regionCount);
  cellRegion.forEach((region, cell) => {
    if (region >= 0 && Number(input.persistentRenderCells[cell] ?? 0) !== 0) {
      persistent[region] = 1;
    }
  });
  const persistentRegions = Array.from(persistent, (value, region) => value ? region : -1)
    .filter(region => region >= 0);
  const persistentCells = Array.from(
    input.persistentRenderCells,
    (value, cell) => Number(value) !== 0 ? cell : -1
  ).filter(cell => cell >= 0);

  const wordsPerRow = Math.ceil(regionCount / 32);
  const words = new Uint32Array(regionCount * wordsPerRow);
  let visibleRegionPairs = 0;
  const setVisible = (from: number, to: number) => {
    const index = from * wordsPerRow + (to >>> 5);
    const mask = 1 << (to & 31);
    if (!(words[index] & mask)) {
      words[index] = (words[index] | mask) >>> 0;
      visibleRegionPairs++;
    }
  };
  for (let from = 0; from < regionCount; from++) {
    for (let to = from; to < regionCount; to++) {
      if (!potentiallyVisible(from, to, {
        originX, originZ, size, width, height, maxDistance,
      })) continue;
      setVisible(from, to);
      if (from !== to) setVisible(to, from);
    }
  }
  const floodedWords = floodCameraRows(
    words,
    wordsPerRow,
    width,
    height,
    CAMERA_ROW_MARGIN
  );
  visibleRegionPairs = countVisibleBits(floodedWords);
  return {
    version: 1,
    mode: 'distance-flood',
    size,
    originX,
    originZ,
    width,
    height,
    maxDistance,
    occluderCount: 0,
    visibleRegionPairs,
    cellRegion,
    persistentRegions,
    persistentCells,
    pvs: { wordsPerRow, words: Array.from(floodedWords) },
  };
}

function potentiallyVisible(
  from: number,
  to: number,
  grid: { originX: number; originZ: number; size: number; width: number; height: number; maxDistance: number }
): boolean {
  if (from === to) return true;
  const fromX = from % grid.width, fromZ = Math.floor(from / grid.width);
  const toX = to % grid.width, toZ = Math.floor(to / grid.width);
  if (
    Math.max(Math.abs(fromX - toX), Math.abs(fromZ - toZ)) <=
    LOCAL_FLOOD_RADIUS
  ) return true;
  const center = (x: number, z: number): Point2 => [
    grid.originX + (x + 0.5) * grid.size,
    grid.originZ + (z + 0.5) * grid.size,
  ];
  const source = center(fromX, fromZ);
  const target = center(toX, toZ);
  if (Math.hypot(target[0] - source[0], target[1] - source[1]) > grid.maxDistance) {
    return false;
  }
  return true;
}

/**
 * Unions each camera row with neighboring camera rows. This is a conservative
 * source-region flood: adjacent player positions share their visibility before
 * the player crosses a region edge, eliminating hard row-transition popping.
 */
function floodCameraRows(
  source: Uint32Array,
  wordsPerRow: number,
  width: number,
  height: number,
  radius: number
): Uint32Array {
  const result = source.slice();
  for (let fromZ = 0; fromZ < height; fromZ++) {
    for (let fromX = 0; fromX < width; fromX++) {
      const targetRow = (fromZ * width + fromX) * wordsPerRow;
      for (let deltaZ = -radius; deltaZ <= radius; deltaZ++) {
        const sourceZ = fromZ + deltaZ;
        if (sourceZ < 0 || sourceZ >= height) continue;
        for (let deltaX = -radius; deltaX <= radius; deltaX++) {
          const sourceX = fromX + deltaX;
          if (sourceX < 0 || sourceX >= width) continue;
          const sourceRow = (sourceZ * width + sourceX) * wordsPerRow;
          for (let word = 0; word < wordsPerRow; word++) {
            result[targetRow + word] =
              (result[targetRow + word] | source[sourceRow + word]) >>> 0;
          }
        }
      }
    }
  }
  return result;
}

function countVisibleBits(words: Uint32Array): number {
  let total = 0;
  for (const value of words) {
    let remaining = value >>> 0;
    while (remaining) {
      remaining &= remaining - 1;
      total++;
    }
  }
  return total;
}
