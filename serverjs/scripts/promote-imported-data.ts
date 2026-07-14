import { resolve } from "node:path";

import BetterSqlite3, { type Database } from "better-sqlite3";

const content = new BetterSqlite3(resolve(process.env.CANONICAL_CONTENT_PATH ?? "data/content-db.sqlite"));
const runtime = new BetterSqlite3(resolve(process.env.CANONICAL_RUNTIME_PATH ?? "data/runtime-db.sqlite"));
content.prepare("ATTACH DATABASE ? AS legacy").run(resolve(process.env.SQLITE_CONTENT_PATH ?? "data/game_content.sqlite"));
runtime.prepare("ATTACH DATABASE ? AS legacy").run(resolve(process.env.SQLITE_RUNTIME_PATH ?? "data/game_runtime.sqlite"));

try {
  promoteContent(content);
  promoteRuntime(runtime);
} finally {
  content.close();
  runtime.close();
}

function promoteContent(database: Database): void {
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    database.exec(`
      INSERT OR IGNORE INTO content_releases (release_key, label, state, published_at, published_by, notes)
      VALUES ('mysql-bootstrap', 'Imported EQ content', 'published', CURRENT_TIMESTAMP, 'hydrate-script', 'Initial forward-schema seed')
    `);
    database.exec(`
      INSERT OR IGNORE INTO zones (id, short_name, name, safe_x, safe_y, safe_z, enabled)
      SELECT zoneidnumber, lower(short_name), long_name, safe_x, safe_y, safe_z, 1
      FROM legacy.zone WHERE version = 0 AND short_name IS NOT NULL AND short_name <> ''
    `);
    database.exec(`
      INSERT OR IGNORE INTO npc_archetypes
        (id, npc_key, name, level, race_id, gender, movement_speed, model_key, behavior_key, properties_json)
      SELECT id, 'npc:' || id, name, level, race, gender, runspeed, 'race:' || race,
        CASE WHEN isquest <> 0 THEN 'quest' ELSE 'default' END,
        json_object('hp', hp, 'mana', mana, 'minDamage', mindmg,
          'maxDamage', maxdmg, 'factionId', npc_faction_id, 'size', size,
          'face', face, 'helm', helmtexture, 'texture', texture,
          'bodyType', bodytype, 'classId', class)
      FROM legacy.npc_types
      WHERE 1
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, level = excluded.level,
        race_id = excluded.race_id, gender = excluded.gender,
        movement_speed = excluded.movement_speed, model_key = excluded.model_key,
        behavior_key = excluded.behavior_key,
        properties_json = excluded.properties_json
    `);
    database.exec(`
      INSERT OR IGNORE INTO spawn_groups (id, spawn_group_key, respawn_seconds, enabled)
      SELECT id, CASE WHEN name = '' THEN 'spawn-group:' || id ELSE name END,
        CASE WHEN delay > 0 THEN delay ELSE 360 END, 1
      FROM legacy.spawngroup
    `);
    database.exec(`
      INSERT OR IGNORE INTO spawn_group_members (spawn_group_id, npc_archetype_id, weight)
      SELECT spawngroupID, npcID, CASE WHEN chance > 0 THEN chance ELSE 1 END
      FROM legacy.spawnentry
      WHERE EXISTS (SELECT 1 FROM spawn_groups g WHERE g.id = spawnentry.spawngroupID)
        AND EXISTS (SELECT 1 FROM npc_archetypes n WHERE n.id = spawnentry.npcID)
    `);
    database.exec(`
      INSERT OR IGNORE INTO spawn_points
        (id, zone_id, spawn_group_id, x, y, z, heading, enabled,
         path_grid_id, movement_path_json)
      SELECT s.id, z.id, s.spawngroupID, s.x, s.y, s.z, s.heading, 1,
        NULLIF(s.pathgrid, 0), path.points
      FROM legacy.spawn2 s JOIN zones z ON z.short_name = lower(s.zone)
      LEFT JOIN legacy.grid_paths path ON path.zoneid = z.id AND path.gridid = s.pathgrid
      WHERE EXISTS (SELECT 1 FROM spawn_groups g WHERE g.id = s.spawngroupID)
      ON CONFLICT(id) DO UPDATE SET zone_id = excluded.zone_id,
        spawn_group_id = excluded.spawn_group_id, x = excluded.x, y = excluded.y,
        z = excluded.z, heading = excluded.heading, enabled = excluded.enabled,
        path_grid_id = excluded.path_grid_id,
        movement_path_json = excluded.movement_path_json
    `);
    database.exec(`
      INSERT INTO character_origins
        (id, race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z,
         heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading, priority)
      SELECT libra_id, player_race, player_class, player_deity, start_zone,
        zone_id, x, y, z, heading,
        CASE WHEN bind_id <> 0 THEN bind_id ELSE zone_id END,
        CASE WHEN bind_id <> 0 AND bind_x <> 0 THEN bind_x ELSE x END,
        CASE WHEN bind_id <> 0 AND bind_y <> 0 THEN bind_y ELSE y END,
        CASE WHEN bind_id <> 0 AND bind_z <> 0 THEN bind_z ELSE z END,
        heading, select_rank
      FROM legacy.start_zones
      WHERE min_expansion <= 0 AND (max_expansion < 0 OR max_expansion >= 0)
      ON CONFLICT(race_id, class_id, deity_id, start_zone_id) DO UPDATE SET
        zone_id = excluded.zone_id, x = excluded.x, y = excluded.y,
        z = excluded.z, heading = excluded.heading,
        bind_zone_id = excluded.bind_zone_id, bind_x = excluded.bind_x,
        bind_y = excluded.bind_y, bind_z = excluded.bind_z,
        bind_heading = excluded.bind_heading, priority = excluded.priority
    `);
    database.exec(`
      INSERT INTO character_starting_items (id, item_id, quantity, inventory_slot, criteria_json)
      SELECT id, item_id, CASE WHEN item_charges > 0 THEN item_charges ELSE 1 END,
        NULLIF(inventory_slot, -1),
        json_object(
          'classes', CASE WHEN coalesce(class_list, '0') = '0' THEN json('[]') ELSE json('["' || replace(class_list, '|', '","') || '"]') END,
          'races', CASE WHEN coalesce(race_list, '0') = '0' THEN json('[]') ELSE json('["' || replace(race_list, '|', '","') || '"]') END,
          'deities', CASE WHEN coalesce(deity_list, '0') = '0' THEN json('[]') ELSE json('["' || replace(deity_list, '|', '","') || '"]') END,
          'zones', CASE WHEN coalesce(zone_id_list, '0') = '0' THEN json('[]') ELSE json('["' || replace(zone_id_list, '|', '","') || '"]') END)
      FROM legacy.starting_items imported
      WHERE EXISTS (SELECT 1 FROM items item WHERE item.id = imported.item_id)
      ON CONFLICT(id) DO UPDATE SET item_id = excluded.item_id,
        quantity = excluded.quantity, inventory_slot = excluded.inventory_slot,
        criteria_json = excluded.criteria_json
    `);
    database.exec(`
      INSERT INTO class_skill_caps (class_id, skill_id, level, cap)
      SELECT class_id, skill_id, level, cap FROM legacy.skill_caps
      WHERE 1
      ON CONFLICT(class_id, skill_id, level) DO UPDATE SET cap = excluded.cap
    `);
  })();
  console.log("Promoted content:", counts(database, ["zones", "npc_archetypes", "spawn_groups", "spawn_group_members", "spawn_points", "character_origins", "character_starting_items", "class_skill_caps"]));
}

