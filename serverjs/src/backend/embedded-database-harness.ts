import type { DatabaseBackend } from "../db/backend.js";
import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "../db/canonical-schema.js";
import { DrizzleDatabase } from "../db/drizzle-database.js";
import type {
  BackendItemTemplate,
  EmbeddedBackendContent,
} from "./contracts.js";

const EMBEDDED_SCHEMA_VERSION = "6";

/**
 * SQLite-only assembly for the offline runtime. It owns compatibility reset, attached
 * content, and fixture seeding; gameplay code only sees the shared repositories.
 */
export class EmbeddedDatabaseHarness {
  readonly contentPrefix: string;
  private readonly database: DrizzleDatabase;

  constructor(
    private readonly driver: DatabaseBackend,
    private readonly content: EmbeddedBackendContent,
  ) {
    this.database = new DrizzleDatabase(driver);
    this.contentPrefix = content.contentDatabasePath ? "content_db." : "";
  }

  async initialize(): Promise<void> {
    await this.prepareCanonicalDatabase();
    await applyCanonicalRuntimeSchema(this.driver);
    if (this.content.contentDatabasePath) {
      await this.database.execute("ATTACH DATABASE ? AS content_db", [
        this.content.contentDatabasePath,
      ]);
      return;
    }
    await applyCanonicalContentSchema(this.driver);
    for (const zone of this.content.zones) {
      await this.database.execute(
        `INSERT INTO zones (id, short_name, name, safe_x, safe_y, safe_z, enabled)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT DO NOTHING`,
        [
          zone.id,
          zone.shortName,
          zone.longName,
          zone.safeX ?? 0,
          zone.safeY ?? 0,
          zone.safeZ ?? 0,
        ],
      );
    }
    for (const item of this.content.items) await this.upsertItem(item);
  }

  private async prepareCanonicalDatabase(): Promise<void> {
    let version: string | undefined;
    try {
      version = (
        await this.database.query<{ value: string }>(
          "SELECT value FROM app_meta WHERE key = 'schema_version' LIMIT 1",
        )
      ).rows[0]?.value;
    } catch (error) {
      if (!isMissingAppMetaTable(error)) throw error;
    }
    if (version === EMBEDDED_SCHEMA_VERSION) return;
    if (version === "5") {
      await this.database.execute(
        "UPDATE app_meta SET value = ? WHERE key = 'schema_version'",
        [EMBEDDED_SCHEMA_VERSION],
      );
      return;
    }
    if (version === "3") {
      await this.withForeignKeysDisabled(async () => {
        await this.database.transaction(async (transaction) => {
          for (const table of CONTENT_TABLES) {
            await transaction.execute(`DROP TABLE IF EXISTS ${table}`);
          }
          await transaction.execute(
            "UPDATE app_meta SET value = ? WHERE key = 'schema_version'",
            [EMBEDDED_SCHEMA_VERSION],
          );
        });
      });
      return;
    }
    await this.withForeignKeysDisabled(async () => {
      await this.database.transaction(async (transaction) => {
        for (const table of RESET_TABLES) {
          await transaction.execute(`DROP TABLE IF EXISTS ${table}`);
        }
        await transaction.execute(
          "CREATE TABLE app_meta (key VARCHAR(64) PRIMARY KEY, value TEXT NOT NULL)",
        );
        await transaction.execute(
          "INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)",
          [EMBEDDED_SCHEMA_VERSION],
        );
      });
    });
  }

  private async withForeignKeysDisabled(work: () => Promise<void>): Promise<void> {
    await this.database.execute("PRAGMA foreign_keys = OFF");
    try {
      await work();
    } finally {
      await this.database.execute("PRAGMA foreign_keys = ON");
    }
  }

