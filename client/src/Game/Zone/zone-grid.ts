import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Entity } from "@game/Model/entity";
import Player from "@game/Player/player";

type CellTriple = [number, number, number];

/**
 * We reserve 21 bits per coordinate. That lets each coordinate range
 * from –(2^20) … +((2^20)–1) = –1 048 576 … +1 048 575.
 * We bias each signed value by +2^20 (1 048 576) so that it fits into an
 * unsigned 21-bit range [0 .. (2^21–1)] = [0 .. 2 097 151].
 *
 * Layout (total 63 bits):
 *   [ x_bias (21 bits) ] [ y_bias (21 bits) ] [ z_bias (21 bits) ]
 *   ^                 ^                 ^
 *  bit  62           41               20                0
 *
 * Packing:   key = (x_bias << 42) | (y_bias << 21) | (z_bias)
 * Unpacking:
 *   z_bias =  (key & ((1n << 21n) - 1n))
 *   y_bias = ((key >> 21n) & ((1n << 21n) - 1n))
 *   x_bias =  (key >> 42n) & ((1n << 21n) - 1n)
 */

const BIAS_21 = 1 << 20; // 2^20 = 1_048_576
const MASK_21 = (1n << 21n) - 1n; // 0x1F_FFFF (21 bits of 1)

export class Grid {
  /** Map from packed BigInt key → Set of all entities in that cell */
  private cells = new Map<bigint, Set<Entity>>();

  /** Map from Entity → its current cell triple; used to know where an entity “was” */
  private entityToCell = new Map<Entity, CellTriple>();

  /** Store the player's last known cell */
  private lastPlayerCell: CellTriple | null = null;

  /** Precompute the 27 neighbor offsets so we can compare cells quickly */
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

