import { randomUUID } from "node:crypto";

import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";

const MAX_WORLD_COORDINATE = 2 ** 20 - 1;

export interface ZoneWorkspace {
  zone: DatabaseRow;
  spawns: ZoneWorkspaceSpawn[];
  asset: {
    coordinateContract: "babylon-runtime-identity";
    authoringPreview: string;
    runtimePackage: string;
  };
}

export interface ZoneWorkspaceSpawn {
  id: number;
  zoneId: number;
  spawnGroupId: number;
  spawnGroupKey: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  enabled: boolean;
  respawnSeconds: number;
  npcArchetypeId: number | null;
  npcName: string | null;
}

export interface CreateZoneSpawnInput {
  x: number;
  y: number;
  z: number;
  heading?: number;
  npcArchetypeId: number;
  respawnSeconds?: number;
  spawnGroupKey?: string;
}

interface ZoneRow extends DatabaseRow {
  id: number | bigint | string;
  short_name: string;
}

interface SpawnRow extends DatabaseRow {
  id: number | bigint | string;
  zone_id: number | bigint | string;
  spawn_group_id: number | bigint | string;
  spawn_group_key: string;
  x: number | string;
  y: number | string;
  z: number | string;
  heading: number | string;
  enabled: number | boolean;
  respawn_seconds: number | string;
  npc_archetype_id: number | bigint | string | null;
  npc_name: string | null;
}

export async function loadZoneWorkspace(
  database: DatabaseBackend,
  zoneId: number,
): Promise<ZoneWorkspace> {
  assertPositiveInteger(zoneId, "zoneId");
  const zone = (await database.query<ZoneRow>(
    `SELECT id, short_name, name, safe_x, safe_y, safe_z
     FROM zones WHERE id = ?`,
    [zoneId],
  )).rows[0];
  if (!zone) throw new Error(`zone ${zoneId} was not found`);

  const rows = (await database.query<SpawnRow>(
    `SELECT point.id, point.zone_id, point.spawn_group_id,
      spawn_group.spawn_group_key, point.x, point.y, point.z, point.heading,
      point.enabled, spawn_group.respawn_seconds,
      member.npc_archetype_id, npc.name AS npc_name
     FROM spawn_points point
     JOIN spawn_groups spawn_group ON spawn_group.id = point.spawn_group_id
     LEFT JOIN spawn_group_members member ON member.spawn_group_id = spawn_group.id
     LEFT JOIN npc_archetypes npc ON npc.id = member.npc_archetype_id
     WHERE point.zone_id = ?
     ORDER BY point.id, member.weight DESC, member.npc_archetype_id`,
    [zoneId],
  )).rows;

  const spawns = new Map<number, ZoneWorkspaceSpawn>();
  for (const row of rows) {
    const id = Number(row.id);
    if (spawns.has(id)) continue;
    spawns.set(id, {
      id,
      zoneId: Number(row.zone_id),
      spawnGroupId: Number(row.spawn_group_id),
      spawnGroupKey: row.spawn_group_key,
      x: Number(row.x),
      y: Number(row.y),
      z: Number(row.z),
      heading: Number(row.heading),
      enabled: Boolean(row.enabled),
      respawnSeconds: Number(row.respawn_seconds),
      npcArchetypeId: row.npc_archetype_id === null
        ? null
        : Number(row.npc_archetype_id),
      npcName: row.npc_name,
    });
  }

  const shortName = String(zone.short_name).toLowerCase();
  return {
    zone,
    spawns: [...spawns.values()],
    asset: {
      coordinateContract: "babylon-runtime-identity",
      authoringPreview: `/eqrequiem/worlds/${encodeURIComponent(shortName)}.authoring-preview.glb`,
      runtimePackage: `/eqrequiem/worlds/${encodeURIComponent(shortName)}.glb.gz`,
    },
  };
}

