import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import { sql } from "drizzle-orm";
import { resolveCharacterOrigin } from "../content/character-origin.js";
import { applyDemoStart } from "../content/demo-start.js";
import { TechniqueRepository } from "../progression/technique-repository.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import {
  characterCanEquipItem,
  itemAllowedInSlot,
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
import type { GameItemRow } from "../backend/item-instance.js";
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
  appearance_schema_version: number | null;
  body_family_id: string | null;
  body_component_id: string | null;
  face_component_id: string | null;
  presentation_id: string | null;
  calling_id: string | null;
  origin_id: string | null;
}

interface InventoryCharacterRow extends DatabaseRow {
  class_id: number;
  race_id: number;
}

export interface GrantedInventoryItem {
  readonly slot: number;
  readonly bag: number;
  readonly item: GameItemRow;
}

export interface InventoryPositionRecord extends DatabaseRow {
  readonly slot: number;
  readonly bag: number;
}

export interface InventoryDestination {
  readonly slot: number;
  readonly bag: number;
}

const GENERAL_SLOTS = [22, 23, 24, 25, 26, 27, 28, 29] as const;

export class GameRepository {
  private readonly drizzle: DrizzleDatabase;
  private readonly contentDrizzle: DrizzleDatabase;

  constructor(
    private readonly database: DatabaseBackend,
    private readonly contentDatabase: DatabaseBackend = database,
    private readonly contentPrefix = "",
  ) {
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
          character.face, character.last_login_at, character.appearance_schema_version,
          character.body_family_id, character.body_component_id,
          character.face_component_id, character.presentation_id,
          character.calling_id, character.origin_id,
          position.zone_id, position.instance_id
          FROM characters character
          JOIN character_positions position ON position.character_id = character.id
          WHERE character.account_id = ${accountId} ORDER BY character.name LIMIT 8`,
    );
    const gameData = new GameDataRepository(
      this.contentDatabase,
      this.database,
      this.contentPrefix,
    );
    return Promise.all(result.rows.map(async (row) => ({
      id: Number(row.id),
      name: row.name,
      level: Number(row.level),
      class: Number(row.class_id), race: Number(row.race_id), gender: Number(row.gender),
      deity: Number(row.deity_id), face: Number(row.face), zoneId: Number(row.zone_id),
      zoneInstance: Number(row.instance_id), lastLogin: timestamp(row.last_login_at),
      items: await gameData.inventoryItems(Number(row.id)),
      ...(row.appearance_schema_version === null ? {} : {
        appearanceSchemaVersion: Number(row.appearance_schema_version),
        bodyFamilyId           : String(row.body_family_id),
        bodyComponentId        : String(row.body_component_id),
        faceComponentId        : String(row.face_component_id),
        presentationId         : String(row.presentation_id),
        callingId              : String(row.calling_id),
        originId               : String(row.origin_id),
      }),
    })));
  }

  async createCharacter(accountId: number, character: BackendCharacterCreate): Promise<boolean> {
    return this.database.transaction((database) =>
      new GameRepository(
        database,
        this.transactionContent(database),
        this.contentPrefix,
      ).createCharacterInTransaction(accountId, character)
    );
  }

  /** Creates the complete playable character inside the caller's transaction. */
  async createCharacterInTransaction(
    accountId: number,
    character: BackendCharacterCreate,
  ): Promise<boolean> {
    const name = normalizeCharacterName(character.name);
    const stats = resolveCharacterStats(character);
    if (!name || !stats) return false;
    const duplicate = await this.drizzle.query(
      sql`SELECT id FROM characters WHERE account_id = ${accountId}
          AND lower(name) = lower(${name}) LIMIT 1`,
    );
    if (duplicate.rows.length > 0) return false;
    // One shared rule for both runtimes: every character starts in Talios, and a
    // character that content has no opinion about is placed at the canonical arrival
    // rather than refused.
    const origin = await resolveCharacterOrigin(this.contentDatabase, character, {
      contentPrefix: this.contentPrefix,
    });
    await this.drizzle.execute(
      sql`INSERT INTO characters
          (account_id, name, level, class_id, race_id, gender, deity_id, face,
           str, sta, dex, agi, intelligence, wis, cha, unspent_stat_points,
           appearance_schema_version, body_family_id, body_component_id,
           face_component_id, presentation_id, calling_id, origin_id)
          VALUES (${accountId}, ${name}, 1, ${character.charClass}, ${character.race},
            ${character.gender}, ${character.deity}, ${character.face}, ${stats.str},
            ${stats.sta}, ${stats.dex}, ${stats.agi}, ${stats.intel}, ${stats.wis},
            ${stats.cha}, ${stats.points}, ${character.appearanceSchemaVersion ?? null},
            ${character.bodyFamilyId ?? null}, ${character.bodyComponentId ?? null},
            ${character.faceComponentId ?? null}, ${character.presentationId ?? null},
            ${character.callingId ?? null}, ${character.originId ?? null})`,
    );
    const row = (await this.drizzle.query<{ id: number }>(
      sql`SELECT id FROM characters WHERE account_id = ${accountId} AND name = ${name} LIMIT 1`,
    )).rows[0];
    if (!row) return false;
    const characterId = Number(row.id);
    await this.drizzle.execute(sql`INSERT INTO character_positions
      (character_id, zone_id, instance_id, x, y, z, heading) VALUES
      (${characterId}, ${origin.zoneId}, 0, ${origin.x}, ${origin.y},
       ${origin.z}, ${origin.heading})`);
    for (let slot = 0; slot < 5; slot++) await this.drizzle.execute(sql`
      INSERT INTO character_binds (character_id, slot, zone_id, instance_id, x, y, z, heading)
      VALUES (${characterId}, ${slot}, ${origin.bindZoneId}, 0,
        ${origin.bindX}, ${origin.bindY}, ${origin.bindZ},
        ${origin.bindHeading})`);
    const skills = new Map(startingSkills(character.race));
    const classSkills = (await this.contentDrizzle.query<{ skill_id: number; cap: number }>(sql`
      SELECT skill_id, cap FROM ${this.contentTable("class_skill_caps")}
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
    await this.seedStartingItems(characterId, character, origin.zoneId);
    // A level 1 character is their class immediately: starting techniques are granted
    // and placed on the bar, so nobody has to find a trainer before they can fight.
    await new TechniqueRepository(this.database)
      .grantStartingTechniques(characterId, character.charClass);
    return true;
  }

