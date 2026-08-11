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
import { LevelCurve, questExperience } from "../zone/quest-progression.js";
import { ARRIVAL, ZONES } from "../content/eltania.js";
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
      zones: [{ id: 1, shortName: "talioslowharbor", longName: "Talios Lowharbor" }],
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
          zoneId: "talioslowharbor",
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
      // Zone entry also seeds the experience meter, the character's own journal, and the
      // techniques they may press — the client cannot build a hotbar without the last.
      [
        "new_zone", "player_profile", "zone_spawns", "ability_loadout", "progression_state",
        "experience_update", "journal_update",
      ],
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
    await backend.handle(7, {
      type: "client_update",
      x: 18,
      y: 4,
      z: -40,
      heading: Math.PI,
    });
    const beforeCheckpoint = (
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
    assert.notDeepEqual(
      beforeCheckpoint,
      {
        zone_id: 1,
        instance_id: 0,
        x: 18,
        y: 4,
        z: -40,
        heading: 256,
      },
      "movement stays in memory until a lifecycle checkpoint",
    );

    await backend.disconnect(7);
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
      x: 18,
      y: 4,
      z: -40,
      heading: 256,
    });

    await backend.connect(8);
    await backend.handle(8, { type: "enter_world", name: "Shared" });
    // The demo hook relocates to the Crownward gate on enter-world by design
    // (`content/demo-start.ts`, covered by its own tests). What this test is about is the
    // step after: that zone entry restores whatever position is persisted. So put the
    // saved position back and let the restore path prove itself.
    await database.execute(
      `UPDATE character_positions SET zone_id = 1, x = 12.5, y = 3.25, z = -44, heading = 128
        WHERE character_id = (SELECT id FROM characters WHERE name = 'Shared')`,
    );
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
        { id: 1, shortName: "talioslowharbor", longName: "Talios Lowharbor" },
        { id: 2, shortName: "talioscrownward", longName: "Talios Crownward" },
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

  it("starts every character at the canonical Talios arrival, and keeps it", async () => {
    // The gap this closes: `resolveCharacterOrigin` was unit-tested, but nothing proved
    // that creation actually persists what it returns, or that entering the zone leaves
    // it alone. Both are separate code paths and either could quietly relocate a player.
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [{
        id: ZONES.crownward.id,
        shortName: ZONES.crownward.key,
        longName: ZONES.crownward.name,
      }],
    });
    await backend.initialize();
    await backend.connect(9);

    // A Dwarf: a race with no authored origin anywhere near Talios, which is exactly
    // the case that used to fail creation outright.
    await backend.handle(9, {
      type: "character_create",
      character: {
        name: "Dorrin", charClass: 1, race: 8, gender: 0, deity: 207,
        startZone: ZONES.crownward.id, face: 0,
      },
    });

    const placed = (await database.query<{
      zone_id: number; x: number; y: number; z: number;
    }>(
      `SELECT p.zone_id, p.x, p.y, p.z FROM character_positions p
         JOIN characters c ON c.id = p.character_id WHERE c.name = 'Dorrin'`,
    )).rows[0];
    assert.ok(placed, "creation must persist a position");
    assert.deepEqual(
      [Number(placed.zone_id), Number(placed.x), Number(placed.y), Number(placed.z)],
      [ARRIVAL.zone.id, ARRIVAL.x, ARRIVAL.y, ARRIVAL.z],
      "a new character must be standing at the authored arrival",
    );

    // The bind point too: dying must not send them somewhere the demo does not ship.
    const bind = (await database.query<{ zone_id: number }>(
      `SELECT b.zone_id FROM character_binds b
         JOIN characters c ON c.id = b.character_id WHERE c.name = 'Dorrin' AND b.slot = 0`,
    )).rows[0];
    assert.equal(Number(bind?.zone_id), ARRIVAL.zone.id);

    // Entering the world must not move them.
    await backend.handle(9, { type: "enter_world", name: "Dorrin" });
    await backend.handle(9, {
      type: "zone_session",
      zoneId: ZONES.crownward.key,
      instanceId: 0,
    });
    await backend.handle(9, { type: "zone_change", instanceId: 0 });

    const afterEntry = (await database.query<{
      zone_id: number; x: number; y: number; z: number;
    }>(
      `SELECT p.zone_id, p.x, p.y, p.z FROM character_positions p
         JOIN characters c ON c.id = p.character_id WHERE c.name = 'Dorrin'`,
    )).rows[0];
    assert.deepEqual(
      [Number(afterEntry!.zone_id), Number(afterEntry!.x), Number(afterEntry!.y), Number(afterEntry!.z)],
      [ARRIVAL.zone.id, ARRIVAL.x, ARRIVAL.y, ARRIVAL.z],
      "entering the zone must not relocate a character away from the arrival",
    );
    await backend.close();
  });

  it("returns a character who logged out elsewhere to the Crownward gate", async () => {
    // The demo hook (`content/demo-start.ts`). Proving it end-to-end matters because the
    // shared function being correct says nothing about `enter_world` calling it — and a
    // character parked in the Mournvault is exactly the state that makes the demo open
    // on an empty crypt instead of the gate.
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [
        { id: ZONES.crownward.id, shortName: ZONES.crownward.key, longName: ZONES.crownward.name },
        { id: ZONES.mournvault.id, shortName: ZONES.mournvault.key, longName: ZONES.mournvault.name },
      ],
    });
    await backend.initialize();
    await backend.connect(11);
    await backend.handle(11, {
      type: "character_create",
      character: {
        name: "Sennet", charClass: 1, race: 1, gender: 0, deity: 207,
        startZone: ZONES.crownward.id, face: 0,
      },
    });

    await database.execute(
      `UPDATE character_positions
          SET zone_id = ?, x = -900, y = -40, z = 12
        WHERE character_id = (SELECT id FROM characters WHERE name = 'Sennet')`,
      [ZONES.mournvault.id],
    );

    await backend.handle(11, { type: "enter_world", name: "Sennet" });

    const placed = (await database.query<{
      zone_id: number; x: number; y: number; z: number;
    }>(
      `SELECT p.zone_id, p.x, p.y, p.z FROM character_positions p
         JOIN characters c ON c.id = p.character_id WHERE c.name = 'Sennet'`,
    )).rows[0];
    assert.deepEqual(
      [Number(placed!.zone_id), Number(placed!.x), Number(placed!.y), Number(placed!.z)],
      [ARRIVAL.zone.id, ARRIVAL.x, ARRIVAL.y, ARRIVAL.z],
      "entering the world must bring the character back to the gate",
    );

    // …and the zone the client is actually attached to has to agree. The client asks for
    // the zone it read off the character-select roster, which is the stale one, so the
    // server has to refuse it — without this the position write above is immediately
    // undone and the player lands where they logged out.
    await backend.handle(11, {
      type: "zone_session",
      zoneId: ZONES.mournvault.key,
      instanceId: 0,
    });
    const bootstrap = await backend.handle(11, { type: "zone_change", instanceId: 0 });
    const newZone = bootstrap.find((entry) => entry.type === "new_zone");
    assert.equal(
      Number(newZone?.value.zoneId ?? newZone?.value.zone_id),
      ARRIVAL.zone.id,
      "a stale zone request from the roster must not override the demo start",
    );
    await backend.close();
  });

  it("lets a Warrior actually use a technique, and refuses when it should", async () => {
    // The gap this covers: `CombatantRuntime` and the whole Warrior kit were built,
    // unit-tested and imported by nothing. A character was granted Kick at creation,
    // it was persisted, and there was no request that could ever fire it.
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(
      database,
      {
        items: [],
        gearSets: {},
        zones: [{
          id: ZONES.crownward.id,
          shortName: ZONES.crownward.key,
          longName: ZONES.crownward.name,
        }],
      },
      // Abilities act on entities, so this needs a real simulation kernel — without one
      // there is no zone runtime and nothing for a technique to hit.
      { createZoneKernel: () => loadZoneSimulationKernel("debug") },
    );
    await backend.initialize();
    await database.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, level, race_id, gender, properties_json)
       VALUES (3001, 'npc:3001', 'a_cellar_rat', 2, 36, 0, '{}')`,
    );
    await database.execute(
      "INSERT INTO spawn_groups (id, spawn_group_key) VALUES (3001, 'test:rat')",
    );
    await database.execute("INSERT INTO spawn_group_members VALUES (3001, 3001, 1)");
    await database.execute(
      `INSERT INTO spawn_points (id, zone_id, spawn_group_id, x, y, z, heading)
       VALUES (3001, ${ZONES.crownward.id}, 3001, -312, 3.1, 130, 0)`,
    );

    await backend.connect(21);
    await backend.handle(21, {
      type: "character_create",
      character: {
        name: "Brannock", charClass: 1, race: 1, gender: 0, deity: 0,
        startZone: ZONES.crownward.id, face: 0,
      },
    });
    await backend.handle(21, { type: "enter_world", name: "Brannock" });
    await backend.handle(21, {
      type: "zone_session", zoneId: ZONES.crownward.id, instanceId: 0,
    });
    const bootstrap = await backend.handle(21, { type: "zone_change", instanceId: 0 });

    // The client cannot press what it was never told about.
    const loadout = bootstrap.find((entry) => entry.type === "ability_loadout");
    assert.ok(loadout, "zone entry must tell the client what the character can use");
    const prepared = loadout.value.prepared as Array<{ abilityId: string; slot: number }>;
    assert.ok(
      prepared.some((entry) => entry.abilityId === "warrior.kick"),
      "a level 1 Warrior starts with Kick on the bar",
    );

    const spawns = bootstrap.find((entry) => entry.type === "zone_spawns");
    assert.ok(spawns, "zone entry must include spawns");
    const rat = (spawns.value.spawns as Array<{ spawnId: number; name: string }>)
      .find((spawn) => spawn.name === "a_cellar_rat");
    assert.ok(rat, "the fixture rat must be in the zone");

    const kicked = await backend.handle(21, {
      type: "activate_ability",
      abilityId: "warrior.kick",
      targetId: rat.spawnId,
    });
    const result = kicked.find((entry) => entry.type === "ability_result");
    assert.ok(result, "activating must answer");
    assert.equal(result.value.ok, 1, `Kick was refused: ${String(result.value.reason)}`);
    const effects = result.value.effects as Array<{ kind: string; damage?: number }>;
    const damage = effects.find((effect) => effect.kind === "damage");
    assert.ok(damage, "Kick must land damage on the rat");
    assert.ok((damage.damage ?? 0) > 0);

    // Immediately again: refused, and told why. `recovering` rather than `on_cooldown`
    // is the correct answer here — both are true, and `CombatantRuntime` reports the
    // nearer constraint first so the client can buffer the input against the right
    // deadline. The exact cooldown boundary is proved in `player-abilities.test.ts`,
    // which owns the clock; this asserts the refusal reaches the player at all.
    const again = await backend.handle(21, {
      type: "activate_ability",
      abilityId: "warrior.kick",
      targetId: rat.spawnId,
    });
    const refusal = again.find((entry) => entry.type === "ability_result");
    assert.equal(refusal?.value.ok, 0);
    assert.equal(
      refusal?.value.reason,
      "recovering",
      "the client needs the reason, not a dropped input",
    );
    assert.ok(
      Number(refusal?.value.readyAtMs) > 0,
      "a timing refusal must say when the action becomes available",
    );

    // A technique the Warrior has not learned is refused by the server, not the UI.
    const unlearned = await backend.handle(21, {
      type: "activate_ability",
      abilityId: "warrior.defensive_discipline",
      targetId: rat.spawnId,
    });
    const denied = unlearned.find((entry) => entry.type === "ability_result");
    assert.equal(denied?.value.ok, 0);
    assert.equal(denied?.value.reason, "not_learned");

    await backend.close();
  });

  it("runs registered NPC say quests through the offline backend", async () => {
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(database, {
      items: [],
      gearSets: {},
      zones: [{ id: ZONES.crownward.id, shortName: ZONES.crownward.key, longName: ZONES.crownward.name }],
      quests: BUILTIN_QUESTS,
    });
    await backend.initialize();
    await database.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, level, race_id, gender, properties_json)
       VALUES (2093, ?, ?, 50, 1, 0, '{}')`,
      // Seeded from the vocabulary: quest handlers match on this name, so a content
      // rename must move the fixture and the content together or not at all.
      ["npc:2093", "Serjeant_Halvane"],
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
      targetName: "Serjeant_Halvane",
      message: "Hail, Serjeant Halvane",
      channel: 0,
    });

    // Hailing only offers a thread to pull; nothing is assigned or tracked yet.
    assert.deepEqual(greeting.map((entry) => entry.type), ["channel_message"]);
    assert.match(String(greeting[0]?.value.message), /a patrol of ours is late/);

    // A level 1 character is warned off rather than handed the thread.
    const tooGreen = await backend.handle(4, {
      type: "channel_message",
      sender: "Ezaltarem",
      targetName: "Serjeant_Halvane",
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
      targetName: "Serjeant_Halvane",
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
      "heard-rumor",
      "wayhouse-lead",
    ]);
    // Authored beats are a share of the level they are met at, so this asserts the
    // same way the content is written rather than re-encoding the curve as a literal.
    assert.equal(
      Number((asked.find((entry) => entry.type === "experience_update"))?.value.experience),
      questExperience(LevelCurve.default(), 5, "hint"),
    );

    // Quest persistence is deferred. The next blocking character write drains it first,
    // without requiring a movement write or a zone transition.
    await backend.handle(4, {
      type: "journal_note",
      action: "remove",
      noteId: 999_999,
    });
    // The persisted row survives the shard: state, not chat history, is the record.
    const stored = (
      await database.query<{ quest_key: string; state_json: string }>(
        "SELECT quest_key, state_json FROM character_quest_state",
      )
    ).rows;
    assert.equal(stored[0]?.quest_key, "talioscrownward:missing-patrol");
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
      "talios.patrol_missing",
      "talios.varen_led_patrol",
      "talios.wayhouse_route",
    ]);

    // The player can also keep a line the world never annotated as important.
    const kept = await backend.handle(4, {
      type: "journal_note",
      action: "add",
      body: "Varen used to take his patrol through the old wayhouse.",
      source: "Serjeant Halvane",
      withPosition: true,
    });
    assert.equal(kept[0]?.type, "journal_update");
    const notes = kept[0]!.value.notes as Array<{
      id: number;
      body: string;
      source: string;
      pinned: boolean;
      place: unknown;
    }>;
    assert.equal(notes.length, 1);
    assert.equal(notes[0]?.source, "Serjeant Halvane");
    assert.notEqual(notes[0]?.place, null);
    // Server-authored leads are unaffected by the player's own memory.
    assert.equal((kept[0]!.value.entries as unknown[]).length, 2);

    const pinned = await backend.handle(4, {
      type: "journal_note",
      action: "pin",
      noteId: notes[0]!.id,
      pinned: true,
    });
    assert.equal(
      (pinned[0]!.value.notes as Array<{ pinned: boolean }>)[0]?.pinned,
      true,
    );

    const dropped = await backend.handle(4, {
      type: "journal_note",
      action: "remove",
      noteId: notes[0]!.id,
    });
    assert.deepEqual(dropped[0]?.value.notes, []);
    await backend.close();
  });

  it("publishes SQLite-backed NPC movement ticks through the Shado packet adapter", async () => {
    const database = new SqliteBackend();
    const backend = new EmbeddedGameBackend(
      database,
      {
        items: [],
        gearSets: {},
        zones: [{ id: 1, shortName: "talioslowharbor", longName: "Talios Lowharbor" }],
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
        "INSERT INTO zones (id, short_name, name) VALUES (1, 'talioslowharbor', 'Talios Lowharbor')",
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
            zoneId: "talioslowharbor",
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
