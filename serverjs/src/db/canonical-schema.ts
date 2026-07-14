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
