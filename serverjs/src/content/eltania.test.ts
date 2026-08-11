import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { createNodeDatabase } from "../db/node/factory.js";
import type { DatabaseBackend } from "../db/backend.js";
import { ITEMS, ZONES, zoneByKey, zoneById } from "./eltania.js";
import { questManifest } from "../zone/quest-zone-registry.js";

/**
 * The vocabulary module is a set of promises about the content database: this zone id
 * is that zone, this canonical NPC is that spawn, this authored item is that row. None
 * of those promises is checked by the type system, and every one of them fails silently
 * at runtime — a quest registered against the wrong zone id simply never loads, and a
 * handler bound to a spawn that does not exist simply never fires.
 *
 * So they are checked here, against the real content database.
 */

const CONTENT_DB = fileURLToPath(
  new URL("../../data/content-db.sqlite", import.meta.url),
);

/** The demo's content database is a build artifact, not a checked-in fixture. */
const available = existsSync(CONTENT_DB);

async function open(): Promise<DatabaseBackend> {
  return createNodeDatabase(`sqlite:${CONTENT_DB}`);
}

describe("Eltania content bindings", { skip: available ? false : "content-db.sqlite not built" }, () => {
  it("binds every zone to the id and short name it claims", async () => {
    // `key` is now the whole identity: the content database's short name, the world
    // asset base name and the nav mesh key are all this one string. When they were
    // allowed to differ, a zone could render from `qeynos2.glb.gz` while content spoke
    // of `talioscrownward` and nothing checked that the pair still meant one place.
    const database = await open();
    const rows = (
      await database.query<{ id: number; short_name: string }>(
        "SELECT id, short_name FROM zones",
      )
    ).rows;
    const byId = new Map(rows.map((row) => [Number(row.id), row.short_name]));

    for (const zone of Object.values(ZONES)) {
      assert.equal(
        byId.get(zone.id),
        zone.key,
        `${zone.key} claims zone id ${zone.id} is '${zone.key}', but it is `
        + `'${byId.get(zone.id) ?? "(no such zone)"}'`,
      );
      assert.equal(zoneByKey(zone.key)?.id, zone.id);
      assert.equal(zoneById(zone.id)?.key, zone.key);
    }
    await database.close();
  });

  it("names no zone after the EverQuest zone it was built from", async () => {
    const database = await open();
    const rows = (
      await database.query<{ short_name: string; name: string }>(
        "SELECT short_name, name FROM zones WHERE id IN (1, 2, 3, 4, 17, 36)",
      )
    ).rows;
    for (const row of rows) {
      assert.doesNotMatch(
        `${row.short_name} ${row.name}`,
        /qeynos|qrg|qeytoqrg|blackburrow|befallen/i,
        "a demo zone still carries its legacy identity",
      );
    }
    await database.close();
  });

  it("binds every NPC quest content addresses to a real spawn", async () => {
    // NPCs live in the database, not in a TypeScript table. So this checks the only
    // thing that can actually drift: the names authored content matches on, taken from
    // the generated manifest rather than from a hand-kept list that could go stale
    // without anyone noticing.
    const database = await open();
    const referenced = new Set(
      questManifest()
        .flatMap((entry) => entry.bindings)
        .filter((binding) => binding.kind === "npc")
        .map((binding) => binding.key),
    );
    assert.ok(referenced.size > 0, "no quest content addresses an NPC");

    for (const name of referenced) {
      const spawnName = name.replaceAll(" ", "_");
      const row = (
        await database.query<{ total: number }>(
          "SELECT COUNT(*) AS total FROM npc_archetypes WHERE name = ?",
          [spawnName],
        )
      ).rows[0];
      assert.ok(
        Number(row?.total ?? 0) > 0,
        `quest content addresses '${spawnName}', which is not in the content database. `
        + "Either the content database renamed it, or the quest names someone who does "
        + "not exist.",
      );
    }
    await database.close();
  });

  it("binds every authored item to a row that can actually be granted", async () => {
    const database = await open();
    for (const item of Object.values(ITEMS)) {
      const row = (
        await database.query<{ id: number }>("SELECT id FROM items WHERE id = ?", [
          item.itemId,
        ])
      ).rows[0];
      assert.ok(
        row,
        `${item.key} is bound to item id ${item.itemId}, which does not exist; `
        + "grantOnce would silently do nothing",
      );
    }
    await database.close();
  });

  it("keeps canonical keys distinct", () => {
    for (const [label, keys] of [
      ["zone", Object.values(ZONES).map((entry) => entry.key)],
      ["item", Object.values(ITEMS).map((entry) => entry.key)],
    ] as const) {
      assert.equal(
        new Set(keys).size,
        keys.length,
        `duplicate ${label} key in the Eltania vocabulary`,
      );
    }
  });
});
