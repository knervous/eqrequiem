import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import {
  buildShadoWorldObjectRenderBatches,
  deserializeShadoWorld,
  ShadoWorldVisibilityCoordinator,
  type ShadoWorldObjectRenderBatch,
  type ShadoWorldSpatialPackage,
} from "@knervous/shado/world";
import ObjectCache from "@/Game/Model/object-cache";

const CULL_INTERVAL_MS = 100;
const DEFAULT_OBJECT_DISTANCE = 1800;

export class ShadoWorldObjectLayer {
  private elapsedMs = CULL_INTERVAL_MS;
  private updatePending = false;
  private readonly visibleStampRows = new Map<number, Uint32Array>();

  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    private readonly coordinator: ShadoWorldVisibilityCoordinator,
    private readonly objectCache: ObjectCache,
    private readonly scene: BJS.Scene,
  ) {}

  static async load(
    zoneName: string,
    objectCache: ObjectCache,
    scene: BJS.Scene,
  ): Promise<ShadoWorldObjectLayer | null> {
    const fileName = `${encodeURIComponent(zoneName.toLowerCase())}.spatial.json.gz`;
    const candidates = [
      `${import.meta.env.BASE_URL}eqrequiem/worlds/${fileName}`,
      `/shado/worlds/${fileName}`,
    ];

    let world: ShadoWorldSpatialPackage | null = null;
    for (const url of candidates) {
      try {
        world = await deserializeShadoWorld(url);
        break;
      } catch {
        // Missing promoted packages are expected while zones migrate one at a time.
      }
    }
    if (!world?.objects?.stamps.id.length) return null;

    const coordinator = await ShadoWorldVisibilityCoordinator.create(world, {
      entityVisibilityWorker: "required",
    });
    const layer = new ShadoWorldObjectLayer(
      world,
      coordinator,
      objectCache,
      scene,
    );
    await layer.refreshVisibility();
    console.info(
      `[ZoneManager] Promoted ${world.objects.stamps.id.length} object stamps ` +
        `across ${world.objects.prototypes.id.length} prototypes from ${fileName}; ` +
        `visibility=${coordinator.worldObjectVisibilityMode}`,
    );
    return layer;
  }

  dispose(): void {
    this.coordinator.dispose();
    this.visibleStampRows.clear();
  }

  tick(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    if (this.elapsedMs < CULL_INTERVAL_MS || this.updatePending) return;
    this.elapsedMs %= CULL_INTERVAL_MS;
    this.updatePending = true;
    void this.refreshVisibility().finally(() => {
      this.updatePending = false;
    });
  }

  private async refreshVisibility(): Promise<void> {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const planes = flattenFrustumPlanes(
      BABYLON.Frustum.GetPlanes(this.scene.getTransformMatrix()),
    );
    const position = camera.globalPosition;
    const cameraPosition: [number, number, number] = [
      position.x,
      position.y,
      position.z,
    ];
    const frame = this.coordinator.reduceWorld(planes, cameraPosition);
    const visibility = this.coordinator.reduceWorldObjects(planes, frame, {
      camera: cameraPosition,
      maxDistance: DEFAULT_OBJECT_DISTANCE,
      // Migrated worlds currently use sparse geometry-derived cells. Stamps
      // outside those cells still receive frustum/distance culling.
      outsideWorldVisible: true,
    });
    const batches = buildShadoWorldObjectRenderBatches(
      this.world,
      visibility.byPrototype,
    );
    await Promise.all(
      batches.map(async (batch) => {
        if (!this.hasBatchChanged(batch)) return;
        try {
          await this.objectCache.setPromotedThinInstances(
            batch.id,
            batch.source,
            this.scene,
            batch.matrices,
          );
        } catch (error) {
          console.warn(
            `[ZoneManager] Failed to upload promoted object batch ${batch.id}`,
            error,
          );
        }
      }),
    );
  }

  private hasBatchChanged(batch: ShadoWorldObjectRenderBatch): boolean {
    const previous = this.visibleStampRows.get(batch.prototype);
    const current = batch.stampIndices;
    if (
      previous?.length === current.length &&
      current.every((stamp, index) => previous[index] === stamp)
    ) {
      return false;
    }
    this.visibleStampRows.set(batch.prototype, current);
    return true;
  }
}

function flattenFrustumPlanes(planes: readonly BJS.Plane[]): Float32Array {
  const values = new Float32Array(planes.length * 4);
  planes.forEach((plane, index) => {
    const offset = index * 4;
    values[offset] = plane.normal.x;
    values[offset + 1] = plane.normal.y;
    values[offset + 2] = plane.normal.z;
    values[offset + 3] = plane.d;
  });
  return values;
}
