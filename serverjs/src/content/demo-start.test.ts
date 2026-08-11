import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { DEMO_START, applyDemoStart } from "./demo-start.js";
import { ARRIVAL, ZONES } from "./eltania.js";

/**
 * The hook overrides saved position, so the thing worth proving is that it overrides it
 * — a test that only checks a character already at the gate stays there would pass with
 * the hook deleted.
 */

/** `character_positions` has a foreign key, so the characters have to exist first. */
async function runtime(characterIds: readonly number[] = [1, 2, 7, 11]) {
  const database = createNodeDatabase("sqlite::memory:");
  await applyCanonicalRuntimeSchema(database);
  await database.execute("INSERT INTO accounts (id, identity) VALUES (1, 'test')");
  for (const id of characterIds) {
    await database.execute(
      "INSERT INTO characters (id, account_id, name) VALUES (?, 1, ?)",
      [id, `Character${id}`],
    );
  }
  return database;
}

describe("demo start hook", () => {
  it("is the Crownward gate, not a second set of coordinates", () => {
    assert.equal(DEMO_START.zoneId, ZONES.crownward.id);
    assert.deepEqual(
      [DEMO_START.x, DEMO_START.y, DEMO_START.z, DEMO_START.heading],
      [ARRIVAL.x, ARRIVAL.y, ARRIVAL.z, ARRIVAL.heading],
      "the hook must reuse ARRIVAL so the two cannot drift apart",
    );
  });

  it("moves a character who logged out somewhere else", async () => {
    const database = await runtime();
    await database.execute(
      `INSERT INTO character_positions (character_id, zone_id, instance_id, x, y, z, heading)
       VALUES (7, ?, 0, 100, 200, 300, 42)`,
      [ZONES.mournvault.id],
    );

    assert.equal(await applyDemoStart(database, 7), true);

    const row = (
      await database.query<{
        zone_id: number; x: number; y: number; z: number; heading: number;
      }>("SELECT zone_id, x, y, z, heading FROM character_positions WHERE character_id = 7")
    ).rows[0];
    assert.deepEqual(
      [
        Number(row?.zone_id), Number(row?.x), Number(row?.y),
        Number(row?.z), Number(row?.heading),
      ],
      [DEMO_START.zoneId, DEMO_START.x, DEMO_START.y, DEMO_START.z, DEMO_START.heading],
      "a character deep in the Mournvault must start the demo at the gate",
    );
    await database.close();
  });

  it("places a character who has no position row at all", async () => {
    // Update-then-insert: the update matches nothing here, so the insert has to run or
    // the character enters the world unplaced.
    const database = await runtime();
    assert.equal(await applyDemoStart(database, 11), true);

    const row = (
      await database.query<{ zone_id: number }>(
        "SELECT zone_id FROM character_positions WHERE character_id = 11",
      )
    ).rows[0];
    assert.equal(Number(row?.zone_id), DEMO_START.zoneId);
    await database.close();
  });

  it("leaves other characters alone", async () => {
    const database = await runtime();
    await database.execute(
      `INSERT INTO character_positions (character_id, zone_id, instance_id, x, y, z, heading)
       VALUES (1, ?, 0, 5, 5, 5, 0), (2, ?, 0, 9, 9, 9, 0)`,
      [ZONES.greymarch.id, ZONES.greymarch.id],
    );
    await applyDemoStart(database, 1);

    const untouched = (
      await database.query<{ zone_id: number; x: number }>(
        "SELECT zone_id, x FROM character_positions WHERE character_id = 2",
      )
    ).rows[0];
    assert.equal(Number(untouched?.zone_id), ZONES.greymarch.id);
    assert.equal(Number(untouched?.x), 9);
    await database.close();
  });
});
