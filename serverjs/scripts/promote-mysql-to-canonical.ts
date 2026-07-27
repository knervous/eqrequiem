import { createNodeDatabase } from "../src/db/node/factory.js";

const source = identifier(process.env.LEGACY_MYSQL_DATABASE ?? "eqgo");
const contentUrl = required("CONTENT_DATABASE_URL");
const runtimeUrl = required("RUNTIME_DATABASE_URL");
const content = createNodeDatabase(contentUrl);
const runtime = createNodeDatabase(runtimeUrl);

if (content.dialect !== "mysql" || runtime.dialect !== "mysql") {
  throw new Error("MySQL promotion requires MySQL content and runtime URLs");
}

try {
  await content.transaction(async (database) => {
    await database.execute(`
      INSERT IGNORE INTO content_releases
        (release_key, label, state, published_at, published_by, notes)
      VALUES ('legacy-bootstrap', 'Imported EQ content', 'published', CURRENT_TIMESTAMP,
        'promote-mysql-to-canonical', 'One-way source import')
    `);
    await database.execute(`
      INSERT IGNORE INTO zones (id, short_name, name, safe_x, safe_y, safe_z, enabled)
      SELECT zoneidnumber, LOWER(short_name), long_name, safe_x, safe_y, safe_z, 1
      FROM ${source}.zone
      WHERE version = 0 AND short_name IS NOT NULL AND short_name <> ''
    `);
    await database.execute(`
      INSERT IGNORE INTO items
        (id, name, idfile, icon, material, color, itemtype, slots, ac, bagslots,
         classes, races, stackable, stacksize, maxcharges, weight, damage, delay,
         astr, asta, adex, aagi, aint, awis, acha, hp, mana, dr, mr, cr, fr, pr,
         haste, magic, nodrop, base_price, sell_rate_permille)
      SELECT id, Name, idfile, icon, material, color, itemtype, slots, ac, bagslots,
        classes, races, stackable, stacksize, maxcharges, weight, damage, delay,
        astr, asta, adex, aagi, aint, awis, acha, hp, mana, dr, mr, cr, fr, pr,
        haste, magic, nodrop, Price, GREATEST(0, ROUND(sellrate * 1000))
      FROM ${source}.items
    `);
    await database.execute(`
      INSERT INTO merchant_catalogs (id, merchant_key, label)
      SELECT DISTINCT merchant_id, CONCAT('merchant:', merchant_id), ''
      FROM ${source}.npc_types WHERE merchant_id > 0
      ON DUPLICATE KEY UPDATE merchant_key = VALUES(merchant_key)
    `);
    await database.execute(`
      INSERT INTO npc_merchant_assignments
        (npc_archetype_id, catalog_id, keeps_sold_items, greed,
         sell_to_player_permille, buy_from_player_permille,
         interaction_range, pricing_policy_json)
      SELECT npc.id, npc.merchant_id, npc.keeps_sold_items, npc.greed,
        1000 + GREATEST(0, npc.greed) * 10, 950, 20,
        JSON_OBJECT('source', 'eqemu', 'legacyGreed', npc.greed)
      FROM ${source}.npc_types npc
      JOIN npc_archetypes archetype ON archetype.id = npc.id
      JOIN merchant_catalogs catalog ON catalog.id = npc.merchant_id
      WHERE npc.merchant_id > 0
      ON DUPLICATE KEY UPDATE catalog_id = VALUES(catalog_id),
        keeps_sold_items = VALUES(keeps_sold_items), greed = VALUES(greed),
        sell_to_player_permille = VALUES(sell_to_player_permille),
        buy_from_player_permille = VALUES(buy_from_player_permille),
        interaction_range = VALUES(interaction_range),
        pricing_policy_json = VALUES(pricing_policy_json)
    `);
    await database.execute(`
      INSERT INTO merchant_catalog_entries
        (catalog_id, merchant_slot, item_id, level_required,
         classes_required, probability_permille)
      SELECT list.merchantid, list.slot, list.item,
        GREATEST(0, list.level_required), list.classes_required,
        LEAST(1000, GREATEST(0, ROUND(list.probability * 10)))
      FROM ${source}.merchantlist list
      JOIN merchant_catalogs catalog ON catalog.id = list.merchantid
      JOIN items item ON item.id = list.item
      ON DUPLICATE KEY UPDATE item_id = VALUES(item_id),
        level_required = VALUES(level_required),
        classes_required = VALUES(classes_required),
        probability_permille = VALUES(probability_permille)
    `);
    await database.execute(`
      INSERT IGNORE INTO npc_archetypes
        (id, npc_key, name, level, race_id, gender, movement_speed, model_key,
         behavior_key, properties_json)
      SELECT id, CONCAT('npc:', id), name, level, race, gender, runspeed,
        CONCAT('race:', race), IF(isquest <> 0, 'quest', 'default'),
        JSON_OBJECT('hp', hp, 'mana', mana, 'minDamage', mindmg,
          'maxDamage', maxdmg, 'factionId', npc_faction_id, 'size', size,
          'face', face, 'helm', helmtexture, 'texture', texture,
          'bodyType', bodytype, 'classId', class,
          'aggroRadius', aggroradius, 'alwaysAggro', always_aggro)
      FROM ${source}.npc_types
      ON DUPLICATE KEY UPDATE name = VALUES(name), level = VALUES(level),
        race_id = VALUES(race_id), gender = VALUES(gender),
        movement_speed = VALUES(movement_speed), model_key = VALUES(model_key),
        behavior_key = VALUES(behavior_key), properties_json = VALUES(properties_json)
    `);
    await database.execute(`
      INSERT INTO npc_loot_tables
        (id, loot_key, minimum_currency, maximum_currency, average_currency)
      SELECT id, CONCAT('loot-table:', id), mincash, maxcash, avgcoin
      FROM ${source}.loottable
      ON DUPLICATE KEY UPDATE
        minimum_currency = VALUES(minimum_currency),
        maximum_currency = VALUES(maximum_currency),
        average_currency = VALUES(average_currency)
    `);
    await database.execute(`
      INSERT INTO npc_loot_assignments (npc_archetype_id, loot_table_id)
      SELECT npc.id, npc.loottable_id
      FROM ${source}.npc_types npc
      JOIN npc_archetypes archetype ON archetype.id = npc.id
      JOIN npc_loot_tables loot_table ON loot_table.id = npc.loottable_id
      WHERE npc.loottable_id > 0
      ON DUPLICATE KEY UPDATE loot_table_id = VALUES(loot_table_id)
    `);
    await database.execute(`
      INSERT INTO npc_loot_table_entries
        (loot_table_id, loot_group_id, rolls, chance_permille,
         drop_limit, minimum_drops)
      SELECT entry.loottable_id, entry.lootdrop_id,
        GREATEST(0, entry.multiplier),
        LEAST(1000, GREATEST(0, ROUND(entry.probability * 10))),
        GREATEST(0, entry.droplimit), GREATEST(0, entry.mindrop)
      FROM ${source}.loottable_entries entry
      JOIN npc_loot_tables loot_table ON loot_table.id = entry.loottable_id
      ON DUPLICATE KEY UPDATE rolls = VALUES(rolls),
        chance_permille = VALUES(chance_permille),
        drop_limit = VALUES(drop_limit),
        minimum_drops = VALUES(minimum_drops)
    `);
    await database.execute(`
      INSERT INTO npc_loot_group_entries
        (loot_group_id, item_id, chance_permille, rolls,
         minimum_quantity, maximum_quantity,
         npc_minimum_level, npc_maximum_level)
      SELECT entry.lootdrop_id, entry.item_id,
        LEAST(1000, GREATEST(0, ROUND(entry.chance * 10))),
        GREATEST(1, entry.multiplier), 1, 1,
        GREATEST(0, entry.npc_min_level), GREATEST(0, entry.npc_max_level)
      FROM ${source}.lootdrop_entries entry
      JOIN items item ON item.id = entry.item_id
      ON DUPLICATE KEY UPDATE chance_permille = VALUES(chance_permille),
        rolls = VALUES(rolls),
        npc_minimum_level = VALUES(npc_minimum_level),
        npc_maximum_level = VALUES(npc_maximum_level)
    `);
    await database.execute(`
      INSERT IGNORE INTO spawn_groups (id, spawn_group_key, respawn_seconds, enabled)
      SELECT id, IF(name = '', CONCAT('spawn-group:', id), name),
        IF(delay > 0, delay, 360), 1 FROM ${source}.spawngroup
    `);
    await database.execute(`
      INSERT IGNORE INTO spawn_group_members (spawn_group_id, npc_archetype_id, weight)
      SELECT entry.spawngroupID, entry.npcID, IF(entry.chance > 0, entry.chance, 1)
      FROM ${source}.spawnentry entry
      JOIN spawn_groups spawn_group ON spawn_group.id = entry.spawngroupID
      JOIN npc_archetypes npc ON npc.id = entry.npcID
    `);
    await database.execute(`
      INSERT IGNORE INTO spawn_points
        (id, zone_id, spawn_group_id, x, y, z, heading, enabled,
         path_grid_id, movement_path_json)
      SELECT spawn.id, zone.id, spawn.spawngroupID, spawn.x, spawn.y, spawn.z,
        spawn.heading, 1, NULLIF(spawn.pathgrid, 0), path.points
      FROM ${source}.spawn2 spawn
      JOIN zones zone ON BINARY zone.short_name = BINARY LOWER(spawn.zone)
      JOIN spawn_groups spawn_group ON spawn_group.id = spawn.spawngroupID
      LEFT JOIN ${source}.grid_paths path
        ON path.zoneid = zone.id AND path.gridid = spawn.pathgrid
      ON DUPLICATE KEY UPDATE zone_id = VALUES(zone_id),
        spawn_group_id = VALUES(spawn_group_id), x = VALUES(x), y = VALUES(y),
        z = VALUES(z), heading = VALUES(heading), enabled = VALUES(enabled),
        path_grid_id = VALUES(path_grid_id),
        movement_path_json = VALUES(movement_path_json)
    `);
    await database.execute(`
      INSERT INTO character_origins
        (id, race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z,
         heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading, priority)
      SELECT libra_id, player_race, player_class, player_deity, start_zone,
        zone_id, x, y, z, heading, IF(bind_id <> 0, bind_id, zone_id),
        IF(bind_id <> 0 AND bind_x <> 0, bind_x, x),
        IF(bind_id <> 0 AND bind_y <> 0, bind_y, y),
        IF(bind_id <> 0 AND bind_z <> 0, bind_z, z), heading, select_rank
      FROM ${source}.start_zones
      WHERE min_expansion <= 0 AND (max_expansion < 0 OR max_expansion >= 0)
      ON DUPLICATE KEY UPDATE zone_id = VALUES(zone_id), x = VALUES(x),
        y = VALUES(y), z = VALUES(z), heading = VALUES(heading),
        bind_zone_id = VALUES(bind_zone_id), bind_x = VALUES(bind_x),
        bind_y = VALUES(bind_y), bind_z = VALUES(bind_z),
        bind_heading = VALUES(bind_heading), priority = VALUES(priority)
    `);
    await database.execute(`
      INSERT INTO character_starting_items (id, item_id, quantity, inventory_slot, criteria_json)
      SELECT starting.id, starting.item_id,
        IF(starting.item_charges > 0, starting.item_charges, 1),
        NULLIF(starting.inventory_slot, -1),
        JSON_OBJECT('classes', IF(COALESCE(starting.class_list, '0') = '0', JSON_ARRAY(), CAST(CONCAT('["', REPLACE(starting.class_list, '|', '","'), '"]') AS JSON)),
          'races', IF(COALESCE(starting.race_list, '0') = '0', JSON_ARRAY(), CAST(CONCAT('["', REPLACE(starting.race_list, '|', '","'), '"]') AS JSON)),
          'deities', IF(COALESCE(starting.deity_list, '0') = '0', JSON_ARRAY(), CAST(CONCAT('["', REPLACE(starting.deity_list, '|', '","'), '"]') AS JSON)),
          'zones', IF(COALESCE(starting.zone_id_list, '0') = '0', JSON_ARRAY(), CAST(CONCAT('["', REPLACE(starting.zone_id_list, '|', '","'), '"]') AS JSON)))
      FROM ${source}.starting_items starting JOIN items item ON item.id = starting.item_id
      ON DUPLICATE KEY UPDATE item_id = VALUES(item_id), quantity = VALUES(quantity),
        inventory_slot = VALUES(inventory_slot), criteria_json = VALUES(criteria_json)
    `);
    await database.execute(`
      INSERT INTO class_skill_caps (class_id, skill_id, level, cap)
      SELECT class_id, skill_id, level, cap FROM ${source}.skill_caps
      ON DUPLICATE KEY UPDATE cap = VALUES(cap)
    `);
  });

  await runtime.transaction(async (database) => {
    await database.execute(`
      INSERT IGNORE INTO accounts (id, identity, status)
      SELECT id, IF(discord_id <> '', discord_id, name),
        IF(status < 0 OR revoked <> 0, 'disabled', 'active')
      FROM ${source}.account
    `);
    await database.execute(`
      INSERT IGNORE INTO characters
        (id, account_id, name, level, class_id, race_id, gender, deity_id, face,
         last_login_at)
      SELECT character_data.id, character_data.account_id, character_data.name,
        character_data.level, character_data.class, character_data.race,
        character_data.gender, character_data.deity, character_data.face,
        FROM_UNIXTIME(NULLIF(character_data.last_login, 0) / 1000)
      FROM ${source}.character_data character_data
      JOIN accounts account ON account.id = character_data.account_id
      WHERE character_data.deleted_at IS NULL
    `);
    await database.execute(`
      INSERT IGNORE INTO character_positions
        (character_id, zone_id, instance_id, x, y, z, heading)
      SELECT character_data.id, character_data.zone_id, character_data.zone_instance,
        character_data.x, character_data.y, character_data.z, character_data.heading
      FROM ${source}.character_data character_data
      JOIN characters player_character ON player_character.id = character_data.id
      WHERE character_data.deleted_at IS NULL
    `);
    await database.execute(`
      INSERT IGNORE INTO player_inventory
        (character_id, bag, slot, item_id, quantity, charges, custom_data_json)
      SELECT inventory.character_id, COALESCE(inventory.bag, -1), inventory.slot,
        instance.item_id, IF(instance.quantity > 0, instance.quantity, 1),
        COALESCE(instance.charges, 0), instance.mods
      FROM ${source}.character_inventory inventory
      JOIN ${source}.item_instances instance ON instance.id = inventory.item_instance_id
      JOIN characters player_character ON player_character.id = inventory.character_id
      WHERE inventory.slot IS NOT NULL
    `);
    await database.execute(`
      INSERT INTO character_currency (character_id, carried_copper, banked_copper)
      SELECT currency.id,
        currency.platinum * 1000 + currency.gold * 100
          + currency.silver * 10 + currency.copper,
        currency.platinum_bank * 1000 + currency.gold_bank * 100
          + currency.silver_bank * 10 + currency.copper_bank
      FROM ${source}.character_currency currency
      JOIN characters player_character ON player_character.id = currency.id
      ON DUPLICATE KEY UPDATE carried_copper = VALUES(carried_copper),
        banked_copper = VALUES(banked_copper)
    `);
  });

  const counts = {
    items: await count(content, "items"),
    zones: await count(content, "zones"),
    npcs: await count(content, "npc_archetypes"),
    spawns: await count(content, "spawn_points"),
    accounts: await count(runtime, "accounts"),
    characters: await count(runtime, "characters"),
    inventory: await count(runtime, "player_inventory"),
  };
  console.log(JSON.stringify(counts, null, 2));
} finally {
  await Promise.all([content.close(), runtime.close()]);
}

async function count(database: ReturnType<typeof createNodeDatabase>, table: string): Promise<number> {
  const result = await database.query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function identifier(value: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`Invalid database name: ${value}`);
  return value;
}
