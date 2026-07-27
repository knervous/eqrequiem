import { sql } from "drizzle-orm";

import { toItemInstance, type GameItemRow } from "../backend/item-instance.js";
import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import {
  DEFAULT_MELEE_COMBAT_RULES,
  deriveMaximumHp,
  type CombatantStats,
} from "../combat/melee-combat.js";
import {
  resolveNpcLoot,
  type NpcLootGraphRow,
} from "../combat/npc-loot-resolver.js";
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
  merchant_catalog_id: number | null;
  keeps_sold_items: number | null;
  merchant_interaction_range: number | null;
}

interface CharacterCombatRow extends DatabaseRow {
  level: number;
  str: number;
  sta: number;
  dex: number;
  agi: number;
}

interface CharacterSkillRow extends DatabaseRow {
  skill_id: number;
  value: number;
}

interface NpcLootRow extends GameItemRow {
  npc_archetype_id: number;
  loot_slot: number;
  chance_permille: number;
  minimum_quantity: number;
  maximum_quantity: number;
}

interface NpcLootProjectionRow extends NpcLootGraphRow {
  npc_archetype_id: number;
}

export interface CharacterCombatProjection extends CombatantStats {
  readonly baseStrength: number;
  readonly baseStamina: number;
  readonly baseDexterity: number;
  readonly baseAgility: number;
}

/** Cross-dialect read model used by the real zone backend. */
export class GameDataRepository {
  private readonly content: DrizzleDatabase;
  private readonly runtime: DrizzleDatabase;

