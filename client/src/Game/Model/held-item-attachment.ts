import { Matrix, type DeepImmutable } from "@babylonjs/core";

export function createHeldItemBindTransform(
  socketBindTransform: DeepImmutable<Matrix>,
  runtimeScale: number,
): Matrix {
  if (!Number.isFinite(runtimeScale) || runtimeScale <= 0) {
    throw new Error(`Invalid held-item runtime scale: ${runtimeScale}`);
  }
  return Matrix.Scaling(
    1 / runtimeScale,
    1 / runtimeScale,
    1 / runtimeScale,
  ).multiply(socketBindTransform);
}

export function heldItemLocalYOffset(
  hasBindTransform: boolean,
  spawnScale: number,
): number {
  return hasBindTransform ? 0 : spawnScale * 0.5;
}