  private interval: number = -1;
  private readonly cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.interval = window.setInterval(() => {
      this.updatePlayerPosition();
    }, 250);
  }

  public dispose(): void {
    if (this.interval !== -1) {
      window.clearInterval(this.interval);
      this.interval = -1;
    }
    this.cells.clear();
    this.entityToCell.clear();
    this.lastPlayerCell = null;
  }

  private get playerPosition(): BJS.Vector3 {
    return Player.instance?.getPlayerPosition() ?? new BABYLON.Vector3(0, 0, 0);
  }

  private worldToCell(p: BJS.Vector3): CellTriple {
    return [
      Math.floor(p.x / this.cellSize),
      Math.floor(p.y / this.cellSize),
      Math.floor(p.z / this.cellSize),
    ];
  }

  /** 
   * Packs a CellTriple [x, y, z] into a single BigInt key:
   *   1) Bias each coordinate by +2^20 so that it’s in [0 .. 2^21–1].
   *   2) Shift x_bias << 42, y_bias << 21, z_bias << 0, then OR them.
   */
  private static keyFromTriple([x, y, z]: CellTriple): bigint {
    // Step 1: bias
    const xb = BigInt(x + BIAS_21);
    const yb = BigInt(y + BIAS_21);
    const zb = BigInt(z + BIAS_21);

    // Step 2: range‐check (optional but safer)
    if (xb < 0n || xb > MASK_21) {
      throw new Error(`X coordinate ${x} out of range [-2^20..2^20-1]`);
    }
    if (yb < 0n || yb > MASK_21) {
      throw new Error(`Y coordinate ${y} out of range [-2^20..2^20-1]`);
    }
    if (zb < 0n || zb > MASK_21) {
      throw new Error(`Z coordinate ${z} out of range [-2^20..2^20-1]`);
    }

    return (xb << 42n) | (yb << 21n) | zb;
  }

  /**
   * (Optional) If you ever need to unpack a key back into [x, y, z]:
   */
  private static tripleFromKey(key: bigint): CellTriple {
    const zb = key & MASK_21;
    const yb = (key >> 21n) & MASK_21;
    const xb = (key >> 42n) & MASK_21;

    // Un-bias:
    const x = Number(xb) - BIAS_21;
    const y = Number(yb) - BIAS_21;
    const z = Number(zb) - BIAS_21;
    return [x, y, z];
  }

  public addEntity(entity: Entity): void {
    const cell = this.worldToCell(entity.spawnPosition);
    const key = Grid.keyFromTriple(cell);

    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = new Set<Entity>();
      this.cells.set(key, bucket);
    }
    bucket.add(entity);

    this.entityToCell.set(entity, cell);
    this.handleEntityVisibility(entity);
  }

  public removeEntity(entity: Entity): void {
    const oldCell = this.entityToCell.get(entity);
    if (!oldCell) {
      return;
    }

    const oldKey = Grid.keyFromTriple(oldCell);
    const bucket = this.cells.get(oldKey);
    if (bucket) {
      bucket.delete(entity);
      if (bucket.size === 0) {
        this.cells.delete(oldKey);
      }
    }

    this.entityToCell.delete(entity);
  }

  public updateEntityPosition(entity: Entity): void {
    const oldCell = this.entityToCell.get(entity);
    const newCell = this.worldToCell(entity.spawnPosition);

    if (!oldCell) {
      this.addEntity(entity);
      return;
    }

    const sameCell =
      oldCell[0] === newCell[0] &&
      oldCell[1] === newCell[1] &&
      oldCell[2] === newCell[2];

    if (!sameCell) {
      // Remove from old bucket
      const oldKey = Grid.keyFromTriple(oldCell);
      const oldBucket = this.cells.get(oldKey);
      if (oldBucket) {
        oldBucket.delete(entity);
        if (oldBucket.size === 0) {
          this.cells.delete(oldKey);
        }
      }

      // Insert into new bucket
      const newKey = Grid.keyFromTriple(newCell);
      let newBucket = this.cells.get(newKey);
      if (!newBucket) {
        newBucket = new Set<Entity>();
        this.cells.set(newKey, newBucket);
      }
      newBucket.add(entity);

      // Update map
      this.entityToCell.set(entity, newCell);

      // Check visibility once for this entity
      this.handleEntityVisibility(entity);
    } else {
      // If only the player moved, still re-check
      const playerCell = this.worldToCell(this.playerPosition);
      const lastCell = this.lastPlayerCell ?? playerCell;
      const moved =
        lastCell[0] !== playerCell[0] ||
        lastCell[1] !== playerCell[1] ||
        lastCell[2] !== playerCell[2];
      if (moved) {
        this.handleEntityVisibility(entity);
      }
    }
  }

  public getNearbyEntities(worldPos: BJS.Vector3): Entity[] {
    const baseCell = this.worldToCell(worldPos);
    const out: Entity[] = [];

    for (const [dx, dy, dz] of Grid.neighborOffsets) {
      const neighbor: CellTriple = [
        baseCell[0] + dx,
        baseCell[1] + dy,
        baseCell[2] + dz,
      ];
      const key = Grid.keyFromTriple(neighbor);
      const bucket = this.cells.get(key);
      if (bucket) {
        out.push(...bucket);
      }
    }

    return out;
  }

  updatePlayerPosition(): void {
    const newPlayerCell = this.worldToCell(this.playerPosition);

    if (
      this.lastPlayerCell &&
      newPlayerCell[0] === this.lastPlayerCell[0] &&
      newPlayerCell[1] === this.lastPlayerCell[1] &&
      newPlayerCell[2] === this.lastPlayerCell[2]
    ) {
      return;
    }

    const cellsToCheck = new Set<bigint>();
    const addCells = (baseCell: CellTriple | null) => {
      if (!baseCell) return;
      for (const [dx, dy, dz] of Grid.neighborOffsets) {
        const neighbor: CellTriple = [
          baseCell[0] + dx,
          baseCell[1] + dy,
          baseCell[2] + dz,
        ];
        cellsToCheck.add(Grid.keyFromTriple(neighbor));
      }
    };
    addCells(this.lastPlayerCell);
    addCells(newPlayerCell);

    for (const key of cellsToCheck) {
      const bucket = this.cells.get(key);
      if (bucket) {
        for (const entity of bucket) {
          this.handleEntityVisibility(entity);
        }
      }
    }

    this.lastPlayerCell = newPlayerCell;
  }

  private handleEntityVisibility(entity: Entity): void {
    const playerCell = this.worldToCell(this.playerPosition);
    const entCell =
      this.entityToCell.get(entity) ?? this.computeCell(entity.spawnPosition);

    const dx = Math.abs(playerCell[0] - entCell[0]);
    const dy = Math.abs(playerCell[1] - entCell[1]);
    const dz = Math.abs(playerCell[2] - entCell[2]);

    if (dx <= 1 && dy <= 1 && dz <= 1) {
      entity.initialize();
    } else {
      entity.hide();
    }
  }

  private computeCell(p: BJS.Vector3): CellTriple {
    return this.worldToCell(p);
  }
}
