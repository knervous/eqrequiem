import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNodeDatabase } from "../db/node/factory.js";
import { GameRepository } from "./repository.js";
import { ARRIVAL } from "../content/eltania.js";
import { applyCanonicalContentSchema } from "../db/canonical-schema.js";

const character = (name: string, overrides: Partial<ReturnType<typeof baseCharacter>> = {}) => ({
  ...baseCharacter(name), ...overrides,
});
const baseCharacter = (name: string) => ({
  name, charClass: 1, race: 1, gender: 0, deity: 207, startZone: 2, face: 0,
  str: 85, sta: 110, agi: 80, dex: 75, wis: 75, intel: 75, cha: 75,
});

describe("game repository", () => {
  it("supports guest accounts and character lifecycle on SQLite", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    const repository = new GameRepository(database);
    await repository.initialize();
    await applyCanonicalContentSchema(database);
    // A legacy origin pointing at a city the demo does not ship. It must be ignored:
    // the character lands at the canonical Talios arrival instead of in a zone with no
    // world package.
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
        deity: 204, face: 0, zoneId: ARRIVAL.zone.id, zoneInstance: 0, lastLogin: 0, items: [],
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
    await database.execute(`INSERT INTO zones (id, short_name, name) VALUES (1, 'talioslowharbor', 'Talios Lowharbor')`);
    await database.execute(`INSERT INTO character_origins
      (race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z, bind_zone_id, bind_x, bind_y, bind_z)
      VALUES (1, 1, 207, 1, 1, -57, 31.75, -510, 1, -57, 31.75, -510)`);
    await database.execute(
      "INSERT INTO items (id, name, bagslots) VALUES (1001, 'Pack', 8), (2001, 'Ration', 0)",
    );
    const accountId = await repository.getOrCreateAccount("inventory-test");
    assert.equal(await repository.createCharacter(accountId, character("Carrier")), true);
    await database.execute(
      `INSERT INTO player_inventory
       (character_id, bag, slot, item_id, quantity, charges)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, -1, 2, 1001, 4, 3],
    );
    const firstMove = await repository.moveItem({
      characterId: 1,
      fromBag: -1,
      fromSlot: 2,
      toBag: 0,
      toSlot: 22,
    });
    assert.deepEqual(firstMove, [
      { fromSlot: 2, toSlot: 22, fromBag: -1, toBag: 0 },
    ]);
    const moved = await database.query(
      `SELECT bag, slot, item_id, quantity, charges
       FROM player_inventory WHERE character_id = 1`,
    );
    assert.deepEqual(moved.rows, [{
      bag: 0,
      slot: 22,
      item_id: 1001,
      quantity: 4,
      charges: 3,
    }]);

    await database.execute(
      `INSERT INTO player_inventory
       (character_id, bag, slot, item_id, quantity, charges)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [1, 1, 22, 2001, 2, 0],
    );
    const containerMove = await repository.moveItem({
      characterId: 1,
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
        `SELECT bag, slot, item_id, quantity, charges
         FROM player_inventory ORDER BY bag`,
      )).rows,
      [
        { bag: 0, slot: 23, item_id: 1001, quantity: 4, charges: 3 },
        { bag: 1, slot: 23, item_id: 2001, quantity: 2, charges: 0 },
      ],
    );
    await repository.deleteItem({ characterId: 1, bag: 0, slot: 23 });
    assert.deepEqual(
      (await database.query("SELECT bag, slot, item_id FROM player_inventory")).rows,
      [{ bag: 1, slot: 23, item_id: 2001 }],
    );
    await database.execute(
      `INSERT INTO items (id, name, slots, classes, races)
       VALUES (3001, 'Other Class Blade', ?, 2, 4294967295)`,
      [1 << 13],
    );
    await database.execute(
      `INSERT INTO player_inventory (character_id, bag, slot, item_id)
       VALUES (1, 0, 22, 3001)`,
    );
    await assert.rejects(
      repository.moveItem({
        characterId: 1,
        fromBag: 0,
        fromSlot: 22,
        toBag: -1,
        toSlot: 13,
      }),
      /class or race/,
    );
    assert.deepEqual(
      (await database.query(
        "SELECT bag, slot FROM player_inventory WHERE item_id = 3001",
      )).rows,
      [{ bag: 0, slot: 22 }],
    );
    await database.close();
  });

  it("persists stable Eltania composition IDs alongside the legacy projection", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    const repository = new GameRepository(database);
    await repository.initialize();
    await applyCanonicalContentSchema(database);
    await database.execute(
      "INSERT INTO zones (id, short_name, name) VALUES (2, 'test-world', 'Test World')",
    );
    await database.execute(`INSERT INTO character_origins
      (race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z,
       bind_zone_id, bind_x, bind_y, bind_z)
      VALUES (1, 1, 207, 2, 2, 0, 0, 0, 2, 0, 0, 0)`);
    const accountId = await repository.getOrCreateAccount("eltania-contract-test");
    const original = {
      ...character("Aelric"),
      appearanceSchemaVersion: 1,
      bodyFamilyId           : "body-family:eltania-wayfarer-v1",
      bodyComponentId        : "body:eltania-wayfarer-a-v1",
      faceComponentId        : "face:eltania-wayfarer-01",
      presentationId         : "presentation:eltania-a",
      callingId              : "calling:eltania-vanguard-v1",
      originId               : "origin:elrador-test-world-v1",
    };
    assert.equal(await repository.createCharacter(accountId, original), true);
    assert.deepEqual(await repository.listCharacters(accountId), [{
      id: 1,
      name: "Aelric",
      level: 1,
      class: 1,
      race: 1,
      gender: 0,
      deity: 207,
      face: 0,
      zoneId: ARRIVAL.zone.id,
      zoneInstance: 0,
      lastLogin: 0,
      items: [],
      appearanceSchemaVersion: 1,
      bodyFamilyId           : "body-family:eltania-wayfarer-v1",
      bodyComponentId        : "body:eltania-wayfarer-a-v1",
      faceComponentId        : "face:eltania-wayfarer-01",
      presentationId         : "presentation:eltania-a",
      callingId              : "calling:eltania-vanguard-v1",
      originId               : "origin:elrador-test-world-v1",
    }]);
    await database.close();
  });

  it("rolls back the entire character when starting progression fails", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    const repository = new GameRepository(database);
    await repository.initialize();
    await applyCanonicalContentSchema(database);
    const accountId = await repository.getOrCreateAccount("rollback-test");
    await database.execute(`
      CREATE TRIGGER reject_starting_technique
      BEFORE INSERT ON character_abilities
      BEGIN
        SELECT RAISE(ABORT, 'injected starting technique failure');
      END
    `);

    await assert.rejects(
      repository.createCharacter(accountId, character("Rollback")),
      /injected starting technique failure/,
    );
    assert.equal(
      Number((await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM characters",
      )).rows[0]?.count),
      0,
    );
    assert.equal(
      Number((await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM character_positions",
      )).rows[0]?.count),
      0,
    );
    await database.close();
  });
});
