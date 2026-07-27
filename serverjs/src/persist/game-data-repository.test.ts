import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyCanonicalContentSchema, applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { GameDataRepository } from "./game-data-repository.js";

describe("game data repository", () => {
  it("builds the same rich item payload used by offline mode", async () => {
    const content = createNodeDatabase("sqlite::memory:");
    const runtime = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(content);
    await applyCanonicalRuntimeSchema(runtime);
    await runtime.execute("INSERT INTO accounts (identity) VALUES (?)", ["guest"]);
    await runtime.execute(
      "INSERT INTO characters (account_id, name, level) VALUES (1, ?, 1)",
      ["Sol"],
    );
    await runtime.execute(
      "INSERT INTO player_inventory (character_id, bag, slot, item_id, quantity) VALUES (1, -1, 13, ?, 1)",
      [1001],
    );
    await content.execute(
      `INSERT INTO items
       (id, name, idfile, itemtype, slots, damage, delay, weight, astr, hp, haste, magic, nodrop)
       VALUES (1001, ?, 'IT42', 0, 8192, 12, 20, 35, 5, 10, 15, 1, 1)`,
      ["Test Sword"],
    );
    const repository = new GameDataRepository(content, runtime);
    const items = await repository.inventoryItems(1);
    assert.deepEqual(items, [{
      id: 1001, itemId: 1001, name: "Test Sword", slot: 13, bagSlot: -1,
      idfile: "IT42", icon: 0, material: 0, color: 0, itemtype: 0,
      slots: 8192, ac: 0, bagslots: 0, classes: 65535, races: 4294967295,
      stackable: 0, stacksize: 1, maxcharges: 0, quantity: 1, charges: 0,
      weight: 35, damage: 12, delay: 20, astr: 5, asta: 0, adex: 0,
      aagi: 0, aint: 0, awis: 0, acha: 0, hp: 10, mana: 0, dr: 0,
      mr: 0, cr: 0, fr: 0, pr: 0, haste: 15, magic: 1, nodrop: 1,
    }]);
    assert.deepEqual(await repository.characterCombat(1), {
      level: 1,
      baseStrength: 75,
      baseStamina: 75,
      baseDexterity: 75,
      baseAgility: 75,
      strength: 80,
      stamina: 75,
      dexterity: 75,
      agility: 75,
      offense: 0,
      defense: 0,
      armorClass: 0,
      maximumHp: 42,
      weaponDamage: 12,
      attackDelayMs: 2_000,
      haste: 15,
      meleeRange: 3,
    });
    await Promise.all([content.close(), runtime.close()]);
  });

  it("hydrates weighted NPC spawn content and movement paths", async () => {
    const content = createNodeDatabase("sqlite::memory:");
    const runtime = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(content);
    await applyCanonicalRuntimeSchema(runtime);
    await content.execute("INSERT INTO zones (id, short_name, name) VALUES (1, 'qeynos2', 'South Qeynos')");
    await content.execute("INSERT INTO spawn_groups (id, spawn_group_key) VALUES (10, 'guards')");
    await content.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, level, race_id, gender, movement_speed, model_key, properties_json)
       VALUES (20, 'gehnus', 'Guard_Gehnus', 10, 1, 0, 1.25, 'hum', ?)`,
      [JSON.stringify({
        size: 7,
        face: 2,
        helm: 3,
        texture: 4,
        primary: 5,
        secondary: 6,
        classId: 2,
        bodyType: 1,
      })],
    );
    await content.execute(
      "INSERT INTO spawn_group_members (spawn_group_id, npc_archetype_id, weight) VALUES (10, 20, 100)",
    );
    await content.execute(
      "INSERT INTO items (id, name) VALUES (1002, 'Guard Token'), (1003, 'Rusty Weapon')",
    );
    await content.execute(
      `INSERT INTO npc_loot_items
       (npc_archetype_id, item_id, loot_slot, chance_permille,
        minimum_quantity, maximum_quantity)
       VALUES (20, 1002, 0, 1000, 2, 2)`,
    );
    await content.execute(
      "INSERT INTO npc_loot_tables (id, loot_key) VALUES (40, 'guard-loot')",
    );
    await content.execute(
      `INSERT INTO npc_loot_assignments (npc_archetype_id, loot_table_id)
       VALUES (20, 40)`,
    );
    await content.execute(
      `INSERT INTO npc_loot_table_entries
       (loot_table_id, loot_group_id, rolls, chance_permille)
       VALUES (40, 50, 1, 1000)`,
    );
    await content.execute(
      `INSERT INTO npc_loot_group_entries
       (loot_group_id, item_id, chance_permille, rolls)
       VALUES (50, 1003, 1000, 1)`,
    );
    await content.execute(
      `INSERT INTO spawn_points
       (id, zone_id, spawn_group_id, x, y, z, heading, path_grid_id, movement_path_json)
       VALUES (30, 1, 10, 5, 6, 7, 8, 9, ?)`,
      [JSON.stringify([[5, 6, 7, 8, 0], [15, 16, 17, 18, 2]])],
    );

    const spawns = await new GameDataRepository(content, runtime).zoneNpcSpawns(1);
    assert.deepEqual(
      spawns[0]?.lootItems.map((item) => ({
        itemId: item.itemId,
        name: item.name,
        slot: item.slot,
        quantity: item.quantity,
      })),
      [
        { itemId: 1002, name: "Guard Token", slot: 0, quantity: 2 },
        { itemId: 1003, name: "Rusty Weapon", slot: 1, quantity: 1 },
      ],
    );
    assert.deepEqual(spawns, [{
      spawnId: 30, spawnPointId: 30, spawnGroupId: 10, npcArchetypeId: 20,
      name: "Guard_Gehnus", level: 10, race: 1, gender: 0, modelKey: "hum",
      movementSpeed: 1.25, size: 7, face: 2, helm: 3, equipChest: 4,
      primary: 5, secondary: 6,
      charClass: 2, bodyType: 1,
      maximumHp: 170, strength: 95, stamina: 95, dexterity: 95, agility: 95,
      offense: 50, defense: 50, armorClass: 40, weaponDamage: 5,
      attackDelayMs: 2_500, haste: 0, meleeRange: 3,
      lootItems: spawns[0]!.lootItems,
      x: 5, y: 6, z: 7, heading: 8,
      path: [
        { x: 5, y: 6, z: 7, heading: 8, pauseSeconds: 0 },
        { x: 15, y: 16, z: 17, heading: 18, pauseSeconds: 2 },
      ],
    }]);
    await Promise.all([content.close(), runtime.close()]);
  });
});
