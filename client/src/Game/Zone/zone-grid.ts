import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import { Entity } from "@game/Model/entity";
import Player from "@game/Player/player";

type CellTriple = [number, number, number];

export class Grid {
  /** Map from "x,y,z"→Set of all entities in that cell */
  private cells = new Map<string, Set<Entity>>();

  /** Map from Entity→its current cell triple; used to know where an entity “was” */
  private entityToCell = new Map<Entity, CellTriple>();

  /** Store the player's last known cell */
  private lastPlayerCell: CellTriple | null = null;

  private get playerPosition(): BJS.Vector3 {
    return Player.instance?.getPlayerPosition() ?? new BABYLON.Vector3(0, 0, 0);
  }

  // Precompute the 27 neighbor offsets so we can compare cells quickly
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

  updatePlayerPosition(): void {
    const newPlayerCell = this.worldToCell(this.playerPosition);

    // If player cell hasn't changed, no need to update entity visibility
    if (
      this.lastPlayerCell &&
      newPlayerCell[0] === this.lastPlayerCell[0] &&
      newPlayerCell[1] === this.lastPlayerCell[1] &&
      newPlayerCell[2] === this.lastPlayerCell[2]
    ) {
      return;
    }

    // Collect cells that need visibility updates: those in the 3×3×3 neighborhood
    // of the old and new player cells
    const cellsToCheck = new Set<string>();
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

    // Update visibility for entities in affected cells
    for (const key of cellsToCheck) {
      const bucket = this.cells.get(key);
      if (bucket) {
        for (const entity of bucket) {
          this.handleEntityVisibility(entity);
        }
      }
    }

    // Update the last known player cell
    this.lastPlayerCell = newPlayerCell;
  }

  private readonly cellSize: number;

  private worldToCell(p: BJS.Vector3): CellTriple {
    return [
      Math.floor(p.x / this.cellSize),
      Math.floor(p.y / this.cellSize),
      Math.floor(p.z / this.cellSize),
    ];
  }

  private static keyFromTriple([x, y, z]: CellTriple): string {
    return `${x},${y},${z}`;
  }

  private computeCell(p: BJS.Vector3): CellTriple {
    return this.worldToCell(p);
  }

  public addEntity(entity: Entity): void {
    const cell = this.computeCell(entity.spawnPosition);
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
    const newCell = this.computeCell(entity.spawnPosition);

    // If entity isn't in the grid, treat it as a new entity
    if (!oldCell) {
      this.addEntity(entity);
      return;
    }

    // Only update if the entity's cell has changed
    const cellsEqual =
      oldCell[0] === newCell[0] &&
      oldCell[1] === newCell[1] &&
      oldCell[2] === newCell[2];

    if (!cellsEqual) {
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

      // Update entity cell record
      this.entityToCell.set(entity, newCell);

      // Since the entity's cell changed, check visibility
      this.handleEntityVisibility(entity);
    } else {
      // Even if the entity's cell didn't change, check visibility if the player's cell changed
      const playerCell = this.worldToCell(this.playerPosition);
      const lastPlayerCell = this.lastPlayerCell ?? playerCell;
      const playerCellChanged =
        lastPlayerCell[0] !== playerCell[0] ||
        lastPlayerCell[1] !== playerCell[1] ||
        lastPlayerCell[2] !== playerCell[2];

      if (playerCellChanged) {
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
}