  private async seedStartingItems(characterId: number, character: BackendCharacterCreate, zoneId: number): Promise<void> {
    const rows = (await this.contentDrizzle.query<DatabaseRow>(sql`
      SELECT item_id, quantity, inventory_slot, criteria_json
      FROM ${this.contentTable("character_starting_items")} ORDER BY id`)).rows;
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
      const repository = new GameRepository(
        database,
        this.transactionContent(database),
        this.contentPrefix,
      );
      const row = (await repository.drizzle.query<{ id: number }>(sql`
        SELECT id FROM characters WHERE account_id = ${accountId} AND name = ${name} LIMIT 1`)).rows[0];
      if (!row) return false;
      const characterId = Number(row.id);
      for (const table of [
        "character_quest_state", "character_knowledge", "player_inventory", "character_languages",
        "character_skills", "character_binds", "character_positions",
      ]) {
        await database.execute(`DELETE FROM ${table} WHERE character_id = ?`, [characterId]);
      }
      const result = await repository.drizzle.execute(sql`
        DELETE FROM characters WHERE id = ${characterId} AND account_id = ${accountId}`);
      return result.affectedRows > 0;
    });
  }

  /** Temporary demo hook used by the shared character-entry service. */
  async applyDemoStart(name: string): Promise<boolean> {
    const row = (
      await this.drizzle.query<{ id: number }>(
        sql`SELECT id FROM characters WHERE lower(name) = lower(${name}) LIMIT 1`,
      )
    ).rows[0];
    if (!row) return false;
    return applyDemoStart(this.database, Number(row.id));
  }

  async touchCharacterLogin(characterId: number): Promise<void> {
    await this.drizzle.execute(sql`
      UPDATE characters SET last_login_at = CURRENT_TIMESTAMP
      WHERE id = ${characterId}
    `);
  }

  async setCharacterLevel(characterId: number, level: number): Promise<void> {
    await this.drizzle.execute(sql`
      UPDATE characters SET level = ${level} WHERE id = ${characterId}
    `);
  }

  async summonItemInTransaction(
    characterId: number,
    itemId: number,
  ): Promise<GrantedInventoryItem | null> {
    const gameData = new GameDataRepository(
      this.contentDatabase,
      this.database,
      this.contentPrefix,
    );
    const item = await gameData.item(itemId);
    if (!item) return null;
    const inventory = await gameData.inventoryEntries(characterId);
    const occupied = new Set(
      inventory
        .filter((entry) => entry.bag === 0)
        .map((entry) => entry.slot),
    );
    const slot = GENERAL_SLOTS.find((candidate) => !occupied.has(candidate)) ?? 30;
    if (slot === 30 && occupied.has(30)) return null;
    await this.drizzle.execute(sql`
      INSERT INTO player_inventory (character_id, slot, bag, item_id)
      VALUES (${characterId}, ${slot}, 0, ${itemId})
    `);
    return { slot, bag: 0, item };
  }

  async grantItemInTransaction(
    characterId: number,
    itemId: number,
    quantity = 1,
    charges = 0,
  ): Promise<InventoryDestination | null> {
    const occupied = (await this.drizzle.query<{ slot: number }>(sql`
      SELECT slot FROM player_inventory
      WHERE character_id = ${characterId} AND bag = -1 AND slot BETWEEN 22 AND 30
    `)).rows;
    const used = new Set(occupied.map((row) => Number(row.slot)));
    const slot = GENERAL_SLOTS.find((candidate) => !used.has(candidate))
      ?? (!used.has(30) ? 30 : null);
    if (slot === null) return null;
    await this.drizzle.execute(sql`
      INSERT INTO player_inventory
        (character_id, bag, slot, item_id, quantity, charges)
      VALUES (${characterId}, -1, ${slot}, ${itemId},
        ${Math.max(1, Math.trunc(quantity))}, ${Math.trunc(charges)})
    `);
    return { slot, bag: -1 };
  }

  async purgeInventoryInTransaction(
    characterId: number,
  ): Promise<InventoryPositionRecord[]> {
    const rows = (await this.drizzle.query<InventoryPositionRecord>(sql`
      SELECT slot, bag FROM player_inventory WHERE character_id = ${characterId}
    `)).rows.map((row) => ({
      slot: Number(row.slot),
      bag: Number(row.bag),
    }));
    await this.drizzle.execute(sql`
      DELETE FROM player_inventory WHERE character_id = ${characterId}
    `);
    return rows;
  }

  async replaceEquipmentInTransaction(
    characterId: number,
    gear: readonly (readonly [slot: number, itemId: number])[],
  ): Promise<InventoryPositionRecord[]> {
    const old = (await this.drizzle.query<InventoryPositionRecord>(sql`
      SELECT slot, bag FROM player_inventory
      WHERE character_id = ${characterId} AND bag = -1
    `)).rows.map((row) => ({ slot: Number(row.slot), bag: Number(row.bag) }));
    await this.drizzle.execute(sql`
      DELETE FROM player_inventory WHERE character_id = ${characterId} AND bag = -1
    `);
    const gameData = new GameDataRepository(
      this.contentDatabase,
      this.database,
      this.contentPrefix,
    );
    for (const [slot, itemId] of gear) {
      if (!await gameData.item(itemId)) continue;
      await this.drizzle.execute(sql`
        INSERT INTO player_inventory (character_id, slot, bag, item_id)
        VALUES (${characterId}, ${slot}, -1, ${itemId})
      `);
    }
    return old;
  }

  async moveItem(input: PersistMoveItemInput): Promise<PersistSlotMove[]> {
    return this.database.transaction(async (database) => {
      return new GameRepository(
        database,
        this.transactionContent(database),
        this.contentPrefix,
      ).moveItemInTransaction(input);
    });
  }

  /** Executes a move inside the caller's transaction/critical lane. */
  async moveItemInTransaction(
    input: PersistMoveItemInput,
  ): Promise<PersistSlotMove[]> {
    const character = (await this.drizzle.query<InventoryCharacterRow>(sql`
      SELECT class_id, race_id FROM characters WHERE id = ${input.characterId} LIMIT 1
    `)).rows[0];
    if (!character) throw new Error("Character not found.");
    const gameData = new GameDataRepository(
      this.contentDatabase,
      this.database,
      this.contentPrefix,
    );
    const inventory = await gameData.inventoryEntries(input.characterId);
    const source = inventory.find(
      (row) => row.slot === input.fromSlot && row.bag === input.fromBag,
    );
    const destination = inventory.find(
      (row) => row.slot === input.toSlot && row.bag === input.toBag,
    );
    if (
      !itemAllowedInSlot(source?.item, input.toSlot) ||
      !itemAllowedInSlot(destination?.item, input.fromSlot)
    ) {
      throw new Error("That item cannot be equipped in that slot.");
    }
    const identity = {
      classId: Number(character.class_id),
      raceId: Number(character.race_id),
    };
    if (
      !characterCanEquipItem(identity, source?.item, input.toSlot) ||
      !characterCanEquipItem(identity, destination?.item, input.fromSlot)
    ) {
      throw new Error("Your class or race cannot equip that item.");
    }
    const byPosition = new Map<string, (typeof inventory)[number]>(
      inventory.map((row) => [`${row.slot}:${row.bag}`, row] as const),
    );
    const moves = planInventorySwap(
      inventory.map((row) => ({
        slot: row.slot,
        bag: row.bag,
        itemKey: `${row.slot}:${row.bag}`,
        containerSlots: Number(row.item.bagslots),
      })),
      { slot: input.fromSlot, bag: input.fromBag },
      { slot: input.toSlot, bag: input.toBag },
    );
    for (const movement of moves) {
      await this.deleteInventorySlot(
        input.characterId,
        movement.fromBag,
        movement.fromSlot,
      );
    }
    for (const movement of moves) {
      const stored = byPosition.get(String(movement.itemKey));
      if (!stored) throw new Error("Inventory changed during move.");
      await this.putInventorySlot(
        input.characterId,
        movement.bag,
        movement.slot,
        stored.itemId,
        stored.quantity,
        stored.charges,
      );
    }
    return movementConfirmations(
      moves,
      { slot: input.fromSlot, bag: input.fromBag },
      { slot: input.toSlot, bag: input.toBag },
    ) satisfies PersistSlotMove[];
  }

  async deleteItem(input: PersistDeleteItemInput): Promise<void> {
    await this.database.transaction((database) =>
      new GameRepository(
        database,
        this.transactionContent(database),
        this.contentPrefix,
      ).deleteItemInTransaction(input)
    );
  }

  /** Executes a deletion inside the caller's transaction/critical lane. */
  async deleteItemInTransaction(input: PersistDeleteItemInput): Promise<void> {
    await this.deleteInventorySlot(input.characterId, input.bag, input.slot);
  }

  private async deleteInventorySlot(
    characterId: number,
    bag: number,
    slot: number,
  ): Promise<void> {
    await this.drizzle.execute(
      sql`DELETE FROM player_inventory WHERE character_id = ${characterId}
          AND bag = ${bag} AND slot = ${slot}`,
    );
  }

  private async putInventorySlot(
    characterId: number,
    bag: number,
    slot: number,
    itemId: number,
    quantity: number,
    charges: number,
  ): Promise<void> {
    await this.deleteInventorySlot(characterId, bag, slot);
    await this.drizzle.execute(
      sql`INSERT INTO player_inventory
          (character_id, bag, slot, item_id, quantity, charges)
          VALUES (${characterId}, ${bag}, ${slot}, ${itemId}, ${quantity}, ${charges})`,
    );
  }

  private transactionContent(transaction: DatabaseBackend): DatabaseBackend {
    return this.contentDatabase === this.database
      ? transaction
      : this.contentDatabase;
  }

  private contentTable(name: string) {
    if (!/^[a-z_]+$/.test(name) || !/^(?:[a-z_]+\.)?$/.test(this.contentPrefix)) {
      throw new Error("Invalid content table identifier");
    }
    return sql.raw(`${this.contentPrefix}${name}`);
  }
}

function timestamp(value: string | number | null): number {
  if (typeof value === "number") return value;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
