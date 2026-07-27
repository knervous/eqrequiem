import { readFile } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";

import * as RecastNavigation from "@recast-navigation/core";

import { prepareDetourMeshSet } from "./detour-mesh-set.js";
import {
  recastToRuntimePoint,
  runtimeToRecastPoint,
} from "./coordinates.js";
import {
  assertNavMeshFitsWorld,
  loadWorldSpatialContract,
} from "./world-spatial.js";
import type {
  NavPoint,
  NavWorkerInboundMessage,
  NavWorkerOutboundMessage,
} from "./types.js";

interface NavWorkerData {
  readonly meshPath: string;
  readonly spatialPath: string;
  readonly zoneKey: string;
  readonly maxNodes: number;
}

interface RecastPathResult {
  readonly success: boolean;
  readonly error?: { readonly name: string };
  readonly path: NavPoint[];
}

interface RecastQuery {
  defaultQueryHalfExtents: NavPoint;
  computePath(start: NavPoint, end: NavPoint): RecastPathResult;
}

interface RecastApi {
  init(): Promise<void>;
  importNavMesh(bytes: Uint8Array): { readonly navMesh: unknown };
  getNavMeshPositionsAndIndices(
    navMesh: unknown,
  ): readonly [ArrayLike<number>, ArrayLike<number>];
  NavMeshQuery: new (
    navMesh: unknown,
    options: { readonly maxNodes: number },
  ) => RecastQuery;
}

const port = parentPort;
if (!port) throw new Error("Navigation worker requires a parent port");
const data = workerData as NavWorkerData;

try {
  // The package's generated declarations use extensionless ESM re-exports,
  // which NodeNext cannot follow, while its runtime namespace is valid.
  const recast = RecastNavigation as unknown as RecastApi;
  await recast.init();
  const source = new Uint8Array(await readFile(data.meshPath));
  const prepared = prepareDetourMeshSet(source);
  const { navMesh } = recast.importNavMesh(prepared.bytes);
  const world = await loadWorldSpatialContract(data.spatialPath, data.zoneKey);
  const [navPositions] = recast.getNavMeshPositionsAndIndices(navMesh);
  assertNavMeshFitsWorld(navPositions, world);
  const query = new recast.NavMeshQuery(navMesh, { maxNodes: data.maxNodes });
  // EQEmu uses (10, 200, 10) after mapping EQ Z to Recast Y.
  query.defaultQueryHalfExtents = { x: 10, y: 200, z: 10 };

  port.on("message", (message: NavWorkerInboundMessage) => {
    if (message.type !== "find_path") return;
    const result = query.computePath(
      runtimeToRecastPoint(message.start),
      runtimeToRecastPoint(message.end),
    );
    if (!result.success) {
      port.postMessage({
        type: "error",
        requestId: message.requestId,
        message: result.error?.name ?? "Detour path query failed",
      } satisfies NavWorkerOutboundMessage);
      return;
    }
    port.postMessage({
      type: "path",
      requestId: message.requestId,
      zoneId: message.zoneId,
      instanceId: message.instanceId,
      path: result.path.map(recastToRuntimePoint),
    } satisfies NavWorkerOutboundMessage);
  });
  port.postMessage({
    type: "ready",
    tileCount: prepared.tileCount,
    layoutHash: world.layoutHash,
  } satisfies NavWorkerOutboundMessage);
} catch (cause: unknown) {
  port.postMessage({
    type: "error",
    message: cause instanceof Error ? cause.message : String(cause),
  } satisfies NavWorkerOutboundMessage);
}
