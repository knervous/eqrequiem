import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

import BetterSqlite3 from "better-sqlite3";
import { decodeShadoWorldCollision } from "../../shader-object/dist/world/index.js";

/**
 * Re-homes inherited Qeynos2 spawn data in the authored Talios Crownward scene.
 *
 * The migration is intentionally idempotent: it uses stable district anchors, replaces
 * noisy legacy patrol recordings with compact loops, and writes an audit manifest for
 * every spawn point.  Run after `npm run db:content:inflate`; the script publishes the
 * corresponding checked-in gzip artifact itself.
 */

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "data/content-db.sqlite");
const gzipPath = `${databasePath}.gz`;
const worldRoot = resolve(root, "../client/public/eqrequiem/worlds");
const spatialPath = resolve(worldRoot, "talioscrownward.spatial.json.gz");
const artifactPath = resolve(
  root,
  "artifacts/talioscrownward-spawns/pass-01-relocation-manifest.json",
);
const zoneId = 2;
const floorOffset = 0.15;

type Point = { x: number; y: number; z: number };
type RoutePoint = readonly [number, number, number, number, number];
type SpawnRow = {
  id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  movement_path_json: string | null;
  names: string;
};

const undercastleSpawnIds = new Set([
  10702, 10703, 10782, 10805, 10810, 10821, 10822, 10823, 10833, 10834,
  59304, 59305, 59306,
]);

// These anchors occupy real floors in the Pass 05 undercastle: descent, guard hall,
// prison, reliquary and sealed vault.  No actor is placed in the cistern water.
const undercastleAnchors: readonly Point[] = [
  { x: -80, y: -3, z: -354 },
  { x: -80, y: -17, z: -368 },
  { x: -80, y: -40, z: -392 },
  { x: -76, y: -40, z: -404 },
  { x: -84, y: -40, z: -404 },
  { x: -116, y: -40, z: -426 },
  { x: -120, y: -40, z: -442 },
  { x: -108, y: -40, z: -435 },
  { x: -44, y: -40, z: -424 },
  { x: -52, y: -40, z: -441 },
  { x: -36, y: -40, z: -444 },
  { x: -80, y: -40, z: -468 },
  { x: -80, y: -40, z: -480 },
];

function readSpatial(): { collision: Record<string, unknown> } {
  return JSON.parse(gunzipSync(readFileSync(spatialPath)).toString("utf8")) as {
    collision: Record<string, unknown>;
  };
}

function normalizeName(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function isGuard(name: string): boolean {
  return /\b(guard|watch|serjeant|lieutenant|corporal)\b/.test(normalizeName(name));
}

function districtFor(row: SpawnRow): string {
  if (undercastleSpawnIds.has(row.id)) return "undercastle";
  if (row.x <= -600) return "hintercliff";
  if (row.x < -250 && row.z > 35 && row.z < 245) return "crownward-gate";
  if (row.x < -250 && row.z >= 245) return "north-civic";
  if (row.z < -250) return "south-market";
  return "civic-ward";
}

function parseRoute(raw: string | null): RoutePoint[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): RoutePoint[] => {
      if (!Array.isArray(entry) || entry.length < 3) return [];
      const values = entry.map(Number);
      if (!values.slice(0, 3).every(Number.isFinite)) return [];
      return [[values[0]!, values[1]!, values[2]!, values[3] ?? 0, Math.max(0, values[4] ?? 0)]];
    });
  } catch {
    return [];
  }
}

function triangleFloor(
  point: Point,
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
): number[] {
  const floors: number[] = [];
  for (let index = 0; index < indices.length; index += 3) {
    const a = Number(indices[index]) * 3;
    const b = Number(indices[index + 1]) * 3;
    const c = Number(indices[index + 2]) * 3;
    const ax = Number(positions[a]); const ay = Number(positions[a + 1]); const az = Number(positions[a + 2]);
    const bx = Number(positions[b]); const by = Number(positions[b + 1]); const bz = Number(positions[b + 2]);
    const cx = Number(positions[c]); const cy = Number(positions[c + 1]); const cz = Number(positions[c + 2]);
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 0.00001) continue;
    const u = ((bz - cz) * (point.x - cx) + (cx - bx) * (point.z - cz)) / denominator;
    const v = ((cz - az) * (point.x - cx) + (ax - cx) * (point.z - cz)) / denominator;
    const w = 1 - u - v;
    if (u < -0.001 || v < -0.001 || w < -0.001) continue;
    const normalY = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const normalLength = Math.hypot(
      (by - ay) * (cz - az) - (bz - az) * (cy - ay),
      normalY,
      (bz - az) * (cx - ax) - (bx - ax) * (cz - az),
    );
    if (normalLength === 0 || Math.abs(normalY / normalLength) < 0.55) continue;
    floors.push(u * ay + v * by + w * cy);
  }
  return floors;
}

