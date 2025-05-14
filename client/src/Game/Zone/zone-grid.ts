import { Spawn } from "@game/Net/internal/api/capnp/common";

type CellTriple = [number, number, number];
type Vec3       = { x: number; y: number; z: number };

export class Grid {
  private cells = new Map<string, Set<number>>();

  // Precompute the 27 neighbor offsets
  private static neighborOffsets: CellTriple[] = (() => {
    const out: CellTriple[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          out.push([dx, dy, dz]);
        }
      }
    }
    return out;
  })();

  constructor(private cellSize: number) {}

  /** Turn world coords into cell indices (for querying neighbors) */
  worldToCell(p: Vec3): CellTriple {
    return [
      Math.floor(p.x / this.cellSize),
      Math.floor(p.y / this.cellSize),
      Math.floor(p.z / this.cellSize),
    ];
  }

  /** String-key for a cell triple */
  private static keyFromTriple([x, y, z]: CellTriple): string {
    return `${x},${y},${z}`;
  }

  /** Add a spawn to its bucket using the server-sent cellX/Y/Z */
  addSpawn(spawn: Spawn): void {
    const cell: CellTriple = [spawn.cellX, spawn.cellY, spawn.cellZ];
    const key = Grid.keyFromTriple(cell);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(spawn.spawnId);
  }

  /** Remove a spawn from its bucket (e.g. on despawn) */
  removeSpawn(spawn: Spawn): void {
    const cell: CellTriple = [spawn.cellX, spawn.cellY, spawn.cellZ];
    const key = Grid.keyFromTriple(cell);
    const bucket = this.cells.get(key);
    if (!bucket) return;
    bucket.delete(spawn.spawnId);
    if (bucket.size === 0) {
      this.cells.delete(key);
    }
  }

  /**
   * Update a spawn’s bucket when it moves.
   * @param spawn The updated Spawn (with new cellX/Y/Z)
   * @param oldCell The previous cell triple ([oldX, oldY, oldZ])
   */
  updateSpawnCell(spawn: Spawn, oldCell: CellTriple): void {
    // remove from old
    const oldKey = Grid.keyFromTriple(oldCell);
    const oldBucket = this.cells.get(oldKey);
    if (oldBucket) {
      oldBucket.delete(spawn.spawnId);
      if (oldBucket.size === 0) {
        this.cells.delete(oldKey);
      }
    }
    // add to new
    this.addSpawn(spawn);
  }

  /**
   * Return all spawn IDs in the 3×3×3 neighborhood around the given world position.
   */
  getNearbySpawnIds(player: Vec3): number[] {
    const base: CellTriple = this.worldToCell(player);
    const out: number[] = [];
    for (const [dx, dy, dz] of Grid.neighborOffsets) {
      const neighbor: CellTriple = [base[0] + dx, base[1] + dy, base[2] + dz];
      const bucket = this.cells.get(Grid.keyFromTriple(neighbor));
      if (bucket) {
        out.push(...bucket);
      }
    }
    return out;
  }
}
