import type { ShadoWorldSpatialPackage, WorldVec3 } from './types';
import { ShadoWorldReducer } from './ShadoWorldReducer';
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

const CELL_CANDIDATE_BITS =
  ShadoVisibilityBits.Pvs |
  ShadoVisibilityBits.Loaded |
  ShadoVisibilityBits.Phase |
  ShadoVisibilityBits.PortalReachable;

export type ShadoWorldVisibilityMasks = {
  /** Byte-per-cell sidecar; zero means the cell is not resident. */
  loadedCells?: ArrayLike<number>;
  /** Byte-per-cell sidecar; zero excludes the cell from the active render phase. */
  phaseCells?: ArrayLike<number>;
  /** Byte-per-cell sidecar produced by dynamic portal/door reachability. */
  portalReachableCells?: ArrayLike<number>;
};

export type ShadoWorldVisibilityFrame = {
  cameraCell: number;
  visibleClusters: Uint32Array;
  visiblePackets: Uint32Array;
  clusterFlags: Uint8Array;
  cellFlags: Uint8Array;
  packetFlags: Uint8Array;
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
};

export type ShadoVisibilityReducibleContainer = {
  instanceCount: number;
  children: ReadonlyArray<{ translation: ArrayLike<number> }>;
  applyVisibilityReduction(indices: ArrayLike<number>, flags?: ArrayLike<number>): void;
};

/**
 * Coordinates immutable world visibility with mutable entity visibility.
 * The WASM reducer owns BVH traversal; this layer converts its cluster output
 * into cell/packet masks and intersects those masks with the entity SoA pass.
 */
export class ShadoWorldVisibilityCoordinator {
  private readonly tileByCoordinate = new Map<string, number>();
  private readonly clusterFlagsValue: Uint8Array;
  private readonly cellFlagsValue: Uint8Array;
  private readonly packetFlagsValue: Uint8Array;
  private readonly pvsCellFlags: Uint8Array;
  private entityX = new Float32Array(0);
  private entityY = new Float32Array(0);
  private entityZ = new Float32Array(0);
  private entityRadius = new Float32Array(0);
  private lastWorldObjectVisibility: ShadoWorldObjectVisibilityResult | null = null;

  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    private readonly reducer: ShadoWorldReducer,
    private worldObjectWorker: ShadoEntityVisibilityWorker | null
  ) {
    world.tiles.x.forEach((x, cell) => {
      this.tileByCoordinate.set(`${x},${world.tiles.z[cell]}`, cell);
    });
    this.clusterFlagsValue = new Uint8Array(world.clusters.radius.length);
    this.cellFlagsValue = new Uint8Array(world.tiles.x.length);
    this.packetFlagsValue = new Uint8Array(world.packets.cellId.length);
    this.pvsCellFlags = new Uint8Array(world.tiles.x.length);
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
    return new ShadoWorldVisibilityCoordinator(world, reducer, worker);
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
    const frustumClusters = this.reducer.queryFrustum(planes);
    const cameraCell = this.locateCell(camera[0], camera[2]);
    this.resolvePvs(cameraCell);
    this.clusterFlagsValue.fill(0);
    for (let cell = 0; cell < this.cellFlagsValue.length; cell++) {
      let flags = this.pvsCellFlags[cell];
      if (maskPasses(masks.loadedCells, cell)) flags |= ShadoVisibilityBits.Loaded;
      if (maskPasses(masks.phaseCells, cell)) flags |= ShadoVisibilityBits.Phase;
      if (maskPasses(masks.portalReachableCells, cell)) {
        flags |= ShadoVisibilityBits.PortalReachable;
      }
      this.cellFlagsValue[cell] = flags;
    }
    this.packetFlagsValue.fill(0);
    const visibleClusters: number[] = [];

    for (const cluster of frustumClusters) {
      const cell = this.world.clusters.cellId[cluster];
      const cellPolicy = this.cellFlagsValue[cell] & CELL_CANDIDATE_BITS;
      const candidate = cellPolicy === CELL_CANDIDATE_BITS;
      let flags = cellPolicy | ShadoVisibilityBits.Geometry | ShadoVisibilityBits.Frustum;
      if (candidate) flags |= ShadoVisibilityBits.Visible;
      this.clusterFlagsValue[cluster] = flags;
      if (!candidate) continue;
      visibleClusters.push(cluster);
      this.cellFlagsValue[cell] |=
        ShadoVisibilityBits.Geometry | ShadoVisibilityBits.Frustum | ShadoVisibilityBits.Visible;
      const packet = this.world.clusters.materialPacket[cluster];
      this.packetFlagsValue[packet] |=
        cellPolicy |
        ShadoVisibilityBits.Geometry |
        ShadoVisibilityBits.Frustum |
        ShadoVisibilityBits.Visible;
    }

    const visiblePackets: number[] = [];
    for (let i = 0; i < this.packetFlagsValue.length; i++) {
      if (this.packetFlagsValue[i] & ShadoVisibilityBits.Visible) visiblePackets.push(i);
    }
    return {
      cameraCell,
      visibleClusters: Uint32Array.from(visibleClusters),
      visiblePackets: Uint32Array.from(visiblePackets),
      clusterFlags: this.clusterFlagsValue,
      cellFlags: this.cellFlagsValue,
      packetFlags: this.packetFlagsValue,
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
    return this.reducer.reduceEntities({
      count,
      positionX: entities.positionX,
      positionY: entities.positionY,
      positionZ: entities.positionZ,
      radius,
      planes,
      cellFlags: frame.cellFlags,
      camera: options.camera,
      maxDistance: options.maxDistance,
      outsideWorldVisible: options.outsideWorldVisible,
    });
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
        this.worldObjectWorker.request(planes, frame.cellFlags, options);
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
        reduced.flags[stamp] &= ~ShadoVisibilityBits.Visible;
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

  private resolvePvs(cameraCell: number): void {
    this.pvsCellFlags.fill(0);
    const pvs = this.world.pvs;
    if (cameraCell < 0 || !pvs) {
      this.pvsCellFlags.fill(ShadoVisibilityBits.Pvs);
      return;
    }
    const row = cameraCell * pvs.wordsPerRow;
    for (let cell = 0; cell < this.pvsCellFlags.length; cell++) {
      const word = pvs.words[row + (cell >>> 5)] >>> 0;
      if (word & (1 << (cell & 31))) this.pvsCellFlags[cell] = ShadoVisibilityBits.Pvs;
    }
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
}

function maskPasses(mask: ArrayLike<number> | undefined, cell: number): boolean {
  return mask === undefined || (cell < mask.length && Number(mask[cell]) !== 0);
}
