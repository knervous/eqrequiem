import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import { sql } from "drizzle-orm";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import {
  movementConfirmations,
  planInventorySwap,
} from "../backend/inventory-rules.js";
import {
  normalizeCharacterName,
  resolveCharacterStats,
  isStartingClassSkill,
  startingItemMatches,
  startingLanguages,
  startingSkills,
} from "../backend/character-rules.js";
import type { BackendCharacterCreate } from "../backend/contracts.js";
import type {
  PersistCharacter,
  PersistDeleteItemInput,
  PersistMoveItemInput,
  PersistSlotMove,
} from "./types.js";
import { GameDataRepository } from "./game-data-repository.js";

interface AccountRow extends DatabaseRow {
  id: number;
}

interface CharacterRow extends DatabaseRow {
  id: number;
  name: string;
  level: number;
  class_id: number;
  race_id: number;
  gender: number;
  deity_id: number;
  face: number;
  zone_id: number;
  instance_id: number;
  last_login_at: string | number | null;
}

interface InventoryRow extends DatabaseRow {
  item_id: number;
  bag: number;
  slot: number;
}

export class GameRepository {
  private readonly drizzle: DrizzleDatabase;
  private readonly contentDrizzle: DrizzleDatabase;

  constructor(private readonly database: DatabaseBackend, private readonly contentDatabase: DatabaseBackend = database) {
    this.drizzle = new DrizzleDatabase(database);
    this.contentDrizzle = new DrizzleDatabase(contentDatabase);
  }

  async initialize(): Promise<void> {
    await applyCanonicalRuntimeSchema(this.database);
  }

  async getOrCreateAccount(identity = "guest"): Promise<number> {
    const existing = await this.drizzle.query<AccountRow>(
      sql`SELECT id FROM accounts WHERE identity = ${identity} LIMIT 1`,
    );
    const account = existing.rows[0];
    if (account) return Number(account.id);
    await this.drizzle.execute(
      sql`INSERT INTO accounts (identity) VALUES (${identity})`,
    );
    const created = await this.drizzle.query<AccountRow>(
      sql`SELECT id FROM accounts WHERE identity = ${identity} LIMIT 1`,
    );
    if (!created.rows[0]) throw new Error("Failed to create account");
    return Number(created.rows[0].id);
  }

  async listCharacters(accountId: number): Promise<PersistCharacter[]> {
    const result = await this.drizzle.query<CharacterRow>(
      sql`SELECT character.id, character.name, character.level,
          character.class_id, character.race_id, character.gender, character.deity_id,
          character.face, character.last_login_at,
          position.zone_id, position.instance_id
          FROM characters character
          JOIN character_positions position ON position.character_id = character.id
          WHERE character.account_id = ${accountId} ORDER BY character.name LIMIT 8`,
    );
    const gameData = new GameDataRepository(this.contentDatabase, this.database);
    return Promise.all(result.rows.map(async (row) => ({
      id: Number(row.id),
      name: row.name,
      level: Number(row.level),
      class: Number(row.class_id), race: Number(row.race_id), gender: Number(row.gender),
      deity: Number(row.deity_id), face: Number(row.face), zoneId: Number(row.zone_id),
      zoneInstance: Number(row.instance_id), lastLogin: timestamp(row.last_login_at),
      items: await gameData.inventoryItems(Number(row.id)),
    })));
  }

  async createCharacter(accountId: number, character: BackendCharacterCreate): Promise<boolean> {
    const name = normalizeCharacterName(character.name);
    const stats = resolveCharacterStats(character);
    if (!name || !stats) return false;
    const duplicate = await this.drizzle.query(
      sql`SELECT id FROM characters WHERE account_id = ${accountId}
          AND lower(name) = lower(${name}) LIMIT 1`,
    );
    if (duplicate.rows.length > 0) return false;
    const origin = (await this.contentDrizzle.query<DatabaseRow>(sql`
      SELECT zone_id, x, y, z, heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading
      FROM character_origins WHERE race_id = ${character.race}
        AND class_id = ${character.charClass} AND deity_id = ${character.deity}
        AND (start_zone_id = ${character.startZone} OR zone_id = ${character.startZone})
      ORDER BY priority DESC LIMIT 1`)).rows[0];
    if (!origin) return false;
    await this.drizzle.execute(
      sql`INSERT INTO characters
          (account_id, name, level, class_id, race_id, gender, deity_id, face,
           str, sta, dex, agi, intelligence, wis, cha, unspent_stat_points)
          VALUES (${accountId}, ${name}, 1, ${character.charClass}, ${character.race},
            ${character.gender}, ${character.deity}, ${character.face}, ${stats.str},
            ${stats.sta}, ${stats.dex}, ${stats.agi}, ${stats.intel}, ${stats.wis},
            ${stats.cha}, ${stats.points})`,
    );
    const row = (await this.drizzle.query<{ id: number }>(
      sql`SELECT id FROM characters WHERE account_id = ${accountId} AND name = ${name} LIMIT 1`,
    )).rows[0];
    if (!row) return false;
    const characterId = Number(row.id);
    await this.drizzle.execute(sql`INSERT INTO character_positions
      (character_id, zone_id, instance_id, x, y, z, heading) VALUES
      (${characterId}, ${Number(origin.zone_id)}, 0, ${Number(origin.x)}, ${Number(origin.y)},
       ${Number(origin.z)}, ${Number(origin.heading)})`);
    for (let slot = 0; slot < 5; slot++) await this.drizzle.execute(sql`
      INSERT INTO character_binds (character_id, slot, zone_id, instance_id, x, y, z, heading)
      VALUES (${characterId}, ${slot}, ${Number(origin.bind_zone_id)}, 0,
        ${Number(origin.bind_x)}, ${Number(origin.bind_y)}, ${Number(origin.bind_z)},
        ${Number(origin.bind_heading)})`);
    const skills = new Map(startingSkills(character.race));
    const classSkills = (await this.contentDrizzle.query<{ skill_id: number; cap: number }>(sql`
      SELECT skill_id, cap FROM class_skill_caps
      WHERE class_id = ${character.charClass} AND level = 1 AND cap > 0`)).rows;
    for (const row of classSkills) {
      const skillId = Number(row.skill_id);
      if (!skills.has(skillId) && isStartingClassSkill(skillId)) skills.set(skillId, Number(row.cap));
    }
    for (const [skill, value] of skills) await this.drizzle.execute(sql`
      INSERT INTO character_skills (character_id, skill_id, value)
      VALUES (${characterId}, ${skill}, ${value})`);
    for (const [language, value] of startingLanguages(character.race, character.charClass)) await this.drizzle.execute(sql`
      INSERT INTO character_languages (character_id, language_id, value)
      VALUES (${characterId}, ${language}, ${value})`);
    await this.seedStartingItems(characterId, character, Number(origin.zone_id));
    return true;
  }

