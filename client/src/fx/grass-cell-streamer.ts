import type * as BJS from "@babylonjs/core";
import type { ShadoWorldGrassPackage } from "@knervous/shado/world";
import { createGrassCellFromPackage, type GrassCell } from "./grass-geometry";
import { ShadoSceneFxVisibility } from "./scene-fx-visibility";

export const GRASS_NEAR_LOAD_RADIUS = 168;
export const GRASS_NEAR_UNLOAD_RADIUS = 216;
export const GRASS_LOAD_RADIUS = 288;
export const GRASS_UNLOAD_RADIUS = 336;
export const GRASS_NEAR_ENABLE_RADIUS = 140;
export const GRASS_FAR_ENABLE_RADIUS = 272;
export const GRASS_ENABLE_RADIUS = GRASS_FAR_ENABLE_RADIUS;

type ResidentLod = {
  cell: GrassCell;
  unregister: () => void;
};

type ResidentCell = {
  x: number;
  z: number;
  near?: ResidentLod;
  far: ResidentLod;
};

/**
 * Owns Babylon resources only for promoted cells around the player. Cold
 * placement arrays remain in the spatial package until a cell becomes
 * resident. The larger unload radius prevents boundary load/unload churn.
 */
export class PromotedGrassCellStreamer {
  private readonly cellByKey = new Map<string, number>();
  private readonly resident = new Map<number, ResidentCell>();
  private lastCellX = Number.NaN;
  private lastCellZ = Number.NaN;

  constructor(
    private readonly grass: ShadoWorldGrassPackage,
    private readonly nearTemplate: BJS.Mesh,
    private readonly nearMaterial: BJS.Material,
    private readonly farTemplate: BJS.Mesh,
    private readonly farMaterial: BJS.Material,
    private readonly visibility: ShadoSceneFxVisibility,
    private readonly loadRadius = GRASS_LOAD_RADIUS,
    private readonly unloadRadius = GRASS_UNLOAD_RADIUS,
  ) {
    if (unloadRadius <= loadRadius) {
      throw new Error("Grass unload radius must exceed its load radius");
    }
    if (GRASS_NEAR_UNLOAD_RADIUS <= GRASS_NEAR_LOAD_RADIUS) {
      throw new Error("Near grass unload radius must exceed its load radius");
    }
    for (let cell = 0; cell < grass.cells.x.length; cell++) {
      this.cellByKey.set(`${grass.cells.x[cell]}:${grass.cells.z[cell]}`, cell);
    }
  }

  get residentCellCount(): number {
    return this.resident.size;
  }

  update(focusPosition: BJS.Vector3): void {
    const size = this.grass.cellSize;
    const focusCellX = Math.floor(focusPosition.x / size);
    const focusCellZ = Math.floor(focusPosition.z / size);
    if (focusCellX === this.lastCellX && focusCellZ === this.lastCellZ) return;
    this.lastCellX = focusCellX;
    this.lastCellZ = focusCellZ;

    const halfDiagonal = size * 0.70710678;
    const maximumLoadDistance = this.loadRadius + halfDiagonal;
    const candidateRadius = Math.ceil(this.loadRadius / size) + 1;
    for (let dz = -candidateRadius; dz <= candidateRadius; dz++) {
      for (let dx = -candidateRadius; dx <= candidateRadius; dx++) {
        const x = focusCellX + dx;
        const z = focusCellZ + dz;
        const deltaX = (x + 0.5) * size - focusPosition.x;
        const deltaZ = (z + 0.5) * size - focusPosition.z;
        if (
          deltaX * deltaX + deltaZ * deltaZ >
          maximumLoadDistance * maximumLoadDistance
        ) {
          continue;
        }
        const cellIndex = this.cellByKey.get(`${x}:${z}`);
        if (cellIndex === undefined) continue;
        let entry = this.resident.get(cellIndex);
        if (!entry) {
          const far = createGrassCellFromPackage(
            this.farTemplate,
            this.farMaterial,
            this.grass,
            cellIndex,
            0.65,
            {
              lod: "far",
              nameSuffix: ":far",
              sampleRate: 0.22,
              widthScale: 2.35,
              heightScale: 0.58,
              seedSalt: 0x4f1b_bcdc,
            },
          );
          const unregister = this.visibility.registerMesh(far.mesh, {
            id: far.mesh.name,
            profile: "near-detail",
            maxDistance: GRASS_FAR_ENABLE_RADIUS,
          });
          entry = { x, z, far: { cell: far, unregister } };
          this.resident.set(cellIndex, entry);
        }

        const maximumNearLoadDistance = GRASS_NEAR_LOAD_RADIUS + halfDiagonal;
        if (
          !entry.near &&
          deltaX * deltaX + deltaZ * deltaZ <=
            maximumNearLoadDistance * maximumNearLoadDistance
        ) {
          const near = createGrassCellFromPackage(
            this.nearTemplate,
            this.nearMaterial,
            this.grass,
            cellIndex,
            0.65,
            { lod: "near" },
          );
          const unregister = this.visibility.registerMesh(near.mesh, {
            id: near.mesh.name,
            profile: "near-detail",
            maxDistance: GRASS_NEAR_ENABLE_RADIUS,
          });
          entry.near = { cell: near, unregister };
        }
      }
    }

    const minimumUnloadDistance = this.unloadRadius + halfDiagonal;
    const minimumUnloadDistanceSquared =
      minimumUnloadDistance * minimumUnloadDistance;
    const minimumNearUnloadDistance = GRASS_NEAR_UNLOAD_RADIUS + halfDiagonal;
    const minimumNearUnloadDistanceSquared =
      minimumNearUnloadDistance * minimumNearUnloadDistance;
    for (const [cellIndex, entry] of this.resident) {
      const deltaX = (entry.x + 0.5) * size - focusPosition.x;
      const deltaZ = (entry.z + 0.5) * size - focusPosition.z;
      const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
      if (entry.near && distanceSquared > minimumNearUnloadDistanceSquared) {
        entry.near.unregister();
        entry.near.cell.mesh.dispose(false, false);
        entry.near = undefined;
      }
      if (distanceSquared <= minimumUnloadDistanceSquared) {
        continue;
      }
      entry.near?.unregister();
      entry.far.unregister();
      entry.near?.cell.mesh.dispose(false, false);
      entry.far.cell.mesh.dispose(false, false);
      this.resident.delete(cellIndex);
    }
  }

  dispose(): void {
    for (const entry of this.resident.values()) {
      entry.near?.unregister();
      entry.far.unregister();
      entry.near?.cell.mesh.dispose(false, false);
      entry.far.cell.mesh.dispose(false, false);
    }
    this.resident.clear();
  }
}
