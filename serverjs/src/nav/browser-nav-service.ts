import * as RecastNavigation from "@recast-navigation/core";

import { prepareDetourMeshSet } from "./detour-mesh-set.js";
import {
  recastToRuntimePoint,
  runtimeToRecastPoint,
} from "./coordinates.js";
import type { NavPoint } from "./types.js";

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
  NavMeshQuery: new (
    navMesh: unknown,
    options: { readonly maxNodes: number },
  ) => RecastQuery;
}

export interface BrowserNavPathRequest {
  readonly zoneKey: string;
  readonly start: NavPoint;
  readonly end: NavPoint;
}

/**
 * Lazy browser equivalent of the Node nav worker. Meshes are loaded once per
 * local-backend Worker and queries remain outside the simulation tick.
 */
export class BrowserNavService {
  private readonly queries = new Map<string, Promise<RecastQuery>>();
  private readonly recastReady: Promise<void>;

  constructor(
    private readonly meshUrls: Readonly<Record<string, string>>,
    private readonly maxNodes = 4096,
  ) {
    const recast = RecastNavigation as unknown as RecastApi;
    this.recastReady = recast.init();
  }

  async findPath(
    request: BrowserNavPathRequest,
  ): Promise<readonly NavPoint[]> {
    const query = await this.queryFor(request.zoneKey);
    const result = query.computePath(
      runtimeToRecastPoint(request.start),
      runtimeToRecastPoint(request.end),
    );
    if (!result.success) {
      throw new Error(result.error?.name ?? "Detour path query failed");
    }
    return result.path.map(recastToRuntimePoint);
  }

  private queryFor(inputZoneKey: string): Promise<RecastQuery> {
    const zoneKey = inputZoneKey.trim().toLowerCase();
    const existing = this.queries.get(zoneKey);
    if (existing) return existing;
    const meshUrl = this.meshUrls[zoneKey];
    if (!meshUrl) {
      return Promise.reject(
        new Error(`No browser navmesh is registered for zone ${zoneKey}`),
      );
    }
    const loading = this.loadQuery(meshUrl);
    this.queries.set(zoneKey, loading);
    void loading.catch(() => this.queries.delete(zoneKey));
    return loading;
  }

  private async loadQuery(meshUrl: string): Promise<RecastQuery> {
    await this.recastReady;
    const response = await fetch(meshUrl);
    if (!response.ok) {
      throw new Error(
        `Unable to fetch navmesh (${response.status} ${response.statusText})`,
      );
    }
    const recast = RecastNavigation as unknown as RecastApi;
    const prepared = prepareDetourMeshSet(
      new Uint8Array(await response.arrayBuffer()),
    );
    const { navMesh } = recast.importNavMesh(prepared.bytes);
    const query = new recast.NavMeshQuery(navMesh, {
      maxNodes: this.maxNodes,
    });
    query.defaultQueryHalfExtents = { x: 10, y: 200, z: 10 };
    return query;
  }
}
