import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

import { recastToRuntimePoint } from "./coordinates.js";
import type { NavPoint } from "./types.js";

interface Bounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface WorldSpatialContract {
  readonly zoneKey: string;
  readonly layoutHash: string;
  readonly bounds: Bounds;
}

export async function loadWorldSpatialContract(
  path: string,
  expectedZoneKey: string,
): Promise<WorldSpatialContract> {
  const source = await readFile(path);
  const bytes =
    source[0] === 0x1f && source[1] === 0x8b
      ? gunzipSync(source)
      : source;
  const world = JSON.parse(bytes.toString("utf8")) as {
    readonly kind?: string;
    readonly version?: number;
    readonly name?: string;
    readonly coordinateSystem?: string;
    readonly sourceTransform?: string;
    readonly bounds?: Bounds;
    readonly collision?: {
      readonly source?: string;
      readonly format?: string;
      readonly vertexCount?: number;
      readonly triangleCount?: number;
      readonly contentHash?: string;
    };
    readonly navigation?: { readonly runtimeToRecast?: string };
    readonly integrity?: {
      readonly algorithm?: string;
      readonly layoutHash?: string;
    };
  };
  const zoneKey = expectedZoneKey.trim().toLowerCase();
  if (
    world.kind !== "shado.world.spatial"
    || world.version !== 5
    || world.name?.toLowerCase() !== zoneKey
    || world.coordinateSystem !== "babylon-y-up"
    || world.sourceTransform !== "mirror-x"
    || world.navigation?.runtimeToRecast !== "z-y-negative-x"
    || world.collision?.format !== "shado-collision-v1"
    || !world.collision.source
    || !Number.isInteger(world.collision.vertexCount)
    || (world.collision.vertexCount ?? 0) <= 0
    || !Number.isInteger(world.collision.triangleCount)
    || (world.collision.triangleCount ?? 0) <= 0
    || !/^[0-9a-f]{8}$/.test(world.collision.contentHash ?? "")
    || world.integrity?.algorithm !== "fnv1a32-layout"
    || !/^[0-9a-f]{8}$/.test(world.integrity.layoutHash ?? "")
    || !validBounds(world.bounds)
  ) {
    throw new Error(`World spatial package for '${zoneKey}' has an incompatible runtime contract`);
  }
  return {
    zoneKey,
    layoutHash: world.integrity.layoutHash!,
    bounds: world.bounds!,
  };
}

export function assertNavMeshFitsWorld(
  recastPositions: ArrayLike<number>,
  world: WorldSpatialContract,
  tolerance = 2,
): void {
  if (recastPositions.length === 0 || recastPositions.length % 3 !== 0) {
    throw new Error(`Navigation mesh for '${world.zoneKey}' has invalid vertex data`);
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < recastPositions.length; index += 3) {
    const point = recastToRuntimePoint({
      x: Number(recastPositions[index]),
      y: Number(recastPositions[index + 1]),
      z: Number(recastPositions[index + 2]),
    });
    accumulateBounds(point, min, max);
  }
  for (let axis = 0; axis < 3; axis++) {
    if (
      min[axis]! < world.bounds.min[axis]! - tolerance
      || max[axis]! > world.bounds.max[axis]! + tolerance
    ) {
      throw new Error(
        `Navigation mesh for '${world.zoneKey}' does not fit spatial package ` +
          `${world.layoutHash} on axis ${axis}`,
      );
    }
  }
}

function validBounds(bounds: Bounds | undefined): boolean {
  return Boolean(
    bounds
    && bounds.min?.length === 3
    && bounds.max?.length === 3
    && [...bounds.min, ...bounds.max].every(Number.isFinite)
    && bounds.min.every((value, axis) => value <= bounds.max[axis]!),
  );
}

function accumulateBounds(
  point: NavPoint,
  min: number[],
  max: number[],
): void {
  [point.x, point.y, point.z].forEach((value, axis) => {
    min[axis] = Math.min(min[axis]!, value);
    max[axis] = Math.max(max[axis]!, value);
  });
}
