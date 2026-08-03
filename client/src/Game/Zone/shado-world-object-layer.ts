import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import {
  buildShadoWorldObjectRenderBatches,
  ShadoWorldVisibilityCoordinator,
  type ShadoWorldObjectRenderBatch,
  type ShadoWorldSpatialPackage,
} from "@knervous/shado/world";
import ObjectCache from "@/Game/Model/object-cache";
import {
  flattenWorldFrustumPlanes,
  WORLD_VISIBILITY_INTERVAL_MS,
} from "./world-visibility-policy";

const DEFAULT_OBJECT_DISTANCE = 1800;
const WORLD_OBJECT_PACKAGE_REVISION = "babylon-rhs-y-up-v3";

export class ShadoWorldObjectLayer {
  private elapsedMs = WORLD_VISIBILITY_INTERVAL_MS;
  private updatePending = false;
  private readonly visibleStampRows = new Map<number, Uint32Array>();

  private constructor(
    public readonly world: ShadoWorldSpatialPackage,
    private readonly coordinator: ShadoWorldVisibilityCoordinator,
    private readonly objectCache: ObjectCache,
    private readonly scene: BJS.Scene,
  ) {}

  static async fromWorld(
    world: ShadoWorldSpatialPackage,
    coordinator: ShadoWorldVisibilityCoordinator,
    objectCache: ObjectCache,
    scene: BJS.Scene,
  ): Promise<ShadoWorldObjectLayer | null> {
    if (!world.objects?.stamps.id.length) return null;
    const layer = new ShadoWorldObjectLayer(
      world,
      coordinator,
      objectCache,
      scene,
    );
    await layer.refreshVisibility();
    return layer;
  }

  dispose(): void {
    this.visibleStampRows.clear();
  }

  tick(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    if (this.elapsedMs < WORLD_VISIBILITY_INTERVAL_MS || this.updatePending) {
      return;
    }
    this.elapsedMs %= WORLD_VISIBILITY_INTERVAL_MS;
    this.updatePending = true;
    void this.refreshVisibility().finally(() => {
      this.updatePending = false;
    });
  }

  private async refreshVisibility(): Promise<void> {
    const camera = this.scene.activeCamera;
    if (!camera) return;

    // Zone ticks run from onBeforeRender, before Babylon refreshes the scene's
    // combined view/projection matrix for the active camera.
    this.scene.updateTransformMatrix(true);
    const planes = flattenWorldFrustumPlanes(
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
      // Continuous visibility regions cover courtyards/roads even where no
      // geometry centroid produced a render cell.
      outsideWorldVisible: false,
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
            revisionedObjectSource(batch.source),
            this.scene,
            batch.matrices,
            batch.colors,
            this.world.lighting?.mode === "baked",
          );
          this.visibleStampRows.set(batch.prototype, batch.stampIndices);
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
    return true;
  }
}

function revisionedObjectSource(source: string): string {
  const hash = source.indexOf("#");
  const suffix = hash >= 0 ? source.slice(hash) : "";
  const path = hash >= 0 ? source.slice(0, hash) : source;
  const separator = path.includes("?") ? "&" : "?";
  return (
    `${path}${separator}revision=${WORLD_OBJECT_PACKAGE_REVISION}` + suffix
  );
}
