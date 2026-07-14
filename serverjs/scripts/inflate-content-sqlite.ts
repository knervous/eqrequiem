import { gunzipSync } from "node:zlib";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const gzipPath = resolve("data/content-db.sqlite.gz");
const sqlitePath = resolve("data/content-db.sqlite");
const force = process.argv.includes("--force");
if (!existsSync(gzipPath)) throw new Error(`Missing checked-in content artifact: ${gzipPath}`);
if (existsSync(sqlitePath) && !force) {
  console.log(`Keeping existing editable content database: ${sqlitePath}`);
  process.exit(0);
}
writeFileSync(sqlitePath, gunzipSync(readFileSync(gzipPath)));
console.log(`Inflated ${gzipPath} -> ${sqlitePath}`);
