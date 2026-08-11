import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const reliquaryDir = scriptDir;

test("Grimoire background image asset exists in client public directory", async () => {
  const grimoireImgPath = path.resolve(scriptDir, "../../../../../public/eltania/ui/grimoire_bg.jpg");
  const stat = await fs.stat(grimoireImgPath);
  assert.ok(stat.isFile() && stat.size > 10000, "Grimoire background image grimoire_bg.jpg missing or invalid");
});

test("AbilitiesWindow exports compact grimoire spellbook with drag handles", async () => {
  const abilitiesTsxPath = path.join(reliquaryDir, "abilities-window.tsx");
  const cssPath = path.join(reliquaryDir, "reliquary.css");
  const abilitiesTsx = await fs.readFile(abilitiesTsxPath, "utf8");
  const cssContent = await fs.readFile(cssPath, "utf8");

  assert.ok(abilitiesTsx.includes("rq-grimoire-book"), "rq-grimoire-book wrapper missing");
  assert.ok(cssContent.includes("/eltania/ui/grimoire_bg.jpg"), "Grimoire background image CSS reference missing");
  assert.ok(abilitiesTsx.includes("rq-grimoire-spell--draggable"), "rq-grimoire-spell--draggable class missing");
  assert.ok(abilitiesTsx.includes("toggleAbilitiesWindow"), "toggleAbilitiesWindow event missing");
});

test("AspectsWindow exports separated celestial progression tree", async () => {
  const aspectsTsxPath = path.join(reliquaryDir, "aspects-window.tsx");
  const aspectsTsx = await fs.readFile(aspectsTsxPath, "utf8");

  assert.ok(aspectsTsx.includes("rq-wow-talent-panel"), "rq-wow-talent-panel class missing");
  assert.ok(aspectsTsx.includes("toggleAspectsWindow"), "toggleAspectsWindow event missing");
});

test("SystemToolbar has separate Abilities and Aspects buttons", async () => {
  const toolbarTsxPath = path.join(reliquaryDir, "system-toolbar.tsx");
  const toolbarTsx = await fs.readFile(toolbarTsxPath, "utf8");

  assert.ok(toolbarTsx.includes("toggleAbilitiesWindow"), "toggleAbilitiesWindow button missing in toolbar");
  assert.ok(toolbarTsx.includes("toggleAspectsWindow"), "toggleAspectsWindow button missing in toolbar");
});
