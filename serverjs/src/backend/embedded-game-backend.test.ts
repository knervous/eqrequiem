import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import { SqliteBackend } from "../db/node/sqlite-backend.js";
import { applyCanonicalContentSchema } from "../db/canonical-schema.js";
import type { BackendItemTemplate } from "./contracts.js";
import { EmbeddedGameBackend } from "./embedded-game-backend.js";
import { BUILTIN_QUESTS } from "../zone/builtin-quests.js";

const sword: BackendItemTemplate = {
  id: 5013,
  name: "Rusty Short Sword",
  idfile: "IT10653",
  icon: 580,
  material: 0,
  color: 0xff000000,
  itemtype: 0,
  slots: 24576,
  ac: 0,
  bagslots: 0,
  classes: 65535,
  races: 65535,
  stackable: 0,
  stacksize: 1,
  maxcharges: 0,
};

describe("embedded game backend", () => {
  it("runs the same character, zone, command, and inventory API on SQLite", async () => {
    const backend = new EmbeddedGameBackend(new SqliteBackend(), {
      items: [sword],
      gearSets: { "1:1": [[13, sword.id]] },
      zones: [{ id: 1, shortName: "qeynos", longName: "South Qeynos" }],
    });
    await backend.initialize();
    await backend.connect(7);

    const created = await backend.handle(7, {
      type: "character_create",
      character: {
        name: "Shared",
        charClass: 1,
        race: 1,
        gender: 0,
        deity: 0,
        startZone: 1,
        face: 0,
      },
    });
    assert.equal(created[0]?.type, "approve_name");
    assert.equal(created[0]?.value.value, 1);
    assert.equal(
      (await backend.handle(7, { type: "enter_world", name: "Shared" }))[0]
        ?.type,
      "post_enter_world",
    );
    assert.equal(
      (
        await backend.handle(7, {
          type: "zone_session",
          zoneId: "qeynos",
          instanceId: 0,
        })
      )[0]?.value.value,
      1,
    );

    const bootstrap = await backend.handle(7, {
      type: "zone_change",
      instanceId: 0,
    });
    assert.deepEqual(
      bootstrap.map((entry) => entry.type),
      ["new_zone", "player_profile", "zone_spawns"],
    );
    const geared = await backend.handle(7, {
      type: "gm_command",
      command: "gearup",
      args: [],
    });
    const items = geared.find((entry) => entry.type === "bulk_items");
    assert.ok(items);
    assert.equal((items.value.items as Array<{ id: number }>)[0]?.id, sword.id);
    const login = await backend.handle(7, { type: "login", token: "guest" });
    const characterSelect = login.find(
      (entry) => entry.type === "character_select",
    );
    const selectedCharacters = characterSelect?.value.characters as Array<{
      items: Array<{ id: number; slot: number }>;
    }>;
    assert.deepEqual(
      selectedCharacters[0]?.items.map(({ id, slot }) => ({ id, slot })),
      [{ id: sword.id, slot: 13 }],
    );
    await backend.close();
  });

  it("uses one canonical zone identity for a fresh offline database", async () => {
    const database = new SqliteBackend();
    await database.execute(
      `CREATE TABLE zones (
        id INTEGER PRIMARY KEY, short_name TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        safe_x REAL NOT NULL DEFAULT 0, safe_y REAL NOT NULL DEFAULT 0,
        safe_z REAL NOT NULL DEFAULT 0)`,
    );
    await database.execute(
      "INSERT INTO zones (id, short_name, name) VALUES (35, 'sro', 'Southern Desert of Ro')",
    );
    await database.execute(
      "INSERT INTO zones (id, short_name, name) VALUES (393, 'southro', 'South Desert of Ro')",
    );
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [{ id: 35, shortName: "southro", longName: "South Ro" }],
    });

    await backend.initialize();

    const zones = (
      await database.query<{ id: number; key: string }>(
        "SELECT id, short_name AS key FROM zones WHERE id IN (35, 393) ORDER BY id",
      )
    ).rows;
    assert.deepEqual(zones, [{ id: 35, key: "southro" }]);
    await backend.close();
  });

  it("runs registered NPC say quests through the offline backend", async () => {
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [{ id: 2, shortName: "qeynos2", longName: "North Qeynos" }],
      quests: BUILTIN_QUESTS,
    });
    await backend.initialize();
    await database.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, level, race_id, gender, properties_json)
       VALUES (2093, 'npc:2093', 'Guard_Gehnus', 50, 1, 0, '{}')`,
    );
    await database.execute(
      "INSERT INTO spawn_groups (id, spawn_group_key) VALUES (2093, 'test:gehnus')",
    );
    await database.execute(
      "INSERT INTO spawn_group_members VALUES (2093, 2093, 1)",
    );
    await database.execute(
      `INSERT INTO spawn_points
       (id, zone_id, spawn_group_id, x, y, z, heading)
       VALUES (2093, 2, 2093, -312, 3.1, 130, 0)`,
    );
    await backend.handle(4, {
      type: "character_create",
      character: {
        name: "Ezaltarem",
        charClass: 1,
        race: 1,
        gender: 0,
        deity: 0,
        startZone: 2,
        face: 0,
      },
    });
    await backend.handle(4, { type: "enter_world", name: "Ezaltarem" });
    await backend.handle(4, { type: "zone_session", zoneId: 2, instanceId: 0 });
    await backend.handle(4, { type: "zone_change", instanceId: 0 });

    const events = await backend.handle(4, {
      type: "channel_message",
      sender: "Ezaltarem",
      targetName: "Guard_Gehnus",
      message: "Hail, Guard Gehnus",
      channel: 0,
    });

    assert.deepEqual(events, [
      {
        type: "channel_message",
        transport: "control-stream",
        value: {
          sender: "Guard_Gehnus",
          target: "Ezaltarem",
          message: "Hello, Ezaltarem! How can I assist you today? count 1",
          chanNum: 0,
        },
      },
    ]);
    await backend.close();
  });

  it("replaces attached content without coupling it to persistent runtime state", async () => {
    const directory = mkdtempSync(join(tmpdir(), "requiem-offline-"));
    const contentPath = join(directory, "content.sqlite");
    const runtimePath = join(directory, "runtime.sqlite");
    try {
      const contentDatabase = new SqliteBackend(new BetterSqlite3(contentPath));
      await applyCanonicalContentSchema(contentDatabase);
      await contentDatabase.execute(
        "INSERT INTO zones (id, short_name, name) VALUES (1, 'qeynos', 'South Qeynos')",
      );
      await contentDatabase.close();

      const createBackend = () =>
        new EmbeddedGameBackend(
          new SqliteBackend(new BetterSqlite3(runtimePath)),
          {
            items: [],
            gearSets: {},
            zones: [],
            contentDatabasePath: contentPath,
          },
        );
      const first = createBackend();
      await first.initialize();
      await first.handle(1, {
        type: "character_create",
        character: {
          name: "Persistent",
          charClass: 1,
          race: 1,
          gender: 0,
          deity: 0,
          startZone: 1,
          face: 0,
        },
      });
      await first.close();

      const second = createBackend();
      await second.initialize();
      const events = await second.handle(1, { type: "login", token: "local" });
      assert.equal(events[1]?.value.characterCount, 1);
      assert.equal(
        (
          await second.handle(1, {
            type: "zone_session",
            zoneId: "qeynos",
            instanceId: 0,
          })
        )[0]?.value.value,
        1,
      );
      await second.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
