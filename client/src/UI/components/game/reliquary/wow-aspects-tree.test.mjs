import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const reliquaryDir = scriptDir;

test("AspectsWindow exports WoW-style dual talent tree system", async () => {
  const aspectsTsxPath = path.join(reliquaryDir, "aspects-window.tsx");
  const cssPath = path.join(reliquaryDir, "reliquary.css");
  const aspectsTsx = await fs.readFile(aspectsTsxPath, "utf8");
  const cssContent = await fs.readFile(cssPath, "utf8");

  assert.ok(aspectsTsx.includes("rq-wow-talent-panel"), "rq-wow-talent-panel class missing");
  assert.ok(aspectsTsx.includes("rq-dual-trees"), "rq-dual-trees class missing");
  assert.ok(aspectsTsx.includes("rq-talent-tree-col"), "rq-talent-tree-col class missing");
  assert.ok(aspectsTsx.includes("rq-wow-node"), "rq-wow-node class missing");
  assert.ok(cssContent.includes(".rq-dual-trees"), "rq-dual-trees CSS rule missing");
});
