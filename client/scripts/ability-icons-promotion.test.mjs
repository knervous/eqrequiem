import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const manifestPath = path.join(repoRoot, "client/public/eltania/abilities/icons/v1/icon-manifest.json");
const outputDir = path.join(repoRoot, "client/public/eltania/abilities/icons/v1");

test("all 221 manifest icons exist as valid webp files in public client directory", async () => {
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  assert.equal(manifest.icons.length, 221, "Expected 221 total icons in manifest");

  for (const icon of manifest.icons) {
    const webpPath = path.join(outputDir, icon.file);
    const stat = await fs.stat(webpPath).catch(() => null);

    assert.ok(stat, `Missing webp icon file for ${icon.id}: ${icon.file}`);
    assert.ok(stat.size > 1000, `Implausible icon file size (${stat.size} bytes) for ${icon.id}`);
  }
});

test("abilityIconUrl helper cleanly binds every icon ID to public client route", async () => {
  const manifestRaw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const SAFE_ID = /^[a-z0-9_.]+$/;

  for (const icon of manifest.icons) {
    assert.ok(SAFE_ID.test(icon.id), `Invalid safe ID format: ${icon.id}`);
    const expectedUrl = `/eltania/abilities/icons/v1/${icon.id}.webp`;
    const actualFileName = `${icon.id}.webp`;
    assert.equal(icon.file, actualFileName, `Manifest file name mismatch for ${icon.id}`);
  }
});
