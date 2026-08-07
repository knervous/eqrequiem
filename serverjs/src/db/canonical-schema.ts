import type { DatabaseBackend } from "./backend.js";

interface Migration {
  version: number;
  statements(database: DatabaseBackend): string[];
}

const contentMigrations: Migration[] = [{
  version: 1,
  statements: (database) => {
    const id = identity(database);
    return [
      `CREATE TABLE IF NOT EXISTS content_releases (id ${id}, release_key VARCHAR(255) NOT NULL UNIQUE, label TEXT NOT NULL, state VARCHAR(32) NOT NULL DEFAULT 'draft', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, published_at TIMESTAMP, published_by TEXT, notes TEXT)`,
      `CREATE TABLE IF NOT EXISTS zones (id ${id}, short_name VARCHAR(255) NOT NULL UNIQUE, name TEXT NOT NULL, safe_x REAL NOT NULL DEFAULT 0, safe_y REAL NOT NULL DEFAULT 0, safe_z REAL NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS npc_archetypes (id ${id}, npc_key VARCHAR(255) NOT NULL UNIQUE, name TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 1, race_id INTEGER NOT NULL DEFAULT 1, gender INTEGER NOT NULL DEFAULT 0, movement_speed REAL NOT NULL DEFAULT 1, model_key TEXT, behavior_key TEXT, properties_json TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS spawn_groups (id ${id}, spawn_group_key VARCHAR(255) NOT NULL UNIQUE, respawn_seconds INTEGER NOT NULL DEFAULT 360, enabled INTEGER NOT NULL DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS spawn_group_members (spawn_group_id BIGINT NOT NULL, npc_archetype_id BIGINT NOT NULL, weight INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(spawn_group_id, npc_archetype_id), FOREIGN KEY(spawn_group_id) REFERENCES spawn_groups(id), FOREIGN KEY(npc_archetype_id) REFERENCES npc_archetypes(id))`,
      `CREATE TABLE IF NOT EXISTS spawn_points (id ${id}, zone_id BIGINT NOT NULL, spawn_group_id BIGINT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, heading REAL NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(zone_id) REFERENCES zones(id), FOREIGN KEY(spawn_group_id) REFERENCES spawn_groups(id))`,
      `CREATE TABLE IF NOT EXISTS quest_definitions (id ${id}, quest_key VARCHAR(255) NOT NULL UNIQUE, revision INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, definition_json TEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ];
  },
}, {
  version: 2,
  statements: (database) => {
    const id = identity(database);
    return [
      `CREATE TABLE IF NOT EXISTS items (
        id ${id}, name VARCHAR(255) NOT NULL, idfile VARCHAR(255) NOT NULL DEFAULT '',
        icon INTEGER NOT NULL DEFAULT 0, material INTEGER NOT NULL DEFAULT 0,
        color BIGINT NOT NULL DEFAULT 0, itemtype INTEGER NOT NULL DEFAULT 10,
        slots BIGINT NOT NULL DEFAULT 0, ac INTEGER NOT NULL DEFAULT 0,
        bagslots INTEGER NOT NULL DEFAULT 0, classes BIGINT NOT NULL DEFAULT 65535,
        races BIGINT NOT NULL DEFAULT 4294967295, stackable INTEGER NOT NULL DEFAULT 0,
        stacksize INTEGER NOT NULL DEFAULT 1, maxcharges INTEGER NOT NULL DEFAULT 0,
        weight INTEGER NOT NULL DEFAULT 0, damage INTEGER NOT NULL DEFAULT 0,
        delay INTEGER NOT NULL DEFAULT 0, astr INTEGER NOT NULL DEFAULT 0,
        asta INTEGER NOT NULL DEFAULT 0, adex INTEGER NOT NULL DEFAULT 0,
        aagi INTEGER NOT NULL DEFAULT 0, aint INTEGER NOT NULL DEFAULT 0,
        awis INTEGER NOT NULL DEFAULT 0, acha INTEGER NOT NULL DEFAULT 0,
        hp INTEGER NOT NULL DEFAULT 0, mana INTEGER NOT NULL DEFAULT 0,
        dr INTEGER NOT NULL DEFAULT 0, mr INTEGER NOT NULL DEFAULT 0,
        cr INTEGER NOT NULL DEFAULT 0, fr INTEGER NOT NULL DEFAULT 0,
        pr INTEGER NOT NULL DEFAULT 0, haste INTEGER NOT NULL DEFAULT 0,
        magic INTEGER NOT NULL DEFAULT 0, nodrop INTEGER NOT NULL DEFAULT 0)`,
      createIndex(database, "items_name_idx", "items", "name"),
    ];
  },
}, {
  version: 3,
  statements: () => [
    "ALTER TABLE spawn_points ADD COLUMN path_grid_id BIGINT",
    "ALTER TABLE spawn_points ADD COLUMN movement_path_json TEXT",
  ],
}, {
  version: 4,
  statements: (database) => {
    const id = identity(database);
    return [
      `CREATE TABLE IF NOT EXISTS character_origins (
        id ${id}, race_id INTEGER NOT NULL, class_id INTEGER NOT NULL,
        deity_id INTEGER NOT NULL, start_zone_id BIGINT NOT NULL,
        zone_id BIGINT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
        heading REAL NOT NULL DEFAULT 0, bind_zone_id BIGINT NOT NULL,
        bind_x REAL NOT NULL, bind_y REAL NOT NULL, bind_z REAL NOT NULL,
        bind_heading REAL NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0,
        UNIQUE(race_id, class_id, deity_id, start_zone_id))`,
      createIndex(database, "character_origins_lookup_idx", "character_origins", "race_id, class_id, deity_id"),
      `CREATE TABLE IF NOT EXISTS character_starting_items (
        id ${id}, item_id BIGINT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
        inventory_slot INTEGER, criteria_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(item_id) REFERENCES items(id))`,
    ];
  },
}, {
  // v4 briefly shipped the starting-item table under a legacy-colliding name.
  // Keep migrations immutable and establish the canonical name in a new step.
  version: 5,
  statements: (database) => {
    const id = identity(database);
    return [
      `CREATE TABLE IF NOT EXISTS character_starting_items (
        id ${id}, item_id BIGINT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1,
        inventory_slot INTEGER, criteria_json TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(item_id) REFERENCES items(id))`,
    ];
  },
}, {
  version: 6,
  statements: () => [
    `CREATE TABLE IF NOT EXISTS class_skill_caps (
      class_id INTEGER NOT NULL, skill_id INTEGER NOT NULL, level INTEGER NOT NULL,
      cap INTEGER NOT NULL, PRIMARY KEY(class_id, skill_id, level))`,
  ],
}, {
  version: 7,
  statements: () => [
    `CREATE TABLE IF NOT EXISTS npc_loot_items (
      npc_archetype_id BIGINT NOT NULL, item_id BIGINT NOT NULL,
      loot_slot INTEGER NOT NULL DEFAULT 0,
      chance_permille INTEGER NOT NULL DEFAULT 1000,
      minimum_quantity INTEGER NOT NULL DEFAULT 1,
      maximum_quantity INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(npc_archetype_id, loot_slot),
      FOREIGN KEY(npc_archetype_id) REFERENCES npc_archetypes(id),
      FOREIGN KEY(item_id) REFERENCES items(id))`,
  ],
}, {
  version: 8,
  statements: (database) => [
    `CREATE TABLE IF NOT EXISTS npc_loot_tables (
      id BIGINT PRIMARY KEY, loot_key VARCHAR(255) NOT NULL UNIQUE,
      minimum_currency INTEGER NOT NULL DEFAULT 0,
      maximum_currency INTEGER NOT NULL DEFAULT 0,
      average_currency INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE IF NOT EXISTS npc_loot_assignments (
      npc_archetype_id BIGINT PRIMARY KEY, loot_table_id BIGINT NOT NULL,
      FOREIGN KEY(npc_archetype_id) REFERENCES npc_archetypes(id),
      FOREIGN KEY(loot_table_id) REFERENCES npc_loot_tables(id))`,
    `CREATE TABLE IF NOT EXISTS npc_loot_table_entries (
      loot_table_id BIGINT NOT NULL, loot_group_id BIGINT NOT NULL,
      rolls INTEGER NOT NULL DEFAULT 1,
      chance_permille INTEGER NOT NULL DEFAULT 1000,
      drop_limit INTEGER NOT NULL DEFAULT 0,
      minimum_drops INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(loot_table_id, loot_group_id),
      FOREIGN KEY(loot_table_id) REFERENCES npc_loot_tables(id))`,
    `CREATE TABLE IF NOT EXISTS npc_loot_group_entries (
      loot_group_id BIGINT NOT NULL, item_id BIGINT NOT NULL,
      chance_permille INTEGER NOT NULL DEFAULT 1000,
      rolls INTEGER NOT NULL DEFAULT 1,
      minimum_quantity INTEGER NOT NULL DEFAULT 1,
      maximum_quantity INTEGER NOT NULL DEFAULT 1,
      npc_minimum_level INTEGER NOT NULL DEFAULT 0,
      npc_maximum_level INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(loot_group_id, item_id),
      FOREIGN KEY(item_id) REFERENCES items(id))`,
    createIndex(database, "npc_loot_assignment_table_idx", "npc_loot_assignments", "loot_table_id"),
    createIndex(database, "npc_loot_table_group_idx", "npc_loot_table_entries", "loot_group_id"),
    createIndex(database, "npc_loot_group_item_idx", "npc_loot_group_entries", "item_id"),
  ],
}, {
  version: 9,
  statements: (database) => [
    "ALTER TABLE items ADD COLUMN base_price BIGINT NOT NULL DEFAULT 0",
    "ALTER TABLE items ADD COLUMN sell_rate_permille INTEGER NOT NULL DEFAULT 1000",
    `CREATE TABLE IF NOT EXISTS merchant_catalogs (
      id BIGINT PRIMARY KEY, merchant_key VARCHAR(255) NOT NULL UNIQUE,
      label TEXT NOT NULL DEFAULT '')`,
    `CREATE TABLE IF NOT EXISTS merchant_catalog_entries (
      catalog_id BIGINT NOT NULL, merchant_slot INTEGER NOT NULL,
      item_id BIGINT NOT NULL, level_required INTEGER NOT NULL DEFAULT 0,
      classes_required BIGINT NOT NULL DEFAULT 4294967295,
      probability_permille INTEGER NOT NULL DEFAULT 1000,
      PRIMARY KEY(catalog_id, merchant_slot),
      FOREIGN KEY(catalog_id) REFERENCES merchant_catalogs(id),
      FOREIGN KEY(item_id) REFERENCES items(id))`,
    `CREATE TABLE IF NOT EXISTS npc_merchant_assignments (
      npc_archetype_id BIGINT PRIMARY KEY, catalog_id BIGINT NOT NULL,
      keeps_sold_items INTEGER NOT NULL DEFAULT 1,
      greed INTEGER NOT NULL DEFAULT 0,
      sell_to_player_permille INTEGER NOT NULL DEFAULT 1000,
      buy_from_player_permille INTEGER NOT NULL DEFAULT 950,
      interaction_range REAL NOT NULL DEFAULT 20,
      pricing_policy_json VARCHAR(4096) NOT NULL DEFAULT '{}',
      FOREIGN KEY(npc_archetype_id) REFERENCES npc_archetypes(id),
      FOREIGN KEY(catalog_id) REFERENCES merchant_catalogs(id))`,
    createIndex(database, "merchant_catalog_item_idx", "merchant_catalog_entries", "item_id"),
    createIndex(database, "npc_merchant_catalog_idx", "npc_merchant_assignments", "catalog_id"),
  ],
}, {
  // Progression tuning is content, not code: the curve is imported and rebalanced
  // against play telemetry without touching the progression service.
  version: 10,
  statements: () => [
    `CREATE TABLE IF NOT EXISTS level_experience_curve (
      level INTEGER PRIMARY KEY,
      cumulative_experience BIGINT NOT NULL)`,
  ],
}];

const runtimeMigrations: Migration[] = [{
  version: 1,
  statements: (database) => {
    const id = identity(database);
    return [
      `CREATE TABLE IF NOT EXISTS accounts (id ${id}, identity VARCHAR(255) NOT NULL UNIQUE, status VARCHAR(32) NOT NULL DEFAULT 'active', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS characters (id ${id}, account_id BIGINT NOT NULL, name VARCHAR(255) NOT NULL UNIQUE, level INTEGER NOT NULL DEFAULT 1, class_id INTEGER NOT NULL DEFAULT 1, race_id INTEGER NOT NULL DEFAULT 1, gender INTEGER NOT NULL DEFAULT 0, deity_id INTEGER NOT NULL DEFAULT 0, face INTEGER NOT NULL DEFAULT 0, last_login_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(account_id) REFERENCES accounts(id))`,
      `CREATE TABLE IF NOT EXISTS character_positions (character_id BIGINT PRIMARY KEY, zone_id BIGINT NOT NULL, instance_id INTEGER NOT NULL DEFAULT 0, x REAL NOT NULL DEFAULT 0, y REAL NOT NULL DEFAULT 0, z REAL NOT NULL DEFAULT 0, heading REAL NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(character_id) REFERENCES characters(id))`,
      `CREATE TABLE IF NOT EXISTS player_inventory (character_id BIGINT NOT NULL, bag INTEGER NOT NULL DEFAULT 0, slot INTEGER NOT NULL, item_id BIGINT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, charges INTEGER NOT NULL DEFAULT 0, custom_data_json TEXT, PRIMARY KEY(character_id, bag, slot), FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS character_quest_state (character_id BIGINT NOT NULL, quest_key VARCHAR(255) NOT NULL, revision INTEGER NOT NULL, state_json TEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(character_id, quest_key), FOREIGN KEY(character_id) REFERENCES characters(id))`,
      createIndex(database, "player_inventory_item_idx", "player_inventory", "item_id"),
    ];
  },
}, {
  version: 2,
  statements: () => [
    "ALTER TABLE characters ADD COLUMN str INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN sta INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN dex INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN agi INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN intelligence INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN wis INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN cha INTEGER NOT NULL DEFAULT 75",
    "ALTER TABLE characters ADD COLUMN unspent_stat_points INTEGER NOT NULL DEFAULT 0",
    `CREATE TABLE IF NOT EXISTS character_binds (
      character_id BIGINT NOT NULL, slot INTEGER NOT NULL, zone_id BIGINT NOT NULL,
      instance_id INTEGER NOT NULL DEFAULT 0, x REAL NOT NULL, y REAL NOT NULL,
      z REAL NOT NULL, heading REAL NOT NULL DEFAULT 0,
      PRIMARY KEY(character_id, slot), FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS character_skills (
      character_id BIGINT NOT NULL, skill_id INTEGER NOT NULL, value INTEGER NOT NULL,
      PRIMARY KEY(character_id, skill_id), FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS character_languages (
      character_id BIGINT NOT NULL, language_id INTEGER NOT NULL, value INTEGER NOT NULL,
      PRIMARY KEY(character_id, language_id), FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
  ],
}, {
  version: 3,
  statements: () => [
    "ALTER TABLE characters ADD COLUMN appearance_schema_version INTEGER",
    "ALTER TABLE characters ADD COLUMN body_family_id VARCHAR(255)",
    "ALTER TABLE characters ADD COLUMN body_component_id VARCHAR(255)",
    "ALTER TABLE characters ADD COLUMN face_component_id VARCHAR(255)",
    "ALTER TABLE characters ADD COLUMN presentation_id VARCHAR(255)",
    "ALTER TABLE characters ADD COLUMN calling_id VARCHAR(255)",
    "ALTER TABLE characters ADD COLUMN origin_id VARCHAR(255)",
  ],
}, {
  version: 4,
  statements: (database) => {
    const id = identity(database);
    return [
      `CREATE TABLE IF NOT EXISTS character_currency (
        character_id BIGINT PRIMARY KEY, carried_copper BIGINT NOT NULL DEFAULT 0,
        banked_copper BIGINT NOT NULL DEFAULT 0,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS merchant_dynamic_stock (
        npc_archetype_id BIGINT NOT NULL, zone_id BIGINT NOT NULL,
        instance_id INTEGER NOT NULL DEFAULT 0, item_id BIGINT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(npc_archetype_id, zone_id, instance_id, item_id))`,
      `CREATE TABLE IF NOT EXISTS merchant_transactions (
        id ${id}, character_id BIGINT NOT NULL, npc_archetype_id BIGINT NOT NULL,
        action VARCHAR(16) NOT NULL, item_id BIGINT NOT NULL,
        quantity INTEGER NOT NULL, copper BIGINT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
      createIndex(database, "merchant_transactions_character_idx", "merchant_transactions", "character_id, created_at"),
    ];
  },
}, {
  version: 5,
  statements: (database) => {
    const id = identity(database);
    const blob = database.dialect === "postgres"
      ? "BYTEA"
      : database.dialect === "mysql"
        ? "LONGBLOB"
        : "BLOB";
    return [
      `CREATE TABLE IF NOT EXISTS zone_snapshots (
        id ${id}, zone_id BIGINT NOT NULL, instance_id INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        format_version INTEGER NOT NULL, blob_data ${blob} NOT NULL)`,
      createIndex(
        database,
        "zone_snapshots_latest_idx",
        "zone_snapshots",
        "zone_id, instance_id, created_at, id",
      ),
    ];
  },
}, {
  version: 6,
  statements: () => [
    "ALTER TABLE characters ADD COLUMN experience BIGINT NOT NULL DEFAULT 0",
    // Character knowledge is deliberately its own scope: what the character has
    // learned outlives, and is queried independently of, any one quest's state.
    `CREATE TABLE IF NOT EXISTS character_knowledge (
      character_id BIGINT NOT NULL, knowledge_key VARCHAR(255) NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}',
      learned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(character_id, knowledge_key),
      FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
  ],
}, {
  version: 7,
  statements: (database) => {
    const id = identity(database);
    return [
      // What the player chose to remember, as opposed to what the world told them.
      // Deliberately its own scope: no content author has to annotate a line perfectly
      // for the player to be able to keep it.
      `CREATE TABLE IF NOT EXISTS character_journal_notes (
        id ${id}, character_id BIGINT NOT NULL,
        source TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
        zone_id BIGINT, x REAL, y REAL, z REAL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE)`,
      createIndex(
        database,
        "character_journal_notes_character_idx",
        "character_journal_notes",
        "character_id, created_at",
      ),
    ];
  },
}];

export function applyCanonicalContentSchema(database: DatabaseBackend): Promise<void> {
  return applyMigrations(database, "content", contentMigrations);
}

export function applyCanonicalRuntimeSchema(database: DatabaseBackend): Promise<void> {
  return applyMigrations(database, "runtime", runtimeMigrations);
}

async function applyMigrations(database: DatabaseBackend, namespace: string, migrations: readonly Migration[]): Promise<void> {
  await database.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (namespace VARCHAR(64) NOT NULL, version INTEGER NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(namespace, version))`);
  const applied = await database.query<{ version: number }>("SELECT version FROM schema_migrations WHERE namespace = ?", [namespace]);
  const versions = new Set(applied.rows.map((row) => Number(row.version)));
  for (const migration of migrations) {
    if (versions.has(migration.version)) continue;
    await database.transaction(async (transaction) => {
      for (const statement of migration.statements(transaction)) await transaction.execute(statement);
      await transaction.execute("INSERT INTO schema_migrations (namespace, version) VALUES (?, ?)", [namespace, migration.version]);
    });
  }
}

function identity(database: DatabaseBackend): string {
  if (database.dialect === "postgres") {
    return "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY";
  }
  if (database.dialect === "mysql") return "BIGINT AUTO_INCREMENT PRIMARY KEY";
  return "INTEGER PRIMARY KEY";
}

function createIndex(
  database: DatabaseBackend,
  name: string,
  table: string,
  columns: string,
): string {
  const conditional = database.dialect === "mysql" ? "" : " IF NOT EXISTS";
  return `CREATE INDEX${conditional} ${name} ON ${table}(${columns})`;
}
