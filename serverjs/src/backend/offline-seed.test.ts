import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, it } from "node:test";

import BetterSqlite3 from "better-sqlite3";

import { OFFLINE_SEED_VERSION } from "./offline-seed.js";

describe("checked-in offline content seed", () => {
  it("contains the schema advertised by its cache version", () => {
    const directory = mkdtempSync(join(tmpdir(), "requiem-offline-seed-"));
    const sqlitePath = join(directory, "content.sqlite");
    try {
      const gzipPath = new URL("../../data/content-db.sqlite.gz", import.meta.url);
      writeFileSync(sqlitePath, gunzipSync(readFileSync(gzipPath)));
      const database = new BetterSqlite3(sqlitePath, { readonly: true });
      try {
        const artifact = database.prepare(
          "SELECT value FROM content_artifact_meta WHERE key = 'version'",
        ).get() as { value: string } | undefined;
        const lootTable = database.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'npc_loot_table_entries'",
        ).get();
        const lootMigration = database.prepare(
          "SELECT version FROM schema_migrations WHERE namespace = 'content' AND version = 8",
        ).get();

        assert.equal(artifact?.value, OFFLINE_SEED_VERSION);
        assert.ok(lootTable);
        assert.ok(lootMigration);
      } finally {
        database.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
