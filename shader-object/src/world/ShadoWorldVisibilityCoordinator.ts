import type { ShadoWorldSpatialPackage, WorldVec3 } from './types';
import { ShadoWorldReducer, type ShadoWorldReductionView } from './ShadoWorldReducer';
import {
  ShadoEntityVisibilityWorker,
  type ShadoEntityVisibilityWorkerResult,
  type ShadoEntityVisibilityWorkerStats,
  type ShadoVisibilityWorkerPort,
} from './ShadoEntityVisibilityWorker';

export const ShadoVisibilityBits = {
  Pvs: 1 << 0,
  Geometry: 1 << 1,
  Frustum: 1 << 2,
  Distance: 1 << 3,
  Loaded: 1 << 4,
  Phase: 1 << 5,
  PortalReachable: 1 << 6,
  Visible: 1 << 7,
} as const;

export type ShadoWorldVisibilityMasks = {
  /** Byte-per-cell sidecar; zero means the cell is not resident. */
  loadedCells?: ArrayLike<number>;
  /** Byte-per-cell sidecar; zero excludes the cell from the active render phase. */
  phaseCells?: ArrayLike<number>;
  /** Byte-per-cell sidecar produced by dynamic portal/door reachability. */
  portalReachableCells?: ArrayLike<number>;
};

export type ShadoWorldVisibilityFrame = ShadoWorldReductionView & {
  cameraCell: number;
  cameraRegion: number;
};

export type ShadoEntityVisibilitySoA = {
  count: number;
  positionX: ArrayLike<number>;
  positionY: ArrayLike<number>;
  positionZ: ArrayLike<number>;
  radius?: ArrayLike<number>;
};

export type ShadoEntityVisibilityOptions = {
  camera: WorldVec3;
  maxDistance?: number;
  defaultRadius?: number;
  /** Keep entities outside packaged cells visible if their render tests pass. */
  outsideWorldVisible?: boolean;
};

export type ShadoEntityVisibilityResult = {
  visibleIndices: Uint32Array;
  flags: Uint8Array;
};

export type ShadoWorldObjectVisibilityResult = ShadoEntityVisibilityResult & {
  /** Stamp indices compacted per prototype, ready for thin-instance buffers. */
  byPrototype: Uint32Array[];
};

export type ShadoWorldVisibilityCoordinatorOptions = {
  /**
   * `auto` (default) uses the worker whenever SharedArrayBuffer and Worker are
   * available. `disabled` forces the legacy synchronous path. `required`
   * rejects creation instead of falling back when worker setup fails.
   */
  entityVisibilityWorker?: 'auto' | 'disabled' | 'required';
  /** Test/host override for constructing the persistent worker. */
  workerFactory?: (source: string) => ShadoVisibilityWorkerPort;
  /** Retain entity-indexed reason flags, or publish compact visible IDs only. */
  worldObjectVisibilityFlags?: 'full' | 'compact-only';
  /** Optional worker request cadence. Omit or set to zero for legacy every-call requests. */
  worldObjectVisibilityHz?: number;
};

export type ShadoVisibilityReducibleContainer = {
  instanceCount: number;
  children: ReadonlyArray<{ translation: ArrayLike<number> }>;
  applyVisibilityReduction(indices: ArrayLike<number>, flags?: ArrayLike<number>): void;
};

/**
 * Coordinates immutable world visibility with mutable entity visibility.
 * WASM owns PVS expansion, region policy projection, BVH traversal, policy
 * intersection, and compaction. This layer only locates camera topology and
 * coordinates immutable-world and mutable-entity passes.
 */
