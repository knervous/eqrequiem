import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const manifestPath = path.join(repoRoot, "client/public/eltania/abilities/icons/v1/icon-manifest.json");
const outputDir = path.join(repoRoot, "client/public/eltania/abilities/icons/v1");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const existingFiles = new Set(fs.readdirSync(outputDir));

const missing = manifest.icons.filter((i) => !existingFiles.has(i.file));

console.log(`[Icon Batch Status] Total Icons: ${manifest.icons.length} | Existing: ${existingFiles.size - 1} | Missing: ${missing.length}`);

if (missing.length === 0) {
  console.log("All 221 icons are already generated!");
  process.exit(0);
}

console.log("Remaining missing icons sample:", missing.slice(0, 10).map((m) => m.id));
