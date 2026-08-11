import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const reliquaryDir = path.resolve(scriptDir, "../reliquary");
const configDir = path.resolve(scriptDir, "../../../../Game/Config");

test("types.ts and config.ts export contracts for hotbarLeft and hotbarRight", async () => {
  const typesTsPath = path.join(configDir, "types.ts");
  const configTsPath = path.join(configDir, "config.ts");

  const typesTs = await fs.readFile(typesTsPath, "utf8");
  const configTs = await fs.readFile(configTsPath, "utf8");

  assert.ok(typesTs.includes("'hotbarLeft'"), "hotbarLeft missing in HudWindowId");
  assert.ok(typesTs.includes("'hotbarRight'"), "hotbarRight missing in HudWindowId");
  assert.ok(typesTs.includes("showLeftHotbar: boolean"), "showLeftHotbar missing in UISettings");
  assert.ok(typesTs.includes("showRightHotbar: boolean"), "showRightHotbar missing in UISettings");

  assert.ok(configTs.includes("hotbarLeft: {"), "hotbarLeft missing in DEFAULT_HUD_WINDOWS");
  assert.ok(configTs.includes("hotbarRight: {"), "hotbarRight missing in DEFAULT_HUD_WINDOWS");
  assert.ok(configTs.includes("showLeftHotbar: true"), "showLeftHotbar missing in DEFAULT_CONFIG");
  assert.ok(configTs.includes("showRightHotbar: true"), "showRightHotbar missing in DEFAULT_CONFIG");
});

test("TechniquesWindow is rendered as non-modal floating container", async () => {
  const techniquesTsxPath = path.join(reliquaryDir, "techniques.tsx");
  const techniquesTsx = await fs.readFile(techniquesTsxPath, "utf8");

  assert.ok(!techniquesTsx.includes("rq-modal-layer"), "rq-modal-layer blocking backdrop should be removed from TechniquesWindow");
  assert.ok(techniquesTsx.includes("rq-open-container rq-techniques-container"), "rq-techniques-container non-modal window missing");
});

test("Reliquary HUD renders VerticalHotbar components and OptionsMenu toggles", async () => {
  const indexTsxPath = path.join(reliquaryDir, "index.tsx");
  const indexTsx = await fs.readFile(indexTsxPath, "utf8");

  assert.ok(indexTsx.includes("VerticalHotbar"), "VerticalHotbar component missing in index.tsx");
  assert.ok(indexTsx.includes("showLeftHotbar"), "showLeftHotbar toggle check missing in index.tsx");
  assert.ok(indexTsx.includes("showRightHotbar"), "showRightHotbar toggle check missing in index.tsx");
});
