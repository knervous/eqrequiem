import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import BetterSqlite3 from "better-sqlite3";

import { OFFLINE_SEED_VERSION } from "../src/backend/offline-seed.js";
import { applyCanonicalContentSchema } from "../src/db/canonical-schema.js";
import { createNodeDatabase } from "../src/db/node/factory.js";
import { SqliteBackend } from "../src/db/node/sqlite-backend.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlitePath = resolve(root, "data/content-db.sqlite");
const gzipPath = `${sqlitePath}.gz`;
const nextPath = `${sqlitePath}.next`;
const source = createNodeDatabase(required("CONTENT_DATABASE_URL"));

const tables = [
  "content_releases",
  "zones",
  "items",
  "npc_archetypes",
  "spawn_groups",
  "spawn_group_members",
  "spawn_points",
  "quest_definitions",
  "character_origins",
  "character_starting_items",
  "class_skill_caps",
] as const;

mkdirSync(dirname(sqlitePath), { recursive: true });
rmSync(nextPath, { force: true });
rmSync(gzipPath, { force: true });

const native = new BetterSqlite3(nextPath);
const destination = new SqliteBackend(native);
try {
  native.pragma("journal_mode = OFF");
  native.pragma("synchronous = OFF");
  await applyCanonicalContentSchema(destination);
  native.exec(`CREATE TABLE content_artifact_meta (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  native.prepare("INSERT INTO content_artifact_meta VALUES ('version', ?)")
    .run(OFFLINE_SEED_VERSION);

  for (const table of tables) {
    const columns = (native.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
      .map((column) => column.name);
    const rows = (await source.query(`SELECT ${columns.join(", ")} FROM ${table}`)).rows;
    if (rows.length === 0) continue;
    const placeholders = columns.map(() => "?").join(", ");
    const insert = native.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    );
    const insertAll = native.transaction((values: typeof rows) => {
      for (const row of values) {
        insert.run(...columns.map((column) => sqliteValue(row[column])));
      }
    });
    insertAll(rows);
  }
  native.exec("VACUUM");
} finally {
  await source.close();
  native.close();
}

rmSync(sqlitePath, { force: true });
renameSync(nextPath, sqlitePath);

const bytes = readFileSync(sqlitePath);
const compressed = gzipSync(bytes, { level: 9 });
writeFileSync(gzipPath, compressed);
console.log(JSON.stringify({
  version: OFFLINE_SEED_VERSION,
  sqlitePath,
  gzipPath,
  bytes: bytes.byteLength,
  gzipBytes: compressed.byteLength,
  sha256: createHash("sha256").update(compressed).digest("hex"),
}, null, 2));

function sqliteValue(value: unknown): string | number | bigint | Buffer | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (Buffer.isBuffer(value)) return value;
  return JSON.stringify(value);
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