function promoteRuntime(database: Database): void {
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    database.exec(`
      INSERT OR IGNORE INTO accounts (id, identity, status)
      SELECT id, CASE WHEN discord_id <> '' THEN discord_id ELSE name END,
        CASE WHEN status < 0 OR revoked <> 0 THEN 'disabled' ELSE 'active' END
      FROM legacy.account
    `);
    database.exec(`
      INSERT OR IGNORE INTO characters
        (id, account_id, name, level, class_id, race_id, gender, deity_id, face, last_login_at)
      SELECT id, account_id, name, level, class, race, gender, deity, face,
        CASE WHEN last_login > 0 THEN datetime(last_login / 1000, 'unixepoch') END
      FROM legacy.character_data imported
      WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM accounts a WHERE a.id = imported.account_id)
    `);
    database.exec(`
      INSERT OR IGNORE INTO character_positions
        (character_id, zone_id, instance_id, x, y, z, heading)
      SELECT id, zone_id, zone_instance, x, y, z, heading
      FROM legacy.character_data imported WHERE deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM characters c WHERE c.id = imported.id)
    `);
    database.exec(`
      INSERT OR IGNORE INTO player_inventory
        (character_id, bag, slot, item_id, quantity, charges)
      SELECT ci.character_id, COALESCE(ci.bag, -1), ci.slot,
        ii.item_id, CASE WHEN ii.quantity > 0 THEN ii.quantity ELSE 1 END,
        COALESCE(ii.charges, 0)
      FROM legacy.character_inventory ci JOIN legacy.item_instances ii ON ii.id = ci.item_instance_id
      WHERE ci.slot IS NOT NULL
        AND EXISTS (SELECT 1 FROM characters c WHERE c.id = ci.character_id)
    `);
  })();
  console.log("Promoted runtime:", counts(database, ["accounts", "characters", "character_positions", "player_inventory"]));
}

function counts(database: Database, tables: string[]): Record<string, number> {
  return Object.fromEntries(tables.map((table) => [
    table,
    Number((database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count),
  ]));
}