export class ShadoWorldVisibilityCoordinator {
  private readonly tileByCoordinate = new Map<string, number>();
  private entityX = new Float32Array(0);
  private entityY = new Float32Array(0);
  private entityZ = new Float32Array(0);
  private entityRadius = new Float32Array(0);
  private lastWorldObjectVisibility: ShadoWorldObjectVisibilityResult | null = null;
  private cameraEpoch = 0;
  private cellEpoch = 0;
  private policyEpoch = 0;
  private lastCameraSignature = 0;
  private lastCellSignature = 0;
  private lastPolicySignature = 0;

  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    private readonly reducer: ShadoWorldReducer,
    private worldObjectWorker: ShadoEntityVisibilityWorker | null,
    private readonly worldObjectMinimumIntervalMs: number
  ) {
    world.tiles.x.forEach((x, cell) => {
      this.tileByCoordinate.set(`${x},${world.tiles.z[cell]}`, cell);
    });
  }

  public static async create(
    world: ShadoWorldSpatialPackage,
    options: ShadoWorldVisibilityCoordinatorOptions = {}
  ): Promise<ShadoWorldVisibilityCoordinator> {
    const reducer = await ShadoWorldReducer.create(world);
    const mode = options.entityVisibilityWorker ?? 'auto';
    const stamps = world.objects?.stamps;
    let worker: ShadoEntityVisibilityWorker | null = null;
    const canConstructWorker =
      mode !== 'disabled' &&
      stamps &&
      stamps.id.length > 0 &&
      (ShadoEntityVisibilityWorker.supported || options.workerFactory !== undefined);
    if (canConstructWorker) {
      try {
        worker = await ShadoEntityVisibilityWorker.create(world, {
          capacity: stamps.id.length,
          publishFlags: options.worldObjectVisibilityFlags !== 'compact-only',
          workerFactory: options.workerFactory,
        });
        worker.projection.load({
          count: stamps.id.length,
          positionX: stamps.positionX,
          positionY: stamps.positionY,
          positionZ: stamps.positionZ,
          radius: stamps.radius,
        });
        worker.projection.enabled.set(Uint8Array.from(stamps.enabled));
        worker.projection.phaseMask.set(Uint32Array.from(stamps.phaseMask));
      } catch (error) {
        if (mode === 'required') throw error;
        console.warn(
          '[Shado] Entity visibility worker initialization failed; using synchronous reduction',
          error
        );
      }
    } else if (mode === 'required' && stamps?.id.length) {
      throw new Error(
        'Entity visibility worker is required but SharedArrayBuffer or Worker is unavailable'
      );
    }
    const hz = Math.max(0, options.worldObjectVisibilityHz ?? 0);
    return new ShadoWorldVisibilityCoordinator(world, reducer, worker, hz > 0 ? 1000 / hz : 0);
  }

  public get worldObjectVisibilityMode(): 'worker' | 'synchronous' {
    return this.worldObjectWorker ? 'worker' : 'synchronous';
  }

  public get worldObjectVisibilityWorkerStats(): ShadoEntityVisibilityWorkerStats | null {
    return this.worldObjectWorker?.stats ?? null;
  }

  public reduceWorld(
    planes: ArrayLike<number>,
    camera: WorldVec3,
    masks: ShadoWorldVisibilityMasks = {}
  ): ShadoWorldVisibilityFrame {
    const cameraCell = this.locateCell(camera[0], camera[2]);
    const cameraRegion = this.locateRegion(camera[0], camera[2]);
    const reduced = this.reducer.reduceWorld({
      planes,
      cameraCell,
      cameraRegion,
      loadedCells: masks.loadedCells,
      phaseCells: masks.phaseCells,
      portalReachableCells: masks.portalReachableCells,
    });
    return {
      ...reduced,
      cameraCell,
      cameraRegion,
    };
  }

  public reduceEntities(
    entities: ShadoEntityVisibilitySoA,
    planes: ArrayLike<number>,
    frame: ShadoWorldVisibilityFrame,
    options: ShadoEntityVisibilityOptions
  ): ShadoEntityVisibilityResult {
    if (planes.length < 24) throw new Error('Entity visibility requires six vec4 frustum planes');
    const count = Math.max(0, entities.count | 0);
    const defaultRadius = Math.max(0, options.defaultRadius ?? 0);
    let radius = entities.radius;
    if (!radius) {
      this.ensureEntityScratch(count);
      this.entityRadius.fill(defaultRadius, 0, count);
      radius = this.entityRadius;
    }
    const result = this.reducer.reduceEntities({
      count,
      positionX: entities.positionX,
      positionY: entities.positionY,
      positionZ: entities.positionZ,
      radius,
      planesPtr: frame.planesPtr,
      cellFlagsPtr: frame.regionFlagsSlice.ptr,
      camera: options.camera,
      maxDistance: options.maxDistance,
      outsideWorldVisible: options.outsideWorldVisible,
    });
    // Growing the synchronous entity scratch slab can detach prior WASM views;
    // pointers remain stable, so refresh the frame without copying any bytes.
    this.reducer.refreshWorldReductionViews(frame);
    return result;
  }

  /** Convenience bridge for the existing AoS actor records and SoA flag planes. */
  public reduceContainer(
    container: ShadoVisibilityReducibleContainer,
    planes: ArrayLike<number>,
    frame: ShadoWorldVisibilityFrame,
    options: ShadoEntityVisibilityOptions
  ): ShadoEntityVisibilityResult {
    this.ensureEntityScratch(container.instanceCount);
    for (let i = 0; i < container.instanceCount; i++) {
      const translation = container.children[i].translation;
      this.entityX[i] = Number(translation[0] ?? 0);
      this.entityY[i] = Number(translation[1] ?? 0);
      this.entityZ[i] = Number(translation[2] ?? 0);
      this.entityRadius[i] = Math.abs(Number(translation[3] ?? 1)) * (options.defaultRadius ?? 0);
    }
    const result = this.reduceEntities(
      {
        count: container.instanceCount,
        positionX: this.entityX,
        positionY: this.entityY,
        positionZ: this.entityZ,
        radius: this.entityRadius,
      },
      planes,
      frame,
      options
    );
    container.applyVisibilityReduction(result.visibleIndices, result.flags);
    return result;
  }

  /**
   * Culls immutable stamped world objects through the same PVS/frustum pass as
   * entities, then compacts visible stamp rows by prototype for thin instancing.
   */
  public reduceWorldObjects(
    planes: ArrayLike<number>,
    frame: ShadoWorldVisibilityFrame,
    options: ShadoEntityVisibilityOptions & { activePhaseMask?: number }
  ): ShadoWorldObjectVisibilityResult {
    const objects = this.world.objects;
    if (!objects) {
      return { visibleIndices: new Uint32Array(), flags: new Uint8Array(), byPrototype: [] };
    }
    if (this.worldObjectWorker) {
      try {
        const latest = this.worldObjectWorker.acquireLatest();
        if (this.worldObjectMinimumIntervalMs > 0) {
          this.updateVisibilityEpochs(planes, frame.regionFlags, options);
          this.worldObjectWorker.requestScheduled(planes, frame.regionFlags, options, {
            cameraEpoch: this.cameraEpoch,
            cellEpoch: this.cellEpoch,
            policyEpoch: this.policyEpoch,
            minimumIntervalMs: this.worldObjectMinimumIntervalMs,
          });
        } else {
          this.worldObjectWorker.request(planes, frame.regionFlags, options);
        }
        if (latest) {
          this.lastWorldObjectVisibility = this.groupWorldObjectVisibility(latest);
        }
        if (this.lastWorldObjectVisibility) return this.lastWorldObjectVisibility;
        // Bootstrap exactly once so the first frame has a coherent draw list.
        this.lastWorldObjectVisibility = this.reduceWorldObjectsSynchronously(
          planes,
          frame,
          options
        );
        return this.lastWorldObjectVisibility;
      } catch (error) {
        console.warn(
          '[Shado] Entity visibility worker failed; reverting to synchronous reduction',
          error
        );
        this.worldObjectWorker.dispose();
        this.worldObjectWorker = null;
        this.lastWorldObjectVisibility = null;
      }
    }
    return this.reduceWorldObjectsSynchronously(planes, frame, options);
  }

  public dispose(): void {
    this.worldObjectWorker?.dispose();
    this.lastWorldObjectVisibility = null;
  }

  private reduceWorldObjectsSynchronously(
    planes: ArrayLike<number>,
    frame: ShadoWorldVisibilityFrame,
    options: ShadoEntityVisibilityOptions & { activePhaseMask?: number }
  ): ShadoWorldObjectVisibilityResult {
    const objects = this.world.objects;
    if (!objects) {
      return { visibleIndices: new Uint32Array(), flags: new Uint8Array(), byPrototype: [] };
    }
    const stamps = objects.stamps;
    const reduced = this.reduceEntities(
      {
        count: stamps.id.length,
        positionX: stamps.positionX,
        positionY: stamps.positionY,
        positionZ: stamps.positionZ,
        radius: stamps.radius,
      },
      planes,
      frame,
      options
    );
    return this.groupWorldObjectVisibility(reduced, options.activePhaseMask);
  }

  private groupWorldObjectVisibility(
    reduced: ShadoEntityVisibilityResult | ShadoEntityVisibilityWorkerResult,
    activePhaseMaskValue?: number
  ): ShadoWorldObjectVisibilityResult {
    const objects = this.world.objects;
    if (!objects) {
      return { visibleIndices: new Uint32Array(), flags: new Uint8Array(), byPrototype: [] };
    }
    const stamps = objects.stamps;
    const activePhaseMask = activePhaseMaskValue ?? 0xffffffff;
    const visible: number[] = [];
    const byPrototype = Array.from({ length: objects.prototypes.id.length }, () => [] as number[]);
    for (const stamp of reduced.visibleIndices) {
      if (!stamps.enabled[stamp] || !(stamps.phaseMask[stamp] & activePhaseMask)) {
        if (stamp < reduced.flags.length) {
          reduced.flags[stamp] &= ~ShadoVisibilityBits.Visible;
        }
        continue;
      }
      visible.push(stamp);
      byPrototype[stamps.prototype[stamp]].push(stamp);
    }
    return {
      visibleIndices: Uint32Array.from(visible),
      flags: reduced.flags,
      byPrototype: byPrototype.map(indices => Uint32Array.from(indices)),
    };
  }

  public locateCell(x: number, z: number): number {
    const tileX = Math.floor((x - this.world.tiles.originX) / this.world.tiles.size);
    const tileZ = Math.floor((z - this.world.tiles.originZ) / this.world.tiles.size);
    return this.tileByCoordinate.get(`${tileX},${tileZ}`) ?? -1;
  }

  public locateRegion(x: number, z: number): number {
    const visibility = this.world.visibility;
    if (!visibility) return this.locateCell(x, z);
    const regionX = Math.floor((x - visibility.originX) / visibility.size);
    const regionZ = Math.floor((z - visibility.originZ) / visibility.size);
    if (regionX < 0 || regionX >= visibility.width || regionZ < 0 || regionZ >= visibility.height)
      return -1;
    return regionZ * visibility.width + regionX;
  }

  private ensureEntityScratch(count: number): void {
    if (this.entityX.length >= count) return;
    let capacity = Math.max(4, this.entityX.length);
    while (capacity < count) capacity *= 2;
    this.entityX = new Float32Array(capacity);
    this.entityY = new Float32Array(capacity);
    this.entityZ = new Float32Array(capacity);
    this.entityRadius = new Float32Array(capacity);
  }

  private updateVisibilityEpochs(
    planes: ArrayLike<number>,
    cellFlags: ArrayLike<number>,
    options: ShadoEntityVisibilityOptions & { activePhaseMask?: number }
  ): void {
    const cameraSignature = hashNumbers(planes, 24);
    if (cameraSignature !== this.lastCameraSignature) {
      this.lastCameraSignature = cameraSignature;
      this.cameraEpoch++;
    }
    const cellSignature = hashNumbers(cellFlags, cellFlags.length);
    if (cellSignature !== this.lastCellSignature) {
      this.lastCellSignature = cellSignature;
      this.cellEpoch++;
    }
    const policySignature = hashNumbers(
      [
        options.camera[0],
        options.camera[1],
        options.camera[2],
        options.maxDistance ?? 0,
        options.outsideWorldVisible === false ? 0 : 1,
        options.activePhaseMask ?? 0xffffffff,
      ],
      6
    );
    if (policySignature !== this.lastPolicySignature) {
      this.lastPolicySignature = policySignature;
      this.policyEpoch++;
    }
  }
}

function hashNumbers(values: ArrayLike<number>, count: number): number {
  let hash = 2166136261;
  const limit = Math.min(values.length, count);
  const scratch = new DataView(new ArrayBuffer(4));
  for (let index = 0; index < limit; index++) {
    scratch.setFloat32(0, Number(values[index] ?? 0), true);
    const bits = scratch.getUint32(0, true);
    hash ^= bits;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
