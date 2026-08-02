import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { applyCanonicalContentSchema } from "../db/canonical-schema.js";
import type { DatabaseBackend } from "../db/backend.js";
import { createNodeDatabase } from "../db/node/factory.js";
import {
  createZoneSpawn,
  loadZoneWorkspace,
} from "./zone-content-editor.js";

describe("Libra visual zone content editing", () => {
  let database: DatabaseBackend;

  beforeEach(async () => {
    database = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(database);
    await database.execute(
      `INSERT INTO zones
       (id, short_name, name, safe_x, safe_y, safe_z)
       VALUES (2, 'qeynos2', 'North Qeynos', 0, 3, 0)`,
    );
    await database.execute(
      `INSERT INTO npc_archetypes
       (id, npc_key, name, properties_json)
       VALUES (101, 'qeynos2:garden-keeper', 'a garden keeper', '{}')`,
    );
  });

  afterEach(async () => {
    await database.close();
  });

  it("creates a group, member, and point atomically in runtime coordinates", async () => {
    const spawn = await createZoneSpawn(database, 2, {
      x: -93,
      y: 2,
      z: -305,
      heading: 128,
      npcArchetypeId: 101,
      respawnSeconds: 420,
      spawnGroupKey: "libra:qeynos2:garden-keeper",
    });

    assert.equal(spawn.npcName, "a garden keeper");
    assert.deepEqual(
      { x: spawn.x, y: spawn.y, z: spawn.z },
      { x: -93, y: 2, z: -305 },
    );
    assert.equal(
      Number((await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM spawn_groups",
      )).rows[0]?.count),
      1,
    );
    assert.equal(
      Number((await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM spawn_group_members",
      )).rows[0]?.count),
      1,
    );
  });

  it("loads markers and declares identity placement against the authoring preview", async () => {
    await createZoneSpawn(database, 2, {
      x: -93,
      y: 2,
      z: -305,
      npcArchetypeId: 101,
      spawnGroupKey: "libra:qeynos2:garden-marker",
    });
    const workspace = await loadZoneWorkspace(database, 2);

    assert.equal(workspace.spawns.length, 1);
    assert.equal(workspace.asset.coordinateContract, "babylon-runtime-identity");
    assert.equal(
      workspace.asset.authoringPreview,
      "/eqrequiem/worlds/qeynos2.authoring-preview.glb",
    );
  });

  it("rolls back the whole content mutation when the NPC does not exist", async () => {
    await assert.rejects(
      createZoneSpawn(database, 2, {
        x: 1,
        y: 2,
        z: 3,
        npcArchetypeId: 999,
        spawnGroupKey: "libra:qeynos2:invalid",
      }),
      /was not found/,
    );
    assert.equal(
      Number((await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM spawn_points",
      )).rows[0]?.count),
      0,
    );
    assert.equal(
      Number((await database.query<{ count: number }>(
        "SELECT COUNT(*) AS count FROM spawn_groups",
      )).rows[0]?.count),
      0,
    );
  });
});
