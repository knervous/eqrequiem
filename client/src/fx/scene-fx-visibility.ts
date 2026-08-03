import type * as BJS from "@babylonjs/core";
import BABYLON from "@bjs";
import {
  extractShadoWorldFxRegions,
  ShadoVisibilityBits,
  type ShadoWorldFxCullProfile,
  type ShadoWorldFxRegion,
  type ShadoWorldSpatialPackage,
  type ShadoWorldVisibilityCoordinator,
} from "@knervous/shado/world";

export type SceneFxCullProfile = {
  maxDistance: number;
  fadeDistance: number;
  updateHz: number;
  guardDistance: number;
};

export const SCENE_FX_CULL_PROFILES: Record<
  Exclude<ShadoWorldFxCullProfile, "always">,
  SceneFxCullProfile
> = {
  "near-detail": {
    maxDistance: 120,
    fadeDistance: 24,
    updateHz: 15,
    guardDistance: 16,
  },
  "mid-atmosphere": {
    maxDistance: 420,
    fadeDistance: 64,
    updateHz: 10,
    guardDistance: 32,
  },
  "far-landmark": {
    maxDistance: 1_200,
    fadeDistance: 160,
    updateHz: 5,
    guardDistance: 64,
  },
};

export type SceneFxVisibilityTarget = {
  id: string;
  center: readonly [number, number, number];
  radius: number;
  profile: ShadoWorldFxCullProfile;
  maxDistance?: number;
  updateHz?: number;
  outsideWorldVisible?: boolean;
  phaseMask?: number;
  setActive(active: boolean): void;
};

type VisibilityGroup = {
  key: string;
  profile: Exclude<ShadoWorldFxCullProfile, "always">;
  maxDistance: number;
  updateIntervalMs: number;
  outsideWorldVisible: boolean;
  elapsedMs: number;
  targets: SceneFxVisibilityTarget[];
};

/**
 * Reduces scene FX anchors through Shado's existing PVS/cell/frustum/distance
 * path. Effect factories own rendering; this layer owns only visibility and
 * never adds per-effect camera loops.
 */
export class ShadoSceneFxVisibility {
  readonly authoredPatterns: readonly ShadoWorldFxRegion[];

  private readonly groups = new Map<string, VisibilityGroup>();
  private readonly alwaysTargets = new Set<SceneFxVisibilityTarget>();
  private disposed = false;
  private activePhaseMask = 0xffffffff;

  constructor(
    world: ShadoWorldSpatialPackage,
    private readonly coordinator: ShadoWorldVisibilityCoordinator,
    private readonly scene: BJS.Scene,
  ) {
    this.authoredPatterns = extractShadoWorldFxRegions(world);
  }

  register(target: SceneFxVisibilityTarget): () => void {
    if (this.disposed) throw new Error("Scene FX visibility is disposed");
    if (
      target.center.some((value) => !Number.isFinite(value)) ||
      !Number.isFinite(target.radius) ||
      target.radius < 0
    ) {
      throw new Error(`Scene FX target '${target.id}' has invalid bounds`);
    }
    if (target.profile === "always") {
      this.alwaysTargets.add(target);
      this.applyAlwaysTarget(target);
      return () => {
        this.alwaysTargets.delete(target);
        target.setActive(false);
      };
    }
    const defaults = SCENE_FX_CULL_PROFILES[target.profile];
    const maxDistance = target.maxDistance ?? defaults.maxDistance;
    const updateHz = target.updateHz ?? defaults.updateHz;
    if (
      !Number.isFinite(maxDistance) ||
      maxDistance <= 0 ||
      !Number.isFinite(updateHz) ||
      updateHz <= 0
    ) {
      throw new Error(
        `Scene FX target '${target.id}' has invalid culling policy`,
      );
    }
    const outsideWorldVisible = target.outsideWorldVisible ?? true;
    const key = [
      target.profile,
      maxDistance,
      updateHz,
      outsideWorldVisible ? 1 : 0,
    ].join(":");
    let group = this.groups.get(key);
    if (!group) {
      const updateIntervalMs = 1_000 / updateHz;
      group = {
        key,
        profile: target.profile,
        maxDistance,
        updateIntervalMs,
        outsideWorldVisible,
        elapsedMs: updateIntervalMs,
        targets: [],
      };
      this.groups.set(key, group);
    }
    group.targets.push(target);
    target.setActive(false);
    return () => {
      const index = group!.targets.indexOf(target);
      if (index >= 0) group!.targets.splice(index, 1);
      target.setActive(false);
      if (!group!.targets.length) this.groups.delete(group!.key);
    };
  }

