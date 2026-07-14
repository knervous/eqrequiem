import { sql } from "drizzle-orm";

import { toItemInstance, type GameItemRow } from "../backend/item-instance.js";
import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import type { ZoneNpcSpawnDefinition, ZonePathPoint } from "../zone/zone-content.js";

interface InventoryItemRow extends DatabaseRow {
  bag: number;
  slot: number;
  item_id: number;
  quantity: number;
}

interface ZoneSpawnCandidateRow extends DatabaseRow {
  spawn_point_id: number;
  spawn_group_id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  movement_path_json: string | null;
  npc_archetype_id: number;
  weight: number;
  name: string;
  level: number;
  race_id: number;
  gender: number;
  movement_speed: number;
  model_key: string | null;
  properties_json: string;
}

/** Cross-dialect read model used by the real zone backend. */
export class GameDataRepository {
  private readonly content: DrizzleDatabase;
  private readonly runtime: DrizzleDatabase;

  constructor(content: DatabaseBackend, runtime: DatabaseBackend) {
    this.content = new DrizzleDatabase(content);
    this.runtime = new DrizzleDatabase(runtime);
  }

  async inventoryItems(characterId: number): Promise<Record<string, unknown>[]> {
    const inventory = (await this.runtime.query<InventoryItemRow>(
      sql`SELECT bag, slot, item_id, quantity FROM player_inventory
          WHERE character_id = ${characterId} ORDER BY slot, bag`,
    )).rows;
    const itemIds = [...new Set(inventory.map((row) => Number(row.item_id)))];
    if (itemIds.length === 0) return [];
    const identifiers = sql.join(itemIds.map((id) => sql`${id}`), sql`, `);
    const items = (await this.content.query<GameItemRow>(sql`
      SELECT id, Name AS name, idfile, icon, material, color, itemtype, slots, ac,
        bagslots, classes, races, stackable, stacksize, maxcharges, weight, damage,
        delay, astr, asta, adex, aagi, aint, awis, acha, hp, mana, dr, mr, cr, fr,
        pr, haste, magic, nodrop
      FROM items WHERE id IN (${identifiers})
    `)).rows;
    const byId = new Map(items.map((item) => [Number(item.id), item]));
    return inventory.flatMap((row) => {
      const item = byId.get(Number(row.item_id));
      return item
        ? [toItemInstance(item, Number(row.slot), Number(row.bag), Number(row.quantity))]
        : [];
    });
  }

  /** Resolve weighted spawn groups once, before the zone worker begins ticking. */
  async zoneNpcSpawns(zoneId: number, instanceId = 0): Promise<ZoneNpcSpawnDefinition[]> {
    const rows = (await this.content.query<ZoneSpawnCandidateRow>(sql`
      SELECT sp.id AS spawn_point_id, sp.spawn_group_id, sp.x, sp.y, sp.z,
        sp.heading, sp.movement_path_json, member.npc_archetype_id, member.weight,
        npc.name, npc.level, npc.race_id, npc.gender, npc.movement_speed,
        npc.model_key, npc.properties_json
      FROM spawn_points sp
      JOIN spawn_groups spawn_group ON spawn_group.id = sp.spawn_group_id
      JOIN spawn_group_members member ON member.spawn_group_id = sp.spawn_group_id
      JOIN npc_archetypes npc ON npc.id = member.npc_archetype_id
      WHERE sp.zone_id = ${zoneId} AND sp.enabled = 1 AND spawn_group.enabled = 1
      ORDER BY sp.id, member.npc_archetype_id
    `)).rows;
    const byPoint = new Map<number, ZoneSpawnCandidateRow[]>();
    for (const row of rows) {
      const id = Number(row.spawn_point_id);
      const candidates = byPoint.get(id) ?? [];
      candidates.push(row);
      byPoint.set(id, candidates);
    }
    return [...byPoint.entries()].map(([spawnPointId, candidates]) => {
      const selected = weightedCandidate(candidates, stableRoll(zoneId, instanceId, spawnPointId));
      const properties = parseProperties(selected.properties_json);
      return {
        spawnId: spawnPointId,
        spawnPointId,
        spawnGroupId: Number(selected.spawn_group_id),
        npcArchetypeId: Number(selected.npc_archetype_id),
        name: selected.name,
        level: Number(selected.level),
        race: Number(selected.race_id),
        gender: Number(selected.gender),
        modelKey: selected.model_key,
        movementSpeed: Math.max(0, Number(selected.movement_speed)),
        size: numericProperty(properties, "size", 6),
        face: numericProperty(properties, "face", 0),
        helm: numericProperty(properties, "helm", 0),
        equipChest: numericProperty(properties, "texture", 0),
        charClass: numericProperty(properties, "classId", 1),
        bodyType: numericProperty(properties, "bodyType", 1),
        x: Number(selected.x),
        y: Number(selected.y),
        z: Number(selected.z),
        heading: Number(selected.heading),
        path: parseMovementPath(selected.movement_path_json),
      };
    });
  }
}

function weightedCandidate(
  candidates: readonly ZoneSpawnCandidateRow[],
  unitRoll: number,
): ZoneSpawnCandidateRow {
  if (candidates.length === 0) throw new Error("spawn group has no NPC candidates");
  const total = candidates.reduce((sum, row) => sum + Math.max(0, Number(row.weight)), 0);
  if (total <= 0) return candidates[0]!;
  let roll = unitRoll * total;
  for (const candidate of candidates) {
    roll -= Math.max(0, Number(candidate.weight));
    if (roll < 0) return candidate;
  }
  return candidates[candidates.length - 1]!;
}

function stableRoll(zoneId: number, instanceId: number, spawnPointId: number): number {
  let value = (zoneId * 0x9e3779b1) ^ (instanceId * 0x85ebca6b) ^ spawnPointId;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x1_0000_0000;
}

function parseProperties(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function numericProperty(properties: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(properties[key]);
  return Number.isFinite(value) ? value : fallback;
}

function parseMovementPath(raw: string | null): ZonePathPoint[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((point): ZonePathPoint[] => {
      if (!Array.isArray(point) || point.length < 3) return [];
      const [x, y, z, heading = 0, pauseSeconds = 0] = point.map(Number);
      return [x, y, z, heading, pauseSeconds].every(Number.isFinite)
        ? [{ x: x!, y: y!, z: z!, heading: heading!, pauseSeconds: Math.max(0, pauseSeconds!) }]
        : [];
    });
  } catch {
    return [];
  }
}
