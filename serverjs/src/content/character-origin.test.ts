import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { applyCanonicalContentSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { arrivalPlacement, resolveCharacterOrigin } from "./character-origin.js";
import { ARRIVAL, ZONES } from "./eltania.js";

const CONTENT_DB = fileURLToPath(
  new URL("../../data/content-db.sqlite", import.meta.url),
);
const START_ZONE_IDS = new Set<number>([ZONES.crownward.id, ZONES.lowharbor.id]);

/** The character contract pins these; every body family varies only by race. */
const CONTRACT = { charClass: 1, deity: 207 };
const EVERY_RACE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 128, 130];

describe("character origin", () => {
  it("places a character even when the content database has nothing to say", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(database);
    const placement = await resolveCharacterOrigin(database, {
      race: 2,
      ...CONTRACT,
    });
    assert.equal(placement.source, "arrival");
    assert.equal(placement.zoneId, ZONES.crownward.id);
    assert.equal(placement.bindZoneId, ZONES.crownward.id);
    await database.close();
  });

  it("survives a content database with no character_origins table at all", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    const placement = await resolveCharacterOrigin(database, { race: 1, ...CONTRACT });
    assert.deepEqual(placement, arrivalPlacement());
    await database.close();
  });

  it("ignores an authored origin that points outside the demo's start zones", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(database);
    // A Freeport origin is real content, but the demo does not ship Freeport; obeying
    // it would drop the player into a zone with no world package.
    await database.execute(
      `INSERT INTO character_origins
        (race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z, heading,
         bind_zone_id, bind_x, bind_y, bind_z, bind_heading, priority)
       VALUES (1, 1, 207, 9, 9, 100, 200, 300, 0, 9, 100, 200, 300, 0, 100)`,
    );
    const placement = await resolveCharacterOrigin(database, { race: 1, ...CONTRACT });
    assert.equal(placement.source, "arrival");
    assert.equal(placement.zoneId, ZONES.crownward.id);
    await database.close();
  });

  it("honours an authored origin inside a start zone", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(database);
    await database.execute(
      `INSERT INTO character_origins
        (race_id, class_id, deity_id, start_zone_id, zone_id, x, y, z, heading,
         bind_zone_id, bind_x, bind_y, bind_z, bind_heading, priority)
       VALUES (1, 1, 207, ?, ?, 11, 22, 33, 44, ?, 11, 22, 33, 44, 100)`,
      [ZONES.crownward.id, ZONES.crownward.id, ZONES.crownward.id],
    );
    // With the demo hook off, so the resolution this covers does not rot while every
    // caller is short-circuited to the gate.
    const placement = await resolveCharacterOrigin(
      database,
      { race: 1, ...CONTRACT },
      { forceDemoStart: false },
    );
    assert.equal(placement.source, "authored");
    assert.deepEqual(
      [placement.x, placement.y, placement.z, placement.heading],
      [11, 22, 33, 44],
    );

    // …and with the hook on, the gate wins over the authored row. This is the pairing
    // that matters: the demo advertises one starting city, so creation must not quietly
    // place a character in whichever home city EverQuest authored for their race.
    const forced = await resolveCharacterOrigin(
      database,
      { race: 1, ...CONTRACT },
      { forceDemoStart: true },
    );
    assert.equal(forced.source, "arrival");
    assert.equal(forced.zoneId, ZONES.crownward.id);
    await database.close();
  });

  it(
    "starts every playable race in Talios against the real content database",
    { skip: existsSync(CONTENT_DB) ? false : "content-db.sqlite not built" },
    async () => {
      // The regression this exists for: against the shipped content database, no origin
      // row matches the character contract for *any* race, so the old per-runtime
      // lookups failed creation outright. Only the empty test fixture ever passed.
      const database = createNodeDatabase(`sqlite:${CONTENT_DB}`);
      for (const race of EVERY_RACE) {
        const placement = await resolveCharacterOrigin(database, { race, ...CONTRACT });
        assert.ok(
          START_ZONE_IDS.has(placement.zoneId),
          `race ${race} starts in zone ${placement.zoneId}, which is not Talios`,
        );
        assert.ok(
          START_ZONE_IDS.has(placement.bindZoneId),
          `race ${race} binds to zone ${placement.bindZoneId}, which is not Talios`,
        );
      }
      await database.close();
    },
  );

  it("keeps the arrival inside the Crownward", () => {
    assert.equal(ARRIVAL.zone.key, ZONES.crownward.key);
    assert.equal(arrivalPlacement().zoneId, ZONES.crownward.id);
  });
});
