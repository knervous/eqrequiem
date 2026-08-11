import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { GameDatabase } from "../persist/game-database.js";
import { ZoneWriteScheduler } from "../persist/zone-write-scheduler.js";
import {
  writeZoneCoalescedIntent,
  writeZoneDeferredIntent,
  type ZoneCoalesceKey,
  type ZoneDeferredWrite,
  type ZonePositionWrite,
} from "../persist/zone-write-intents.js";
import { CharacterApplicationService } from "./character-application-service.js";
import { radiansToEqHeading } from "./heading.js";
import { ZoneJoinService } from "./zone-join-service.js";
import { GmCommandService } from "./gm-command-service.js";

describe("shared character application services", () => {
  it("runs journal and inventory mutations through the common critical lane", async () => {
    const { runtime, database, writes } = await fixture();
    const service = new CharacterApplicationService(database, writes);

    const journal = await service.updateJournal(1, {
      action: "add",
      body: "  The west gate is watched.  ",
      source: "test",
      withPosition: true,
    });
    assert.equal(journal.notes[0]?.body, "The west gate is watched.");
    assert.deepEqual(journal.notes[0]?.place, {
      zoneId: 1,
      x: 4,
      y: 5,
      z: 6,
    });

    const destination = await service.grantLoot(1, 500, 3, 2);
    assert.deepEqual(destination, { slot: 22, bag: -1 });
    assert.deepEqual(
      await service.moveItem(1, {
        fromSlot: 22,
        fromBag: -1,
        toSlot: 23,
        toBag: -1,
      }),
      [{ fromSlot: 22, fromBag: -1, toSlot: 23, toBag: -1 }],
    );
    assert.deepEqual(
      (await runtime.query(
        "SELECT slot, bag, item_id, quantity, charges FROM player_inventory",
      )).rows,
      [{ slot: 23, bag: -1, item_id: 500, quantity: 3, charges: 2 }],
    );
    await writes.drain();
    await Promise.all([database.content.close(), runtime.close()]);
  });

  it("builds and checkpoints one shared zone-join projection", async () => {
    const { runtime, database, writes } = await fixture();
    const service = new ZoneJoinService(database, writes);
    const heading = Math.PI / 2;

    const join = await service.load("Shared", 1, 3, {
      x: 20,
      y: 21,
      z: 22,
      heading,
    });

    assert.equal(join.zone.key, "shared");
    assert.deepEqual(join.position, {
      x: 20,
      y: 21,
      z: 22,
      heading: radiansToEqHeading(heading),
    });
    assert.deepEqual(join.bind, {
      zoneId: 1,
      instanceId: 0,
      x: 1,
      y: 2,
      z: 3,
      heading: 4,
    });
    assert.deepEqual(
      (await runtime.query(
        "SELECT zone_id, instance_id, x, y, z, heading FROM character_positions WHERE character_id = 1",
      )).rows,
      [{
        zone_id: 1,
        instance_id: 3,
        x: 20,
        y: 21,
        z: 22,
        heading: radiansToEqHeading(heading),
      }],
    );
    await writes.drain();
    await Promise.all([database.content.close(), runtime.close()]);
  });

  it("executes the same GM command effects for either transport", async () => {
    const { runtime, database, writes } = await fixture();
    const characters = new CharacterApplicationService(database, writes);
    const commands = new GmCommandService(database, characters, {
      "1:2": [[13, 500]],
    });

    assert.deepEqual(await commands.execute(1, "level", ["51"]), [{
      type: "message",
      message: "Level must be between 1 and 50.",
    }]);
    const leveled = await commands.execute(1, "level", ["2"]);
    assert.equal(leveled[0]?.type, "level");
    assert.equal(leveled[0]?.type === "level" ? leveled[0].level : 0, 2);
    assert.equal(
      leveled[0]?.type === "level" ? leveled[0].combat.level : 0,
      2,
    );
    assert.deepEqual(await commands.execute(1, "searchitem", ["Tok"]), [{
      type: "message",
      message: "500: Token",
    }]);
    assert.equal(
      (await commands.execute(1, "summonitem", ["500"]))[0]?.type,
      "inventory_put",
    );
    const geared = await commands.execute(1, "gearup", []);
    assert.deepEqual(geared.map((effect) => effect.type), [
      "inventory_replace",
      "message",
    ]);
    assert.equal(
      geared[0]?.type === "inventory_replace"
        ? geared[0].items[0]?.itemId
        : null,
      500,
    );
    await writes.drain();
    await Promise.all([database.content.close(), runtime.close()]);
  });
});

async function fixture() {
  const runtime = createNodeDatabase("sqlite::memory:");
  const content = createNodeDatabase("sqlite::memory:");
  await applyCanonicalRuntimeSchema(runtime);
  await applyCanonicalContentSchema(content);
  await runtime.execute("INSERT INTO accounts (identity) VALUES ('test')");
  await runtime.execute(
    `INSERT INTO characters
      (account_id, name, level, class_id, race_id, str, sta, dex, agi)
     VALUES (1, 'Shared', 1, 1, 1, 75, 75, 75, 75)`,
  );
  await runtime.execute(
    `INSERT INTO character_positions
      (character_id, zone_id, instance_id, x, y, z, heading)
     VALUES (1, 1, 0, 4, 5, 6, 7)`,
  );
  await runtime.execute(
    `INSERT INTO character_binds
      (character_id, slot, zone_id, instance_id, x, y, z, heading)
     VALUES (1, 0, 1, 0, 1, 2, 3, 4)`,
  );
  await content.execute(
    "INSERT INTO zones (id, short_name, name, safe_x, safe_y, safe_z) VALUES (1, 'shared', 'Shared Zone', 8, 9, 10)",
  );
  await content.execute("INSERT INTO items (id, name) VALUES (500, 'Token')");
  const database = new GameDatabase(runtime, content);
  const writes = new ZoneWriteScheduler<
    ZoneDeferredWrite,
    ZonePositionWrite,
    ZoneCoalesceKey
  >(
    runtime,
    {
      writeDeferred: writeZoneDeferredIntent,
      writeCoalesced: writeZoneCoalescedIntent,
    },
    { deferredFlushMs: false, coalescedFlushMs: false },
  );
  return { runtime, database, writes };
}
