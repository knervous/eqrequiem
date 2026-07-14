export interface SpatialPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Sparse 3D AOI buckets matching the Go server's 300-unit, 27-cell neighborhood. */
export class ZoneSpatialIndex {
  private readonly entityCells = new Map<number, string>();
  private readonly sessionCells = new Map<number, string>();
  private readonly entityBuckets = new Map<string, Set<number>>();
  private readonly sessionBuckets = new Map<string, Set<number>>();

  constructor(readonly cellSize = 300, readonly neighborRadius = 1) {
    if (!(cellSize > 0) || !Number.isInteger(neighborRadius) || neighborRadius < 0) {
      throw new RangeError("invalid zone spatial index dimensions");
    }
  }

  upsertEntity(entityIndex: number, position: SpatialPosition): boolean {
    return this.upsert(entityIndex, position, this.entityCells, this.entityBuckets);
  }

  upsertSession(sessionId: number, position: SpatialPosition): boolean {
    return this.upsert(sessionId, position, this.sessionCells, this.sessionBuckets);
  }

  removeEntity(entityIndex: number): void {
    this.remove(entityIndex, this.entityCells, this.entityBuckets);
  }

  removeSession(sessionId: number): void {
    this.remove(sessionId, this.sessionCells, this.sessionBuckets);
  }

  recipientsForEntity(entityIndex: number): number[] {
    const key = this.entityCells.get(entityIndex);
    return key ? this.nearby(key, this.sessionBuckets) : [];
  }

  entitiesForSession(sessionId: number): number[] {
    const key = this.sessionCells.get(sessionId);
    return key ? this.nearby(key, this.entityBuckets) : [];
  }

  get occupiedEntityCells(): number { return this.entityBuckets.size; }
  get occupiedSessionCells(): number { return this.sessionBuckets.size; }

  private upsert(
    id: number,
    position: SpatialPosition,
    cells: Map<number, string>,
    buckets: Map<string, Set<number>>,
  ): boolean {
    const next = cellKey(this.worldToCell(position));
    const previous = cells.get(id);
    if (previous === next) return false;
    if (previous) removeFromBucket(previous, id, buckets);
    const bucket = buckets.get(next) ?? new Set<number>();
    bucket.add(id);
    buckets.set(next, bucket);
    cells.set(id, next);
    return true;
  }

  private remove(id: number, cells: Map<number, string>, buckets: Map<string, Set<number>>): void {
    const key = cells.get(id);
    if (!key) return;
    removeFromBucket(key, id, buckets);
    cells.delete(id);
  }

  private nearby(key: string, buckets: Map<string, Set<number>>): number[] {
    const center = parseCellKey(key);
    const result: number[] = [];
    for (let dx = -this.neighborRadius; dx <= this.neighborRadius; dx++) {
      for (let dy = -this.neighborRadius; dy <= this.neighborRadius; dy++) {
        for (let dz = -this.neighborRadius; dz <= this.neighborRadius; dz++) {
          const bucket = buckets.get(cellKey({
            x: center.x + dx,
            y: center.y + dy,
            z: center.z + dz,
          }));
          if (bucket) result.push(...bucket);
        }
      }
    }
    return result.sort((a, b) => a - b);
  }

  private worldToCell(position: SpatialPosition): Cell {
    return {
      x: Math.floor(position.x / this.cellSize),
      y: Math.floor(position.y / this.cellSize),
      z: Math.floor(position.z / this.cellSize),
    };
  }
}

function cellKey(cell: Cell): string { return `${cell.x}:${cell.y}:${cell.z}`; }

function parseCellKey(key: string): Cell {
  const [x, y, z] = key.split(":").map(Number);
  return { x: x!, y: y!, z: z! };
}

function removeFromBucket(key: string, id: number, buckets: Map<string, Set<number>>): void {
  const bucket = buckets.get(key);
  bucket?.delete(id);
  if (bucket?.size === 0) buckets.delete(key);
}