export async function createZoneSpawn(
  database: DatabaseBackend,
  zoneId: number,
  input: CreateZoneSpawnInput,
): Promise<ZoneWorkspaceSpawn> {
  assertPositiveInteger(zoneId, "zoneId");
  assertPositiveInteger(input.npcArchetypeId, "npcArchetypeId");
  assertWorldCoordinate(input.x, "x");
  assertWorldCoordinate(input.y, "y");
  assertWorldCoordinate(input.z, "z");
  const heading = input.heading ?? 0;
  if (!Number.isFinite(heading)) throw new Error("heading must be finite");
  const respawnSeconds = input.respawnSeconds ?? 360;
  if (!Number.isInteger(respawnSeconds) || respawnSeconds < 1 || respawnSeconds > 86_400) {
    throw new Error("respawnSeconds must be an integer from 1 through 86400");
  }

  return database.transaction(async (transaction) => {
    const zone = (await transaction.query<ZoneRow>(
      "SELECT id, short_name FROM zones WHERE id = ?",
      [zoneId],
    )).rows[0];
    if (!zone) throw new Error(`zone ${zoneId} was not found`);
    const npc = (await transaction.query<DatabaseRow>(
      "SELECT id FROM npc_archetypes WHERE id = ?",
      [input.npcArchetypeId],
    )).rows[0];
    if (!npc) throw new Error(`npc archetype ${input.npcArchetypeId} was not found`);

    const groupKey = input.spawnGroupKey?.trim()
      || `libra:${String(zone.short_name).toLowerCase()}:${randomUUID()}`;
    if (groupKey.length > 255) throw new Error("spawnGroupKey exceeds 255 characters");

    await transaction.execute(
      `INSERT INTO spawn_groups
       (spawn_group_key, respawn_seconds, enabled) VALUES (?, ?, 1)`,
      [groupKey, respawnSeconds],
    );
    const group = (await transaction.query<{ id: number | bigint | string }>(
      "SELECT id FROM spawn_groups WHERE spawn_group_key = ?",
      [groupKey],
    )).rows[0];
    if (!group) throw new Error("spawn group insert could not be resolved");
    const groupId = Number(group.id);

    await transaction.execute(
      `INSERT INTO spawn_group_members
       (spawn_group_id, npc_archetype_id, weight) VALUES (?, ?, 1)`,
      [groupId, input.npcArchetypeId],
    );
    await transaction.execute(
      `INSERT INTO spawn_points
       (zone_id, spawn_group_id, x, y, z, heading, enabled)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [zoneId, groupId, input.x, input.y, input.z, heading],
    );
    const created = (await transaction.query<SpawnRow>(
      `SELECT point.id, point.zone_id, point.spawn_group_id,
        spawn_group.spawn_group_key, point.x, point.y, point.z, point.heading,
        point.enabled, spawn_group.respawn_seconds,
        member.npc_archetype_id, npc.name AS npc_name
       FROM spawn_points point
       JOIN spawn_groups spawn_group ON spawn_group.id = point.spawn_group_id
       JOIN spawn_group_members member ON member.spawn_group_id = spawn_group.id
       JOIN npc_archetypes npc ON npc.id = member.npc_archetype_id
       WHERE point.zone_id = ? AND point.spawn_group_id = ?
       ORDER BY point.id DESC LIMIT 1`,
      [zoneId, groupId],
    )).rows[0];
    if (!created) throw new Error("spawn point insert could not be resolved");
    return {
      id: Number(created.id),
      zoneId: Number(created.zone_id),
      spawnGroupId: Number(created.spawn_group_id),
      spawnGroupKey: created.spawn_group_key,
      x: Number(created.x),
      y: Number(created.y),
      z: Number(created.z),
      heading: Number(created.heading),
      enabled: Boolean(created.enabled),
      respawnSeconds: Number(created.respawn_seconds),
      npcArchetypeId: Number(created.npc_archetype_id),
      npcName: created.npc_name,
    };
  });
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function assertWorldCoordinate(value: number, name: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > MAX_WORLD_COORDINATE) {
    throw new Error(`${name} must be finite and within runtime world bounds`);
  }
}
