import { Frustum, Plane, type Camera } from "@babylonjs/core";
import {
  ShadoEntityVisibilityWorker,
  type ShadoEntityVisibilityWorkerStats,
} from "@knervous/shado/world";
import type { RequiemEntityActor, ShadoEntityPool } from "./shado-entity-pool";

const VISIBILITY_CAPACITY = 65_536;
const REQUEST_INTERVAL_MS = 1000 / 30;
const ACTOR_RADIUS = 5;

const STANDALONE_VISIBILITY_WORLD = {
  tiles: {
    x: [] as number[],
    z: [] as number[],
    size: 1,
    originX: 0,
    originZ: 0,
  },
};

type Binding = {
  pool: ShadoEntityPool;
  actor: RequiemEntityActor;
  localIndex: number;
  coarseVisible: boolean;
};

type WorldPosition = { x: number; y: number; z: number };

export type RequiemEntityVisibilitySink = {
  acquire(
    pool: ShadoEntityPool,
    actor: RequiemEntityActor,
    localIndex: number,
  ): void;
  release(actor: RequiemEntityActor): void;
  transform(
    actor: RequiemEntityActor,
    position: WorldPosition,
    scale: number,
  ): void;
  visible(actor: RequiemEntityActor, visible: boolean): void;
  detachPool(pool: ShadoEntityPool): void;
};

/**
 * One scene-wide visibility worker shared by every model pool.
 *
 * Entity transforms update the shared projection at their normal mutation
 * points. The render loop publishes only camera state at 30 Hz and partitions
 * completed compact indices back into their owning model pools.
 */
export class RequiemEntityVisibility implements RequiemEntityVisibilitySink {
  private readonly pools = new Set<ShadoEntityPool>();
  private readonly bindingBySlot = new Map<number, Binding>();
  private readonly slotByActor = new WeakMap<RequiemEntityActor, number>();
  private readonly freeSlots: number[] = [];
  private readonly planes = Array.from(
    { length: 6 },
    () => new Plane(0, 0, 0, 0),
  );
  private readonly planeValues = new Float32Array(24);
  private nextSlot = 0;
  private lastRequestTime = -Infinity;
  private hasCompletedResult = false;
  private overflowed = false;

  private constructor(private readonly worker: ShadoEntityVisibilityWorker) {}

  public static async create(): Promise<RequiemEntityVisibility> {
    return new RequiemEntityVisibility(
      await ShadoEntityVisibilityWorker.create(STANDALONE_VISIBILITY_WORLD, {
        capacity: VISIBILITY_CAPACITY,
      }),
    );
  }

  public get stats(): ShadoEntityVisibilityWorkerStats {
    return this.worker.stats;
  }

  public attachPool(pool: ShadoEntityPool): void {
    if (this.pools.has(pool)) return;
    this.pools.add(pool);
    pool.attachVisibilitySink(this);
  }

  public acquire(
    pool: ShadoEntityPool,
    actor: RequiemEntityActor,
    localIndex: number,
  ): void {
    if (this.slotByActor.has(actor)) return;
    const slot = this.freeSlots.pop() ?? this.nextSlot++;
    if (slot >= VISIBILITY_CAPACITY) {
      this.overflowed = true;
      return;
    }
    const translation = actor.translation;
    this.bindingBySlot.set(slot, {
      pool,
      actor,
      localIndex,
      coarseVisible: false,
    });
    this.slotByActor.set(actor, slot);
    this.worker.projection.setEntity(
      slot,
      Number(translation[0] ?? 0),
      Number(translation[1] ?? 0),
      Number(translation[2] ?? 0),
      Math.abs(Number(translation[3] ?? 1)),
    );
    this.worker.projection.setEntityPolicy(slot, false);
    this.worker.projection.count = Math.max(
      this.worker.projection.count,
      slot + 1,
    );
  }

  public release(actor: RequiemEntityActor): void {
    const slot = this.slotByActor.get(actor);
    if (slot === undefined) return;
    this.slotByActor.delete(actor);
    this.bindingBySlot.delete(slot);
    this.worker.projection.setEntityPolicy(slot, false);
    this.freeSlots.push(slot);
  }

  public transform(
    actor: RequiemEntityActor,
    position: WorldPosition,
    scale: number,
  ): void {
    const slot = this.slotByActor.get(actor);
    if (slot === undefined) return;
    this.worker.projection.setEntity(
      slot,
      position.x,
      position.y,
      position.z,
      Math.abs(scale),
    );
  }

  public visible(actor: RequiemEntityActor, visible: boolean): void {
    const slot = this.slotByActor.get(actor);
    if (slot === undefined) return;
    const binding = this.bindingBySlot.get(slot);
    if (!binding) return;
    binding.coarseVisible = visible;
    this.worker.projection.setEntityPolicy(slot, visible);
  }

  public detachPool(pool: ShadoEntityPool): void {
    this.pools.delete(pool);
    for (const [slot, binding] of this.bindingBySlot) {
      if (binding.pool !== pool) continue;
      this.slotByActor.delete(binding.actor);
      this.bindingBySlot.delete(slot);
      this.worker.projection.setEntityPolicy(slot, false);
      this.freeSlots.push(slot);
    }
  }

  /**
   * Returns false only while the first worker result is unavailable or if the
   * fixed zone capacity was exceeded; callers use their synchronous bootstrap.
   */
  public update(camera: Camera, maxDistance: number): boolean {
    if (this.overflowed) return false;
    const latest = this.worker.acquireLatest();
    if (latest) {
      this.apply(latest.visibleIndices);
      this.hasCompletedResult = true;
    }

    const now = performance.now();
    if (now - this.lastRequestTime >= REQUEST_INTERVAL_MS) {
      this.lastRequestTime = now;
      Frustum.GetPlanesToRef(
        camera.getScene().getTransformMatrix(),
        this.planes,
      );
      let offset = 0;
      for (const plane of this.planes) {
        this.planeValues[offset++] = plane.normal.x;
        this.planeValues[offset++] = plane.normal.y;
        this.planeValues[offset++] = plane.normal.z;
        this.planeValues[offset++] = plane.d;
      }
      const position = camera.globalPosition ?? camera.position;
      this.worker.request(this.planeValues, [], {
        camera: [position.x, position.y, position.z],
        maxDistance,
        outsideWorldVisible: true,
        radiusScale: ACTOR_RADIUS,
      });
    }
    return this.hasCompletedResult;
  }

  public dispose(): void {
    for (const pool of this.pools) pool.attachVisibilitySink(null);
    this.pools.clear();
    this.bindingBySlot.clear();
    this.freeSlots.length = 0;
    this.worker.dispose();
  }

  private apply(visibleSlots: ArrayLike<number>): void {
    const byPool = new Map<ShadoEntityPool, number[]>();
    for (const pool of this.pools) byPool.set(pool, []);
    for (let i = 0; i < visibleSlots.length; i++) {
      const binding = this.bindingBySlot.get(Number(visibleSlots[i]) | 0);
      if (!binding?.coarseVisible) continue;
      byPool.get(binding.pool)?.push(binding.localIndex);
    }
    for (const [pool, indices] of byPool) {
      pool.applyWorkerVisibility(indices);
    }
  }
}
