import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNodeDatabase } from "../db/node/factory.js";
import { GameRepository } from "./repository.js";
import { applyCanonicalContentSchema } from "../db/canonical-schema.js";

const character = (name: string, overrides: Partial<ReturnType<typeof baseCharacter>> = {}) => ({
  ...baseCharacter(name), ...overrides,
});
const baseCharacter = (name: string) => ({
  name, charClass: 1, race: 1, gender: 0, deity: 207, startZone: 1, face: 0,
  str: 85, sta: 110, agi: 80, dex: 75, wis: 75, intel: 75, cha: 75,
});

describe("game repository", () => {
  it("supports guest accounts and character lifecycle on SQLite", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    const repository = new GameRepository(database);
    await repository.initialize();
    await applyCanonicalContentSchema(database);
    await database.execute(`INSERT INTO zones (id, short_name, name) VALUES (9, 'freportw', 'West Freeport')`);
    await database.execute(`INSERT INTO character_origins
      (race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z, bind_zone_id, bind_x, bind_y, bind_z)
      VALUES (1, 1, 204, 9, 9, 309, -10.25, -42, 9, 309, -10.25, -42)`);
    await database.execute("INSERT INTO class_skill_caps (class_id, skill_id, level, cap) VALUES (1, 0, 1, 10)");
    const accountId = await repository.getOrCreateAccount("guest");
    assert.equal(await repository.getOrCreateAccount("guest"), accountId);
    assert.equal(await repository.createCharacter(accountId, character("Solara", { deity: 204, startZone: 9 })), true);
    assert.equal(await repository.createCharacter(accountId, character("Solara", { deity: 204, startZone: 9 })), false);
    assert.deepEqual(await repository.listCharacters(accountId), [
      {
        id: 1, name: "Solara", level: 1, class: 1, race: 1, gender: 0,
        deity: 204, face: 0, zoneId: 9, zoneInstance: 0, lastLogin: 0, items: [],
      },
    ]);
    assert.deepEqual((await database.query(
      "SELECT skill_id, value FROM character_skills WHERE character_id = 1 ORDER BY skill_id",
    )).rows, [{ skill_id: 0, value: 10 }, { skill_id: 27, value: 50 }, { skill_id: 55, value: 50 }]);
    assert.equal(await repository.deleteCharacter(accountId, "Solara"), true);
    assert.deepEqual(await repository.listCharacters(accountId), []);
    await database.close();
  });

  it("supports inventory move and deletion use cases", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    const repository = new GameRepository(database);
    await repository.initialize();
    await applyCanonicalContentSchema(database);
    await database.execute(`INSERT INTO zones (id, short_name, name) VALUES (1, 'qeynos', 'South Qeynos')`);
    await database.execute(`INSERT INTO character_origins
      (race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z, bind_zone_id, bind_x, bind_y, bind_z)
      VALUES (1, 1, 207, 1, 1, -57, 31.75, -510, 1, -57, 31.75, -510)`);
    const accountId = await repository.getOrCreateAccount("inventory-test");
    assert.equal(await repository.createCharacter(accountId, character("Carrier")), true);
    await database.execute(
      "INSERT INTO player_inventory (character_id, bag, slot, item_id) VALUES (?, ?, ?, ?)",
      [1, -1, 2, 1001],
    );
    const firstMove = await repository.moveItem({
      sessionId: 1,
      fromBag: -1,
      fromSlot: 2,
      toBag: 0,
      toSlot: 22,
    });
    assert.deepEqual(firstMove, [
      { fromSlot: 2, toSlot: 22, fromBag: -1, toBag: 0 },
    ]);
    const moved = await database.query(
      "SELECT bag, slot, item_id FROM player_inventory WHERE character_id = 1",
    );
    assert.deepEqual(moved.rows, [{ bag: 0, slot: 22, item_id: 1001 }]);

    await database.execute(
      "INSERT INTO player_inventory (character_id, bag, slot, item_id) VALUES (?, ?, ?, ?)",
      [1, 1, 22, 2001],
    );
    const containerMove = await repository.moveItem({
      sessionId: 1,
      fromBag: 0,
      fromSlot: 22,
      toBag: 0,
      toSlot: 23,
    });
    assert.deepEqual(containerMove, [
      { fromSlot: 22, toSlot: 23, fromBag: 0, toBag: 0 },
      { fromSlot: 22, toSlot: 23, fromBag: 1, toBag: 1 },
    ]);
    assert.deepEqual(
      (await database.query(
        "SELECT bag, slot, item_id FROM player_inventory ORDER BY bag",
      )).rows,
      [
        { bag: 0, slot: 23, item_id: 1001 },
        { bag: 1, slot: 23, item_id: 2001 },
      ],
    );
    await repository.deleteItem({ sessionId: 1, bag: 0, slot: 23 });
    assert.deepEqual(
      (await database.query("SELECT bag, slot, item_id FROM player_inventory")).rows,
      [{ bag: 1, slot: 23, item_id: 2001 }],
    );
    await database.close();
  });
});
