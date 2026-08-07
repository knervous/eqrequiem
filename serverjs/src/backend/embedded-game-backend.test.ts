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
import { OP } from "../protocol/opcodes.js";
import { viewWorldStatePacket } from "../protocol/world-state.js";
import { GameBackendPacketAdapter } from "./packet-adapter.js";
import { loadZoneSimulationKernel } from "../zone/zone-kernel-node.js";

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
  it("does not reinterpret a corrupt schema probe as a legacy database", async () => {
    let mutations = 0;
    let closed = false;
    const corruption = new Error(
      "SQLITE_CORRUPT: database disk image is malformed",
    );
    const database = {
      dialect: "sqlite" as const,
      query: async () => {
        throw corruption;
      },
      execute: async () => {
        mutations++;
        return { rows: [], affectedRows: 0 };
      },
      transaction: async () => {
        throw new Error("transaction must not start after corruption");
      },
      close: async () => {
        closed = true;
      },
    };
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [],
    });

    await assert.rejects(backend.initialize(), corruption);
    assert.equal(mutations, 0);
    await backend.close();
    assert.equal(closed, true);
  });

  it("runs the same character, zone, command, and inventory API on SQLite", async () => {
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(database, {
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
      // Zone entry also seeds the experience meter and the character's own journal.
      ["new_zone", "player_profile", "zone_spawns", "experience_update", "journal_update"],
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

    await backend.handle(7, {
      type: "client_update",
      x: 12.5,
      y: 3.25,
      z: -44,
      heading: Math.PI / 2,
    });
    const persisted = (
      await database.query<{
        zone_id: number;
        instance_id: number;
        x: number;
        y: number;
        z: number;
        heading: number;
      }>(
        `SELECT zone_id, instance_id, x, y, z, heading
         FROM character_positions
         WHERE character_id = (SELECT id FROM characters WHERE name = 'Shared')`,
      )
    ).rows[0];
    assert.deepEqual(persisted, {
      zone_id: 1,
      instance_id: 0,
      x: 12.5,
      y: 3.25,
      z: -44,
      heading: 128,
    });

    await backend.disconnect(7);
    await backend.connect(8);
    await backend.handle(8, { type: "enter_world", name: "Shared" });
    await backend.handle(8, {
      type: "zone_session",
      zoneId: 1,
      instanceId: 0,
    });
    const restored = await backend.handle(8, {
      type: "zone_change",
      instanceId: 0,
    });
    const restoredProfile = restored.find(
      (entry) => entry.type === "player_profile",
    );
    assert.equal(restoredProfile?.value.x, 12.5);
    assert.equal(restoredProfile?.value.y, 3.25);
    assert.equal(restoredProfile?.value.z, -44);
    assert.equal(restoredProfile?.value.heading, 128);
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

  it("uses destination safe coordinates for an explicit GM zone transition", async () => {
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [
        { id: 1, shortName: "qeynos", longName: "South Qeynos" },
        { id: 2, shortName: "qeynos2", longName: "North Qeynos" },
      ],
    });
    await backend.initialize();
    await database.execute(
      "UPDATE zones SET safe_x = 3, safe_y = 14, safe_z = 253 WHERE id = 2",
    );
    await backend.connect(9);
    await backend.handle(9, {
      type: "character_create",
      character: {
        name: "Traveler",
        charClass: 1,
        race: 1,
        gender: 0,
        deity: 0,
        startZone: 1,
        face: 0,
      },
    });
    await backend.handle(9, { type: "enter_world", name: "Traveler" });
    await backend.handle(9, { type: "zone_session", zoneId: 1, instanceId: 0 });
    await backend.handle(9, { type: "zone_change", instanceId: 0 });
    await backend.handle(9, {
      type: "client_update",
      x: 900,
      y: 800,
      z: 700,
      heading: Math.PI,
    });

    const events = await backend.handle(9, {
      type: "zone_change",
      zoneId: 2,
      instanceId: 0,
      useSafeLocation: true,
    });
    const profile = events.find((entry) => entry.type === "player_profile");
    assert.deepEqual(
      {
        zoneId: profile?.value.zoneId,
        x: profile?.value.x,
        y: profile?.value.y,
        z: profile?.value.z,
        heading: profile?.value.heading,
      },
      { zoneId: 2, x: 3, y: 14, z: 253, heading: 0 },
    );
    const persisted = (
      await database.query<{
        zone_id: number;
        x: number;
        y: number;
        z: number;
        heading: number;
      }>(
        `SELECT zone_id, x, y, z, heading FROM character_positions
         WHERE character_id = (SELECT id FROM characters WHERE name = 'Traveler')`,
      )
    ).rows[0];
    assert.deepEqual(persisted, {
      zone_id: 2,
      x: 3,
      y: 14,
      z: 253,
      heading: 0,
    });
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

    const greeting = await backend.handle(4, {
      type: "channel_message",
      sender: "Ezaltarem",
      targetName: "Guard_Gehnus",
      message: "Hail, Guard Gehnus",
      channel: 0,
    });

    // Hailing only offers a thread to pull; nothing is assigned or tracked yet.
    assert.deepEqual(greeting.map((entry) => entry.type), ["channel_message"]);
    assert.match(String(greeting[0]?.value.message), /a patrol of ours is late/);

    // A level 1 character is warned off rather than handed the thread.
    const tooGreen = await backend.handle(4, {
      type: "channel_message",
      sender: "Ezaltarem",
      targetName: "Guard_Gehnus",
      message: "what about the missing patrol?",
      channel: 0,
    });
    assert.deepEqual(tooGreen.map((entry) => entry.type), ["channel_message"]);
    assert.match(String(tooGreen[0]?.value.message), /no place for you yet/);

    await database.execute("UPDATE characters SET level = 5 WHERE name = 'Ezaltarem'");
    await backend.handle(4, { type: "zone_session", zoneId: 2, instanceId: 0 });
    await backend.handle(4, { type: "zone_change", instanceId: 0 });
    const asked = await backend.handle(4, {
      type: "channel_message",
      sender: "Ezaltarem",
      targetName: "Guard_Gehnus",
      message: "what about the missing patrol?",
      channel: 0,
    });

    // Asking records what the character learned and pays the discovery once.
    assert.deepEqual(new Set(asked.map((entry) => entry.type)), new Set([
      "channel_message",
      "experience_update",
      "journal_update",
    ]));
    const journal = asked.find((entry) => entry.type === "journal_update");
    const entries = journal?.value.entries as Array<{ leadKey: string; kind: string }>;
    assert.deepEqual(entries.map((entry) => entry.leadKey).sort(), [
      "aqueduct-lead",
      "heard-rumor",
    ]);
    assert.equal(
      Number((asked.find((entry) => entry.type === "experience_update"))?.value.experience),
      25,
    );

    // The persisted row survives the shard: state, not chat history, is the record.
    const stored = (
      await database.query<{ quest_key: string; state_json: string }>(
        "SELECT quest_key, state_json FROM character_quest_state",
      )
    ).rows;
    assert.equal(stored[0]?.quest_key, "qeynos2:missing-patrol");
    assert.equal(
      (JSON.parse(String(stored[0]?.state_json)) as { heardRumor?: boolean }).heardRumor,
      true,
    );
    const knowledge = (
      await database.query<{ knowledge_key: string }>(
        "SELECT knowledge_key FROM character_knowledge ORDER BY knowledge_key",
      )
    ).rows.map((row) => row.knowledge_key);
    assert.deepEqual(knowledge, [
      "qeynos2.aqueduct_route",
      "qeynos2.patrol_missing",
      "qeynos2.varen_led_patrol",
    ]);
    await backend.close();
  });

  it("publishes SQLite-backed NPC movement ticks through the Shado packet adapter", async () => {
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(
      database,
      {
        items: [],
        gearSets: {},
        zones: [{ id: 1, shortName: "qeynos", longName: "South Qeynos" }],
      },
      {
        createZoneKernel: () => loadZoneSimulationKernel("debug"),
      },
    );
    await backend.initialize();
    await database.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, level, race_id, gender, movement_speed, properties_json)
       VALUES (100, 'npc:mover', 'Mover', 1, 1, 0, 1, '{}')`,
    );
    await database.execute(
      "INSERT INTO spawn_groups (id, spawn_group_key) VALUES (100, 'test:mover')",
    );
    await database.execute(
      "INSERT INTO spawn_group_members VALUES (100, 100, 1)",
    );
    await database.execute(
      `INSERT INTO spawn_points
       (id, zone_id, spawn_group_id, x, y, z, heading, movement_path_json)
       VALUES (100, 1, 100, 0, 0, 0, 0, '[[0,0,0,0,0],[10,0,0,0,0]]')`,
    );
    await backend.handle(1, {
      type: "character_create",
      character: {
        name: "Offline",
        charClass: 1,
        race: 1,
        gender: 0,
        deity: 0,
        startZone: 1,
        face: 0,
      },
    });
    await backend.handle(1, { type: "enter_world", name: "Offline" });
    await backend.handle(1, {
      type: "zone_session",
      zoneId: 1,
      instanceId: 0,
    });

    const adapter = new GameBackendPacketAdapter(backend);
    const movementPacket = new Promise<Uint8Array>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Timed out waiting for offline movement tick")),
        2_000,
      );
      adapter.onPacket((sessionIds, packet) => {
        if (packet.opcode !== OP.RENDER_SNAPSHOT || !sessionIds.includes(1)) {
          return;
        }
        clearTimeout(timeout);
        resolve(packet.payload);
      });
    });
    await backend.handle(1, { type: "zone_change", instanceId: 0 });

    const world = viewWorldStatePacket(await movementPacket);
    assert.ok(world);
    assert.ok(world.revision > 0);
    assert.equal(world.state.entityId[0], 100);
    assert.ok(world.state.statePosition[0]! > 0);
    assert.ok(Math.abs(world.state.stateHeading[0]!) < 1e-6);
    assert.ok(Math.abs(world.state.stateOrientation[1]!) < 1e-6);
    assert.ok(Math.abs(world.state.stateOrientation[3]! - 1) < 1e-6);
    await adapter.close(1);
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
