import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

test("SystemToolbar is streamlined into clean Character and System sections", async () => {
  const tsxPath = path.join(scriptDir, "system-toolbar.tsx");
  const cssPath = path.join(scriptDir, "system-toolbar.css");

  const tsxContent = await fs.readFile(tsxPath, "utf8");
  const cssContent = await fs.readFile(cssPath, "utf8");

  // Verify streamlined section buckets
  assert.ok(tsxContent.includes('aria-label="Character & Adventuring"'), "Character section missing");
  assert.ok(tsxContent.includes('aria-label="System Settings"'), "System section missing");
  assert.ok(!tsxContent.includes('aria-label="Combat & Tactics"'), "Combat section should be removed");
  assert.ok(!tsxContent.includes('aria-label="Social & Party"'), "Social section should be removed");

  // Verify core buttons
  assert.ok(tsxContent.includes("Equipment"), "Equipment button missing");
  assert.ok(tsxContent.includes("Abilities"), "Abilities button missing");
  assert.ok(tsxContent.includes("Aspects"), "Aspects button missing");
  assert.ok(tsxContent.includes("Dev Tools ▾"), "Dev Tools popover missing");
  assert.ok(tsxContent.includes("Options"), "Options button missing");
  assert.ok(tsxContent.includes("Camp"), "Camp button missing");

  // Verify unclipped popovers & background bar rules
  assert.ok(cssContent.includes(".rq-system-toolbar-bar"), ".rq-system-toolbar-bar background class missing");
  assert.ok(cssContent.includes(".rq-system-toolbar__popover--dev"), ".rq-system-toolbar__popover--dev class missing");
});