  private async seedStartingItems(characterId: number, character: BackendCharacterCreate, zoneId: number): Promise<void> {
    const rows = (await this.contentDrizzle.query<DatabaseRow>(sql`
      SELECT item_id, quantity, inventory_slot, criteria_json
      FROM character_starting_items ORDER BY id`)).rows;
    const occupied = new Set<number>();
    for (const row of rows) {
      if (!startingItemMatches(String(row.criteria_json ?? "{}"), character, zoneId)) continue;
      let slot = row.inventory_slot === null ? -1 : Number(row.inventory_slot);
      if (slot < 0 || occupied.has(slot)) slot = [22,23,24,25,26,27,28,29].find(value => !occupied.has(value)) ?? 30;
      occupied.add(slot);
      await this.drizzle.execute(sql`INSERT INTO player_inventory
        (character_id, bag, slot, item_id, quantity) VALUES
        (${characterId}, -1, ${slot}, ${Number(row.item_id)}, ${Math.max(1, Number(row.quantity))})`);
    }
  }

  async deleteCharacter(accountId: number, name: string): Promise<boolean> {
    return this.database.transaction(async (database) => {
      const repository = new GameRepository(database, this.contentDatabase);
      const row = (await repository.drizzle.query<{ id: number }>(sql`
        SELECT id FROM characters WHERE account_id = ${accountId} AND name = ${name} LIMIT 1`)).rows[0];
      if (!row) return false;
      const characterId = Number(row.id);
      for (const table of [
        "character_quest_state", "player_inventory", "character_languages",
        "character_skills", "character_binds", "character_positions",
      ]) {
        await database.execute(`DELETE FROM ${table} WHERE character_id = ?`, [characterId]);
      }
      const result = await repository.drizzle.execute(sql`
        DELETE FROM characters WHERE id = ${characterId} AND account_id = ${accountId}`);
      return result.affectedRows > 0;
    });
  }

  async moveItem(input: PersistMoveItemInput): Promise<PersistSlotMove[]> {
    return this.database.transaction(async (database) => {
      const repository = new GameRepository(database);
      const inventory = await repository.drizzle.query<InventoryRow>(
        sql`SELECT bag, slot, item_id FROM player_inventory
            WHERE character_id = ${input.sessionId}
            AND slot IN (${input.fromSlot}, ${input.toSlot})`,
      );
      const moves = planInventorySwap(
        inventory.rows.map((row) => ({
          slot: Number(row.slot),
          bag: Number(row.bag),
          itemKey: Number(row.item_id),
        })),
        { slot: input.fromSlot, bag: input.fromBag },
        { slot: input.toSlot, bag: input.toBag },
      );
      for (const movement of moves) {
        await repository.deleteInventorySlot(
          input.sessionId,
          movement.fromBag,
          movement.fromSlot,
        );
      }
      for (const movement of moves) {
        await repository.putInventorySlot(
          input.sessionId,
          movement.bag,
          movement.slot,
          Number(movement.itemKey),
        );
      }
      return movementConfirmations(
        moves,
        { slot: input.fromSlot, bag: input.fromBag },
        { slot: input.toSlot, bag: input.toBag },
      ) satisfies PersistSlotMove[];
    });
  }

  async deleteItem(input: PersistDeleteItemInput): Promise<void> {
    await this.deleteInventorySlot(input.sessionId, input.bag, input.slot);
  }

  private async deleteInventorySlot(
    sessionId: number,
    bag: number,
    slot: number,
  ): Promise<void> {
    await this.drizzle.execute(
      sql`DELETE FROM player_inventory WHERE character_id = ${sessionId}
          AND bag = ${bag} AND slot = ${slot}`,
    );
  }

  private async putInventorySlot(
    sessionId: number,
    bag: number,
    slot: number,
    itemId: number,
  ): Promise<void> {
    await this.deleteInventorySlot(sessionId, bag, slot);
    await this.drizzle.execute(
      sql`INSERT INTO player_inventory (character_id, bag, slot, item_id)
          VALUES (${sessionId}, ${bag}, ${slot}, ${itemId})`,
    );
  }
}

function timestamp(value: string | number | null): number {
  if (typeof value === "number") return value;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
