import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const reliquaryDir = path.resolve(scriptDir, "../reliquary");

test("Techniques window exports draggable ability rows with technique action data", async () => {
  const techniquesTsxPath = path.join(reliquaryDir, "techniques.tsx");
  const techniquesTsx = await fs.readFile(techniquesTsxPath, "utf8");

  assert.ok(techniquesTsx.includes("useImmediateDragClone"), "useImmediateDragClone drag hook missing in techniques.tsx");
  assert.ok(techniquesTsx.includes("ActionButtonType.TECHNIQUE"), "ActionButtonType.TECHNIQUE type missing");
  assert.ok(techniquesTsx.includes("rq-technique--draggable"), "rq-technique--draggable class missing");
  assert.ok(techniquesTsx.includes("rq-aspect-node--draggable"), "rq-aspect-node--draggable class missing");
});

test("Reliquary HUD supports multi-bar deck rendering and row controls", async () => {
  const indexTsxPath = path.join(reliquaryDir, "index.tsx");
  const indexTsx = await fs.readFile(indexTsxPath, "utf8");

  assert.ok(indexTsx.includes("rq-hotbar-deck"), "rq-hotbar-deck wrapper missing in index.tsx");
  assert.ok(indexTsx.includes("visibleBars"), "visibleBars state missing for multi-hotbar rendering");
  assert.ok(indexTsx.includes("rq-hotbar-deck__rows-toggle"), "Hotbar rows toggle control missing");
  assert.ok(indexTsx.includes("+ Bar"), "Add bar button missing");
  assert.ok(indexTsx.includes("- Bar"), "Remove bar button missing");
});