  constructor(
    content: DatabaseBackend,
    runtime: DatabaseBackend,
    private readonly contentPrefix = "",
  ) {
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
      FROM ${this.contentTable("items")} WHERE id IN (${identifiers})
    `)).rows;
    const byId = new Map(items.map((item) => [Number(item.id), item]));
    return inventory.flatMap((row) => {
      const item = byId.get(Number(row.item_id));
      return item
        ? [toItemInstance(item, Number(row.slot), Number(row.bag), Number(row.quantity))]
        : [];
    });
  }

  async characterCombat(
    characterId: number,
  ): Promise<CharacterCombatProjection | null> {
    const character = (await this.runtime.query<CharacterCombatRow>(sql`
      SELECT level, str, sta, dex, agi FROM characters
      WHERE id = ${characterId} LIMIT 1
    `)).rows[0];
    if (!character) return null;
    const skillRows = (await this.runtime.query<CharacterSkillRow>(sql`
      SELECT skill_id, value FROM character_skills
      WHERE character_id = ${characterId}
    `)).rows;
    const skills = new Map(
      skillRows.map((row) => [Number(row.skill_id), Number(row.value)]),
    );
    const items = await this.inventoryItems(characterId);
    const equipped = items.filter((item) => numberValue(item.slot) <= 21);
    const primary = equipped.find((item) => numberValue(item.slot) === 13);
    const baseStrength = Number(character.str);
    const baseStamina = Number(character.sta);
    const baseDexterity = Number(character.dex);
    const baseAgility = Number(character.agi);
    const strength = baseStrength + sum(equipped, "astr");
    const stamina = baseStamina + sum(equipped, "asta");
    const dexterity = baseDexterity + sum(equipped, "adex");
    const agility = baseAgility + sum(equipped, "aagi");
    const level = Math.max(1, Number(character.level));
    const weaponSkill = skills.get(weaponSkillId(numberValue(primary?.itemtype)))
      ?? 0;
    const offense = (skills.get(33) ?? 0) + weaponSkill;
    const defense = skills.get(15) ?? 0;
    const bonusHp = sum(equipped, "hp");
    const delay = numberValue(primary?.delay);
    return {
      level,
      baseStrength,
      baseStamina,
      baseDexterity,
      baseAgility,
      strength,
      stamina,
      dexterity,
      agility,
      offense,
      defense,
      armorClass: sum(equipped, "ac"),
      maximumHp: deriveMaximumHp(level, stamina, bonusHp),
      weaponDamage: Math.max(
        DEFAULT_MELEE_COMBAT_RULES.unarmedDamage,
        numberValue(primary?.damage),
      ),
      attackDelayMs: delay > 0
        ? delay * 100
        : DEFAULT_MELEE_COMBAT_RULES.unarmedDelayMs,
      haste: sum(equipped, "haste"),
      meleeRange: 3,
    };
  }

  /** Resolve weighted spawn groups once, before the zone worker begins ticking. */
  async zoneNpcSpawns(zoneId: number, instanceId = 0): Promise<ZoneNpcSpawnDefinition[]> {
    const rows = (await this.content.query<ZoneSpawnCandidateRow>(sql`
      SELECT sp.id AS spawn_point_id, sp.spawn_group_id, sp.x, sp.y, sp.z,
        sp.heading, sp.movement_path_json, member.npc_archetype_id, member.weight,
        npc.name, npc.level, npc.race_id, npc.gender, npc.movement_speed,
        npc.model_key, npc.properties_json,
        merchant.catalog_id AS merchant_catalog_id,
        merchant.keeps_sold_items,
        merchant.interaction_range AS merchant_interaction_range
      FROM ${this.contentTable("spawn_points")} sp
      JOIN ${this.contentTable("spawn_groups")} spawn_group
        ON spawn_group.id = sp.spawn_group_id
      JOIN ${this.contentTable("spawn_group_members")} member
        ON member.spawn_group_id = sp.spawn_group_id
      JOIN ${this.contentTable("npc_archetypes")} npc
        ON npc.id = member.npc_archetype_id
      LEFT JOIN ${this.contentTable("npc_merchant_assignments")} merchant
        ON merchant.npc_archetype_id = npc.id
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
    const spawns = [...byPoint.entries()].map(([spawnPointId, candidates]) => {
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
        primary: numericProperty(properties, "primary", 0),
        secondary: numericProperty(properties, "secondary", 0),
        charClass: numericProperty(properties, "classId", 1),
        bodyType: numericProperty(properties, "bodyType", 1),
        maximumHp: Math.max(
          1,
          numericProperty(properties, "maximumHp", 20 + Number(selected.level) * 15),
        ),
        strength: numericProperty(
          properties,
          "strength",
          75 + Number(selected.level) * 2,
        ),
        stamina: numericProperty(
          properties,
          "stamina",
          75 + Number(selected.level) * 2,
        ),
        dexterity: numericProperty(
          properties,
          "dexterity",
          75 + Number(selected.level) * 2,
        ),
        agility: numericProperty(
          properties,
          "agility",
          75 + Number(selected.level) * 2,
        ),
        offense: numericProperty(
          properties,
          "offense",
          Number(selected.level) * 5,
        ),
        defense: numericProperty(
          properties,
          "defense",
          Number(selected.level) * 5,
        ),
        armorClass: numericProperty(
          properties,
          "armorClass",
          Number(selected.level) * 4,
        ),
        weaponDamage: Math.max(
          1,
          numericProperty(
            properties,
            "weaponDamage",
            2 + Math.floor(Number(selected.level) / 3),
          ),
        ),
        attackDelayMs: Math.max(
          500,
          numericProperty(properties, "attackDelayMs", 2_500),
        ),
        haste: numericProperty(properties, "haste", 0),
        meleeRange: Math.max(
          0.1,
          numericProperty(properties, "meleeRange", 3),
        ),
        ...(selected.merchant_catalog_id === null
          || selected.merchant_catalog_id === undefined
          ? {}
          : { merchant: {
            catalogId: Number(selected.merchant_catalog_id),
            keepsSoldItems: Number(selected.keeps_sold_items) !== 0,
            interactionRange: Math.max(
              1,
              Number(selected.merchant_interaction_range ?? 20),
            ),
          } }),
        lootItems: [],
        x: Number(selected.x),
        y: Number(selected.y),
        z: Number(selected.z),
        heading: Number(selected.heading),
        path: parseMovementPath(selected.movement_path_json),
      };
    });
    if (spawns.length === 0) return spawns;
    const archetypeIds = [...new Set(spawns.map((spawn) => spawn.npcArchetypeId))];
    const identifiers = sql.join(archetypeIds.map((id) => sql`${id}`), sql`, `);
    const lootRows = (await this.content.query<NpcLootRow>(sql`
      SELECT loot.npc_archetype_id, loot.loot_slot, loot.chance_permille,
        loot.minimum_quantity, loot.maximum_quantity,
        item.id, item.name, item.idfile, item.icon, item.material, item.color,
        item.itemtype, item.slots, item.ac, item.bagslots, item.classes, item.races,
        item.stackable, item.stacksize, item.maxcharges, item.weight, item.damage,
        item.delay, item.astr, item.asta, item.adex, item.aagi, item.aint, item.awis,
        item.acha, item.hp, item.mana, item.dr, item.mr, item.cr, item.fr, item.pr,
        item.haste, item.magic, item.nodrop
      FROM ${this.contentTable("npc_loot_items")} loot
      JOIN ${this.contentTable("items")} item ON item.id = loot.item_id
      WHERE loot.npc_archetype_id IN (${identifiers})
      ORDER BY loot.npc_archetype_id, loot.loot_slot, item.id
    `)).rows;
    const lootByArchetype = new Map<number, NpcLootRow[]>();
    for (const row of lootRows) {
      const id = Number(row.npc_archetype_id);
      const entries = lootByArchetype.get(id) ?? [];
      entries.push(row);
      lootByArchetype.set(id, entries);
    }
    const graphRows = (await this.content.query<NpcLootProjectionRow>(sql`
      SELECT assignment.npc_archetype_id, table_entry.loot_group_id,
        table_entry.rolls AS table_rolls,
        table_entry.chance_permille AS table_chance_permille,
        table_entry.drop_limit, table_entry.minimum_drops,
        group_entry.chance_permille AS group_chance_permille,
        group_entry.rolls AS group_rolls,
        group_entry.minimum_quantity, group_entry.maximum_quantity,
        group_entry.npc_minimum_level, group_entry.npc_maximum_level,
        item.id, item.name, item.idfile, item.icon, item.material, item.color,
        item.itemtype, item.slots, item.ac, item.bagslots, item.classes, item.races,
        item.stackable, item.stacksize, item.maxcharges, item.weight, item.damage,
        item.delay, item.astr, item.asta, item.adex, item.aagi, item.aint, item.awis,
        item.acha, item.hp, item.mana, item.dr, item.mr, item.cr, item.fr, item.pr,
        item.haste, item.magic, item.nodrop
      FROM ${this.contentTable("npc_loot_assignments")} assignment
      JOIN ${this.contentTable("npc_loot_table_entries")} table_entry
        ON table_entry.loot_table_id = assignment.loot_table_id
      JOIN ${this.contentTable("npc_loot_group_entries")} group_entry
        ON group_entry.loot_group_id = table_entry.loot_group_id
      JOIN ${this.contentTable("items")} item ON item.id = group_entry.item_id
      WHERE assignment.npc_archetype_id IN (${identifiers})
      ORDER BY assignment.npc_archetype_id, table_entry.loot_group_id, item.id
    `)).rows;
    const graphByArchetype = new Map<number, NpcLootProjectionRow[]>();
    for (const row of graphRows) {
      const id = Number(row.npc_archetype_id);
      const entries = graphByArchetype.get(id) ?? [];
      entries.push(row);
      graphByArchetype.set(id, entries);
    }
    return spawns.map((spawn) => {
      const directRows = lootByArchetype.get(spawn.npcArchetypeId) ?? [];
      const directItems = directRows.flatMap(
        (row): Record<string, unknown>[] => {
          const chance = clampInteger(Number(row.chance_permille), 0, 1_000);
          const roll = stableLootRoll(
            zoneId,
            instanceId,
            spawn.spawnId,
            Number(row.loot_slot),
            Number(row.id),
          );
          if (roll % 1_000 >= chance) return [];
          const minimum = Math.max(1, Math.trunc(Number(row.minimum_quantity)));
          const maximum = Math.max(
            minimum,
            Math.trunc(Number(row.maximum_quantity)),
          );
          const quantity = minimum + stableLootRoll(
            zoneId,
            instanceId,
            spawn.spawnId,
            Number(row.loot_slot),
            Number(row.id) ^ 0x51ed,
          ) % (maximum - minimum + 1);
          return [toItemInstance(row, Number(row.loot_slot), -1, quantity)];
        },
      );
      const firstGraphSlot = directRows.reduce(
        (slot, row) => Math.max(slot, Number(row.loot_slot) + 1),
        0,
      );
      const graphItems = resolveNpcLoot(
        {
          zoneId,
          instanceId,
          spawnId: spawn.spawnId,
          npcArchetypeId: spawn.npcArchetypeId,
        },
        spawn.level,
        graphByArchetype.get(spawn.npcArchetypeId) ?? [],
        firstGraphSlot,
      );
      return {
        ...spawn,
        lootItems: [...directItems, ...graphItems],
      };
    });
  }

  private contentTable(name: string) {
    if (!/^[a-z_]+$/.test(name) || !/^(?:[a-z_]+\.)?$/.test(this.contentPrefix)) {
      throw new Error("Invalid content table identifier");
    }
    return sql.raw(`${this.contentPrefix}${name}`);
  }
}

function sum(
  values: readonly Record<string, unknown>[],
  key: string,
): number {
  return values.reduce((total, value) => total + numberValue(value[key]), 0);
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function weaponSkillId(itemType: number): number {
  switch (itemType) {
    case 0: return 1;
    case 1: return 2;
    case 2: return 36;
    case 3: return 0;
    case 4: return 3;
    case 35: return 77;
    default: return 28;
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

function stableLootRoll(
  zoneId: number,
  instanceId: number,
  spawnId: number,
  lootSlot: number,
  itemId: number,
): number {
  let value =
    Math.imul(zoneId, 0x9e37_79b1)
    ^ Math.imul(instanceId, 0x85eb_ca6b)
    ^ Math.imul(spawnId, 0xc2b2_ae35)
    ^ Math.imul(lootSlot, 0x27d4_eb2f)
    ^ itemId;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
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
