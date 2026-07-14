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
    const items = await new GameDataRepository(content, runtime).inventoryItems(1);
    assert.deepEqual(items, [{
      id: 1001, itemId: 1001, name: "Test Sword", slot: 13, bagSlot: -1,
      idfile: "IT42", icon: 0, material: 0, color: 0, itemtype: 0,
      slots: 8192, ac: 0, bagslots: 0, classes: 65535, races: 4294967295,
      stackable: 0, stacksize: 1, maxcharges: 0, quantity: 1, charges: 0,
      weight: 35, damage: 12, delay: 20, astr: 5, asta: 0, adex: 0,
      aagi: 0, aint: 0, awis: 0, acha: 0, hp: 10, mana: 0, dr: 0,
      mr: 0, cr: 0, fr: 0, pr: 0, haste: 15, magic: 1, nodrop: 1,
    }]);
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
      [JSON.stringify({ size: 7, face: 2, helm: 3, texture: 4, classId: 2, bodyType: 1 })],
    );
    await content.execute(
      "INSERT INTO spawn_group_members (spawn_group_id, npc_archetype_id, weight) VALUES (10, 20, 100)",
    );
    await content.execute(
      `INSERT INTO spawn_points
       (id, zone_id, spawn_group_id, x, y, z, heading, path_grid_id, movement_path_json)
       VALUES (30, 1, 10, 5, 6, 7, 8, 9, ?)`,
      [JSON.stringify([[5, 6, 7, 8, 0], [15, 16, 17, 18, 2]])],
    );

    const spawns = await new GameDataRepository(content, runtime).zoneNpcSpawns(1);
    assert.deepEqual(spawns, [{
      spawnId: 30, spawnPointId: 30, spawnGroupId: 10, npcArchetypeId: 20,
      name: "Guard_Gehnus", level: 10, race: 1, gender: 0, modelKey: "hum",
      movementSpeed: 1.25, size: 7, face: 2, helm: 3, equipChest: 4,
      charClass: 2, bodyType: 1,
      x: 5, y: 6, z: 7, heading: 8,
      path: [
        { x: 5, y: 6, z: 7, heading: 8, pauseSeconds: 0 },
        { x: 15, y: 16, z: 17, heading: 18, pauseSeconds: 2 },
      ],
    }]);
    await Promise.all([content.close(), runtime.close()]);
  });
});