function makeFloorResolver() {
  const spatial = readSpatial();
  const collision = decodeShadoWorldCollision(
    gunzipSync(readFileSync(resolve(worldRoot, String(spatial.collision.source)))),
    spatial.collision,
  );
  const exactFloor = (point: Point): Point | null => {
    const candidates: number[] = [];
    for (const chunk of collision.chunks) {
      const [minX, minY, minZ] = chunk.bounds.min;
      const [maxX, maxY, maxZ] = chunk.bounds.max;
      if (point.x < minX - 0.05 || point.x > maxX + 0.05 || point.z < minZ - 0.05 || point.z > maxZ + 0.05) continue;
      for (const floor of triangleFloor(point, chunk.positions, chunk.indices)) {
        if (floor >= minY - 0.1 && floor <= maxY + 0.1) candidates.push(floor);
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((left, right) => Math.abs(left - point.y) - Math.abs(right - point.y));
    return { x: point.x, y: candidates[0]! + floorOffset, z: point.z };
  };
  return (point: Point): Point => {
    const exact = exactFloor(point);
    if (exact) return exact;
    const alternatives: Array<{ point: Point; distance: number }> = [];
    for (const radius of [1, 2, 4, 8, 12, 16, 24]) {
      for (let step = 0; step < 16; step++) {
        const angle = (Math.PI * 2 * step) / 16;
        const candidate = exactFloor({
          x: point.x + Math.cos(angle) * radius,
          y: point.y,
          z: point.z + Math.sin(angle) * radius,
        });
        if (candidate) alternatives.push({ point: candidate, distance: radius });
      }
      if (alternatives.length > 0) break;
    }
    if (alternatives.length === 0) {
      throw new Error(`No walkable collision floor within 24m of ${point.x}, ${point.y}, ${point.z}`);
    }
    alternatives.sort((left, right) => (
      left.distance + Math.abs(left.point.y - point.y) * 0.1
    ) - (
      right.distance + Math.abs(right.point.y - point.y) * 0.1
    ));
    return alternatives[0]!.point;
  };
}

function loopFor(row: SpawnRow, spawn: Point, floorAt: (point: Point) => Point): RoutePoint[] {
  const oldRoute = parseRoute(row.movement_path_json);
  if (oldRoute.length === 0) return [];
  const radius = undercastleSpawnIds.has(row.id) ? 2.2 : row.x <= -600 ? 5 : isGuard(row.names) ? 2.5 : 1.5;
  const offsets = undercastleSpawnIds.has(row.id)
    ? [[-radius, 0], [0, -radius], [radius, 0], [0, radius]]
    : [[0, -radius], [radius, 0], [0, radius], [-radius, 0]];
  const points = offsets.map(([x, z]) => {
    try {
      return floorAt({ x: spawn.x + x!, y: spawn.y, z: spawn.z + z! });
    } catch {
      return spawn;
    }
  });
  const unique = points.filter((point, index) => index === 0 || Math.hypot(
    point.x - points[index - 1]!.x,
    point.y - points[index - 1]!.y,
    point.z - points[index - 1]!.z,
  ) > 0.25);
  return unique.map((point, index) => [
    Number(point.x.toFixed(3)), Number(point.y.toFixed(3)), Number(point.z.toFixed(3)), 0,
    isGuard(row.names) && index === 0 ? 2 : 0,
  ]);
}

const floorAt = makeFloorResolver();
const db = new BetterSqlite3(databasePath);
const rows = db.prepare(`
  SELECT sp.id, sp.x, sp.y, sp.z, sp.heading, sp.movement_path_json,
    GROUP_CONCAT(npc.name, ' | ') AS names
  FROM spawn_points sp
  JOIN spawn_group_members member ON member.spawn_group_id = sp.spawn_group_id
  JOIN npc_archetypes npc ON npc.id = member.npc_archetype_id
  WHERE sp.zone_id = ?
  GROUP BY sp.id
  ORDER BY sp.id
`).all(zoneId) as SpawnRow[];

const updates = db.prepare(`
  UPDATE spawn_points SET x = ?, y = ?, z = ?, movement_path_json = ? WHERE id = ?
`);
const manifest: Array<Record<string, unknown>> = [];
let undercastleIndex = 0;
let pathBefore = 0;
let pathAfter = 0;
let characterOriginUpdates = 0;

const apply = db.transaction(() => {
  for (const row of rows) {
    const beforePath = parseRoute(row.movement_path_json);
    pathBefore += beforePath.length;
    const requested = undercastleSpawnIds.has(row.id)
      ? undercastleAnchors[undercastleIndex++ % undercastleAnchors.length]!
      : { x: row.x, y: row.y, z: row.z };
    const spawn = floorAt(requested);
    const route = loopFor(row, spawn, floorAt);
    pathAfter += route.length;
    updates.run(
      Number(spawn.x.toFixed(3)), Number(spawn.y.toFixed(3)), Number(spawn.z.toFixed(3)),
      route.length === 0 ? null : JSON.stringify(route), row.id,
    );
    manifest.push({
      id: row.id,
      names: row.names.split(" | "),
      district: districtFor(row),
      before: { x: row.x, y: row.y, z: row.z, pathPoints: beforePath.length },
      after: { x: spawn.x, y: spawn.y, z: spawn.z, pathPoints: route.length },
      disposition: undercastleSpawnIds.has(row.id) ? "relocated-to-undercastle" : "collision-anchored",
    });
  }
  db.prepare("UPDATE zones SET safe_x = ?, safe_y = ?, safe_z = ? WHERE id = ?")
    .run(-312, 3.15, 130, zoneId);
  // The demo brief requires every new character to wake in Crownward Plaza.  Legacy
  // class origin rows otherwise bypass ARRIVAL and can still place a character inside
  // retired Qeynos interiors; bindings in Talios use the same safe plaza.
  characterOriginUpdates = db.prepare(`
    UPDATE character_origins
    SET x = CASE WHEN zone_id = ? THEN ? ELSE x END,
        y = CASE WHEN zone_id = ? THEN ? ELSE y END,
        z = CASE WHEN zone_id = ? THEN ? ELSE z END,
        bind_x = CASE WHEN bind_zone_id = ? THEN ? ELSE bind_x END,
        bind_y = CASE WHEN bind_zone_id = ? THEN ? ELSE bind_y END,
        bind_z = CASE WHEN bind_zone_id = ? THEN ? ELSE bind_z END
    WHERE zone_id = ? OR bind_zone_id = ?
  `).run(
    zoneId, -312, zoneId, 3.15, zoneId, 130,
    zoneId, -312, zoneId, 3.15, zoneId, 130,
    zoneId, zoneId,
  ).changes;
});

try {
  apply();
  db.exec("VACUUM");
} finally {
  db.close();
}

mkdirSync(dirname(artifactPath), { recursive: true });
const artifact = {
  kind: "eltania.talioscrownward.spawn-relocation",
  version: 1,
  zone: "talioscrownward",
  scenePass: "05-undercastle-dungeon",
  method: "collision-anchored-district-rehome",
  spawnCount: rows.length,
  paths: { before: pathBefore, after: pathAfter },
  safeLocation: { x: -312, y: 3.15, z: 130 },
  characterOriginUpdates,
  records: manifest,
};
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
const databaseBytes = readFileSync(databasePath);
const compressed = gzipSync(databaseBytes, { level: 9 });
writeFileSync(gzipPath, compressed);
console.log(JSON.stringify({
  spawnCount: rows.length,
  undercastleRelocations: undercastleSpawnIds.size,
  pathPointsBefore: pathBefore,
  pathPointsAfter: pathAfter,
  characterOriginUpdates,
  databaseBytes: databaseBytes.byteLength,
  gzipBytes: compressed.byteLength,
  gzipSha256: createHash("sha256").update(compressed).digest("hex"),
  artifactPath,
}, null, 2));
