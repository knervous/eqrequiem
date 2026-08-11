import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const reliquaryDir = scriptDir;
const publicUiDir = path.resolve(scriptDir, "../../../../../public/eltania/ui");

test("Aspect tree background image asset exists in client public directory", async () => {
  const treeImgPath = path.join(publicUiDir, "aspects_tree_bg.jpg");
  const stat = await fs.stat(treeImgPath);
  assert.ok(stat.isFile() && stat.size > 10000, "Aspect tree background image aspects_tree_bg.jpg missing or invalid");
});

test("AspectsWindow renders cosmic constellation talent tree", async () => {
  const aspectsTsxPath = path.join(reliquaryDir, "aspects-window.tsx");
  const cssPath = path.join(reliquaryDir, "reliquary.css");
  const aspectsTsx = await fs.readFile(aspectsTsxPath, "utf8");
  const cssContent = await fs.readFile(cssPath, "utf8");

  assert.ok(aspectsTsx.includes("rq-wow-talent-panel"), "rq-wow-talent-panel wrapper missing");
  assert.ok(cssContent.includes("/eltania/ui/aspects_tree_bg.jpg"), "Aspect tree background image CSS reference missing");
  assert.ok(aspectsTsx.includes("rq-wow-node"), "rq-wow-node class missing");
  assert.ok(aspectsTsx.includes("Reset Talents"), "Reset Talents respec button missing");
});
