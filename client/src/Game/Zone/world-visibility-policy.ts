import type * as BJS from "@babylonjs/core";

export const WORLD_VISIBILITY_INTERVAL_MS = 1000 / 30;
export const WORLD_FRUSTUM_GUARD_DISTANCE = 16;

/**
 * Keep a conservative band around the camera frustum. Exact near-plane and
 * edge rejection causes visible gaps while the camera moves between reducer
 * updates, especially for small clusters and stamped props.
 */
export function flattenWorldFrustumPlanes(
  planes: readonly BJS.Plane[],
): Float32Array {
  return Float32Array.from(
    planes.flatMap((plane) => [
      plane.normal.x,
      plane.normal.y,
      plane.normal.z,
      plane.d + WORLD_FRUSTUM_GUARD_DISTANCE * plane.normal.length(),
    ]),
  );
}