  private async upsertItem(item: BackendItemTemplate): Promise<void> {
    await this.database.execute(
      `INSERT INTO items
        (id, name, idfile, icon, material, color, itemtype, slots, ac, bagslots,
         classes, races, stackable, stacksize, maxcharges, weight, damage, delay,
         astr, asta, adex, aagi, aint, awis, acha, hp, mana, dr, mr, cr, fr, pr,
         haste, magic, nodrop, base_price, sell_rate_permille)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, idfile = excluded.idfile,
         icon = excluded.icon, material = excluded.material, color = excluded.color,
         itemtype = excluded.itemtype, slots = excluded.slots, ac = excluded.ac,
         bagslots = excluded.bagslots, classes = excluded.classes, races = excluded.races,
         stackable = excluded.stackable, stacksize = excluded.stacksize,
         maxcharges = excluded.maxcharges, weight = excluded.weight,
         damage = excluded.damage, delay = excluded.delay, astr = excluded.astr,
         asta = excluded.asta, adex = excluded.adex, aagi = excluded.aagi,
         aint = excluded.aint, awis = excluded.awis, acha = excluded.acha,
         hp = excluded.hp, mana = excluded.mana, dr = excluded.dr, mr = excluded.mr,
         cr = excluded.cr, fr = excluded.fr, pr = excluded.pr, haste = excluded.haste,
         magic = excluded.magic, nodrop = excluded.nodrop,
         base_price = excluded.base_price,
         sell_rate_permille = excluded.sell_rate_permille`,
      [
        item.id,
        item.name,
        item.idfile,
        item.icon,
        item.material,
        item.color,
        item.itemtype,
        item.slots,
        item.ac,
        item.bagslots,
        item.classes,
        item.races,
        item.stackable,
        item.stacksize,
        item.maxcharges,
        item.weight ?? 0,
        item.damage ?? 0,
        item.delay ?? 0,
        item.astr ?? 0,
        item.asta ?? 0,
        item.adex ?? 0,
        item.aagi ?? 0,
        item.aint ?? 0,
        item.awis ?? 0,
        item.acha ?? 0,
        item.hp ?? 0,
        item.mana ?? 0,
        item.dr ?? 0,
        item.mr ?? 0,
        item.cr ?? 0,
        item.fr ?? 0,
        item.pr ?? 0,
        item.haste ?? 0,
        item.magic ?? 0,
        item.nodrop ?? 0,
        item.basePrice ?? 0,
        item.sellRatePermille ?? 1_000,
      ],
    );
  }
}

function isMissingAppMetaTable(error: unknown): boolean {
  const message = String(
    (error as { message?: unknown })?.message ?? error,
  ).toLowerCase();
  return (
    message.includes("no such table: app_meta") ||
    (message.includes("relation") &&
      message.includes("app_meta") &&
      message.includes("does not exist")) ||
    (message.includes("table") &&
      message.includes("app_meta") &&
      message.includes("doesn't exist"))
  );
}

const CONTENT_TABLES = [
  "npc_merchant_assignments",
  "merchant_catalog_entries",
  "merchant_catalogs",
  "npc_loot_group_entries",
  "npc_loot_table_entries",
  "npc_loot_assignments",
  "npc_loot_tables",
  "npc_loot_items",
  "class_skill_caps",
  "character_starting_items",
  "character_origins",
  "spawn_points",
  "spawn_group_members",
  "spawn_groups",
  "npc_archetypes",
  "quest_definitions",
  "zones",
  "items",
  "content_releases",
] as const;

const RESET_TABLES = [
  "merchant_transactions",
  "merchant_dynamic_stock",
  "character_currency",
  "local_inventory",
  "local_items",
  "local_spawns",
  "offline_hydration",
  "character_quest_state",
  "character_knowledge",
  "player_inventory",
  "character_positions",
  "characters",
  "accounts",
  "character_languages",
  "character_skills",
  "character_binds",
  "npc_loot_group_entries",
  "npc_merchant_assignments",
  "merchant_catalog_entries",
  "merchant_catalogs",
  "npc_loot_table_entries",
  "npc_loot_assignments",
  "npc_loot_tables",
  "npc_loot_items",
  "spawn_points",
  "spawn_group_members",
  "spawn_groups",
  "npc_archetypes",
  "quest_definitions",
  "zones",
  "items",
  "content_releases",
  "character_starting_items",
  "character_origins",
  "class_skill_caps",
  "schema_migrations",
  "app_meta",
] as const;