  registerAuthoredPattern(
    region: ShadoWorldFxRegion,
    setActive: (active: boolean) => void,
  ): () => void {
    const culling = region.pattern.culling;
    return this.register({
      id: region.id,
      center: region.center,
      radius: region.radius,
      profile: culling.profile,
      maxDistance: culling.maxDistance,
      updateHz: culling.updateHz,
      outsideWorldVisible: culling.outsideWorldVisible,
      phaseMask: region.phaseMask,
      setActive,
    });
  }

  setPhaseMask(mask: number): void {
    this.activePhaseMask = mask >>> 0;
    for (const target of this.alwaysTargets) this.applyAlwaysTarget(target);
  }

  registerMesh(
    mesh: BJS.Mesh,
    options: Omit<SceneFxVisibilityTarget, "center" | "radius" | "setActive">,
  ): () => void {
    mesh.computeWorldMatrix(true);
    // thinInstanceRefreshBoundingInfo() has already aggregated every instance
    // into this mesh's bounds. A normal refresh here would collapse those
    // bounds back to the shared template geometry at the origin and make the
    // reducer cull otherwise-visible cells.
    if (!mesh.hasThinInstances) mesh.refreshBoundingInfo();
    const sphere = mesh.getBoundingInfo().boundingSphere;
    return this.register({
      ...options,
      center: [
        sphere.centerWorld.x,
        sphere.centerWorld.y,
        sphere.centerWorld.z,
      ],
      radius: sphere.radiusWorld,
      setActive: (active) => mesh.setEnabled(active),
    });
  }

  tick(deltaMs: number): void {
    if (this.disposed || !this.groups.size) return;
    const camera = this.scene.activeCamera;
    if (!camera) return;

    const dueGroups: VisibilityGroup[] = [];
    for (const group of this.groups.values()) {
      group.elapsedMs += Math.max(0, deltaMs);
      if (group.elapsedMs >= group.updateIntervalMs) {
        group.elapsedMs %= group.updateIntervalMs;
        dueGroups.push(group);
      }
    }
    if (!dueGroups.length) return;

    this.scene.updateTransformMatrix(true);
    const guardDistance = Math.max(
      ...dueGroups.map(
        (group) => SCENE_FX_CULL_PROFILES[group.profile].guardDistance,
      ),
    );
    const planes = flattenGuardedFrustum(
      BABYLON.Frustum.GetPlanes(this.scene.getTransformMatrix()),
      guardDistance,
    );
    const position = camera.globalPosition;
    const cameraPosition: [number, number, number] = [
      position.x,
      position.y,
      position.z,
    ];
    const frame = this.coordinator.reduceWorld(planes, cameraPosition);

    for (const group of dueGroups) {
      const positions = targetPositions(group.targets);
      const visibility = this.coordinator.reduceEntities(
        positions,
        planes,
        frame,
        {
          camera: cameraPosition,
          maxDistance:
            group.maxDistance +
            SCENE_FX_CULL_PROFILES[group.profile].guardDistance,
          outsideWorldVisible: group.outsideWorldVisible,
        },
      );
      group.targets.forEach((target, index) => {
        const phaseVisible =
          ((target.phaseMask ?? 0xffffffff) & this.activePhaseMask) !== 0;
        target.setActive(
          phaseVisible &&
            !!(visibility.flags[index] & ShadoVisibilityBits.Visible),
        );
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const group of this.groups.values()) {
      for (const target of group.targets) target.setActive(false);
    }
    this.groups.clear();
    for (const target of this.alwaysTargets) target.setActive(false);
    this.alwaysTargets.clear();
  }

  private applyAlwaysTarget(target: SceneFxVisibilityTarget): void {
    const phaseVisible =
      ((target.phaseMask ?? 0xffffffff) & this.activePhaseMask) !== 0;
    target.setActive(phaseVisible);
  }
}

function targetPositions(targets: readonly SceneFxVisibilityTarget[]) {
  return {
    count: targets.length,
    positionX: targets.map((target) => target.center[0]),
    positionY: targets.map((target) => target.center[1]),
    positionZ: targets.map((target) => target.center[2]),
    radius: targets.map((target) => target.radius),
  };
}

function flattenGuardedFrustum(
  planes: readonly BJS.Plane[],
  guardDistance: number,
): Float32Array {
  return Float32Array.from(
    planes.flatMap((plane) => [
      plane.normal.x,
      plane.normal.y,
      plane.normal.z,
      plane.d + guardDistance * plane.normal.length(),
    ]),
  );
}
