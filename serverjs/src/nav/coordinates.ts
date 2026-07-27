import type { NavPoint } from "./types.js";

/**
 * Requiem runtime is Babylon Y-up after legacy zone preprocessing:
 * runtime X = -EQ Y, runtime Y = EQ Z, runtime Z = EQ X.
 * Recast is Y-up with X = EQ X and Z = EQ Y.
 */
export function runtimeToRecastPoint(point: NavPoint): NavPoint {
  return { x: point.z, y: point.y, z: -point.x };
}

export function recastToRuntimePoint(point: NavPoint): NavPoint {
  return { x: -point.z, y: point.y, z: point.x };
}
