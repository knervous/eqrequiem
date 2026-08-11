import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const gameUiPath = path.resolve(scriptDir, "../index.tsx");

test("Dev tools window is unconditionally rendered whenever devWindow.visible is true", async () => {
  const content = await fs.readFile(gameUiPath, "utf8");

  // Verify !inEditor gate has been removed
  assert.ok(!content.includes("!inEditor"), "!inEditor restriction should be removed from GameUIComponent");
  assert.ok(content.includes("{devWindowVisible ?"), "devWindowVisible condition missing");
});
