import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import { Entity } from "@game/Model/entity";
import Player from "@game/Player/player";

export type CellTriple = [number, number, number];

const BIAS_21 = 1 << 20; // 2^20 = 1_048_576
const MASK_21 = (1n << 21n) - 1n; // 0x1F_FFFF (21 bits of 1)

export class Grid {
  private cells = new Map<bigint, Set<Entity>>();
  private entityToCell = new Map<Entity, CellTriple>();
  private debugObserver: BJS.Nullable<BJS.Observer<BJS.Scene>> = null;

  // Debug visualization
  private debugEnabled: boolean = false;
  private debugMeshes: Map<bigint, BJS.Mesh> = new Map();
  private playerCellMesh: BJS.Mesh | null = null;

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

  constructor(
    private cellSize: number,
    private scene: BJS.Scene,
    debug: boolean = false,
  ) {
    this.debugEnabled = debug;
    if (this.debugEnabled) {
      this.debugObserver = this.scene.onBeforeRenderObservable.add(() =>
        this.updateDebugVisualization(),
      );
    }
  }

  public dispose(): void {
    if (this.debugObserver) {
      this.scene.onBeforeRenderObservable.remove(this.debugObserver);
      this.debugObserver = null;
    }
    this.cells.clear();
    this.entityToCell.clear();
    this.clearDebugVisualization();
  }

  private get playerPosition(): BJS.Vector3 {
    return Player.instance?.getPlayerPosition() ?? new BABYLON.Vector3(0, 0, 0);
  }

  public worldToCell(p: BJS.Vector3): CellTriple {
    return [
      Math.floor(p.x / this.cellSize),
      Math.floor(p.y / this.cellSize),
      Math.floor(p.z / this.cellSize),
    ];
  }

  public static keyFromTriple([x, y, z]: CellTriple): bigint {
    const xb = BigInt(x + BIAS_21);
    const yb = BigInt(y + BIAS_21);
    const zb = BigInt(z + BIAS_21);

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

  public static tripleFromKey(key: bigint): CellTriple {
    const zb = key & MASK_21;
    const yb = (key >> 21n) & MASK_21;
    const xb = (key >> 42n) & MASK_21;

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
    if (this.debugEnabled) {
      this.updateCellVisualization(cell, key);
    }
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
        if (this.debugEnabled) {
          this.removeCellVisualization(oldKey);
        }
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
      const oldKey = Grid.keyFromTriple(oldCell);
      const oldBucket = this.cells.get(oldKey);
      if (oldBucket) {
        oldBucket.delete(entity);
        if (oldBucket.size === 0) {
          this.cells.delete(oldKey);
          if (this.debugEnabled) {
            this.removeCellVisualization(oldKey);
          }
        }
      }

      const newKey = Grid.keyFromTriple(newCell);
      let newBucket = this.cells.get(newKey);
      if (!newBucket) {
        newBucket = new Set<Entity>();
        this.cells.set(newKey, newBucket);
      }
      newBucket.add(entity);

      this.entityToCell.set(entity, newCell);

      if (this.debugEnabled) {
        this.updateCellVisualization(newCell, newKey);
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

  // Debug visualization methods
  private createCellMesh(cell: CellTriple, color: BJS.Color3): BJS.Mesh {
    const size = this.cellSize;
    const box = BABYLON.MeshBuilder.CreateBox(
      `cell_${cell[0]}_${cell[1]}_${cell[2]}`,
      { size, updatable: true },
      this.scene,
    );
    box.position = new BABYLON.Vector3(
      cell[0] * size + size / 2,
      cell[1] * size + size / 2,
      cell[2] * size + size / 2,
    );

    const material = new BABYLON.StandardMaterial(
      `mat_${cell[0]}_${cell[1]}_${cell[2]}`,
      this.scene,
    );
    material.emissiveColor = color;
    material.wireframe = true;
    box.material = material;

    return box;
  }

  private updateCellVisualization(cell: CellTriple, key: bigint): void {
    if (!this.debugEnabled) {
      return;
    }

    if (!this.debugMeshes.has(key)) {
      const mesh = this.createCellMesh(cell, new BABYLON.Color3(0, 1, 0)); // Green for active cells
      this.debugMeshes.set(key, mesh);
    }
  }

  private removeCellVisualization(key: bigint): void {
    if (!this.debugEnabled) {
      return;
    }

    const mesh = this.debugMeshes.get(key);
    if (mesh) {
      mesh.dispose();
      this.debugMeshes.delete(key);
    }
  }

  private updateDebugVisualization(): void {
    if (!this.debugEnabled) {
      return;
    }

    // Update player cell visualization
    const playerCell = this.worldToCell(this.playerPosition);
    if (this.playerCellMesh) {
      this.playerCellMesh.dispose();
    }
    this.playerCellMesh = this.createCellMesh(
      playerCell,
      new BABYLON.Color3(0, 0, 1),
    ); // Blue for player cell

    // Update neighbor cells visualization
    const neighborKeys = new Set<bigint>();
    for (const [dx, dy, dz] of Grid.neighborOffsets) {
      const neighbor: CellTriple = [
        playerCell[0] + dx,
        playerCell[1] + dy,
        playerCell[2] + dz,
      ];
      const key = Grid.keyFromTriple(neighbor);
      neighborKeys.add(key);

      if (!this.debugMeshes.has(key) && !this.cells.has(key)) {
        const mesh = this.createCellMesh(neighbor, new BABYLON.Color3(1, 1, 0)); // Yellow for neighbors
        this.debugMeshes.set(key, mesh);
      }
    }

    // Remove outdated neighbor visualizations
    for (const [key, mesh] of this.debugMeshes) {
      if (!this.cells.has(key) && !neighborKeys.has(key)) {
        mesh.dispose();
        this.debugMeshes.delete(key);
      }
    }
  }

  private clearDebugVisualization(): void {
    if (!this.debugEnabled) {
      return;
    }

    for (const mesh of this.debugMeshes.values()) {
      mesh.dispose();
    }
    this.debugMeshes.clear();
    if (this.playerCellMesh) {
      this.playerCellMesh.dispose();
      this.playerCellMesh = null;
    }
  }

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    if (!enabled) {
      this.clearDebugVisualization();
    } else {
      // Update visualization for all active cells
      for (const [key, bucket] of this.cells) {
        if (bucket.size > 0) {
          const cell = Grid.tripleFromKey(key);
          this.updateCellVisualization(cell, key);
        }
      }
      this.updateDebugVisualization();
    }
  }
}
