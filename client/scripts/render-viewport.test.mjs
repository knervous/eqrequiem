import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeRenderViewport } from "../src/Game/Manager/render-viewport.ts";

test("normalizes CSS viewport bounds independently of backing-buffer size", () => {
  assert.deepEqual(
    normalizeRenderViewport(
      { x: 0, y: 0, width: 1600, height: 900 },
      { x: 0, y: 0, width: 1600, height: 900 },
    ),
    { x: 0, y: 0, width: 1, height: 1 },
  );
  const inset = normalizeRenderViewport(
    { x: 300, y: 200, width: 600, height: 300 },
    { x: 100, y: 50, width: 1000, height: 500 },
  );
  assert.ok(Math.abs(inset.x - 0.2) < 1e-12);
  assert.ok(Math.abs(inset.y - 0.1) < 1e-12);
  assert.ok(Math.abs(inset.width - 0.6) < 1e-12);
  assert.ok(Math.abs(inset.height - 0.6) < 1e-12);
});

test("clamps viewport bounds and safely handles an unlaid-out canvas", () => {
  assert.deepEqual(
    normalizeRenderViewport(
      { x: -100, y: -100, width: 2000, height: 1200 },
      { x: 0, y: 0, width: 1600, height: 900 },
    ),
    { x: 0, y: 0, width: 1, height: 1 },
  );
  assert.deepEqual(
    normalizeRenderViewport(
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 0 },
    ),
    { x: 0, y: 0, width: 1, height: 1 },
  );
});

test("render lifecycle owns initial and CSS-driven backing-buffer synchronization", async () => {
  const [manager, wrapper, worldSceneLayer] = await Promise.all([
    readFile(
      new URL("../src/Game/Manager/game-manager.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/Core/babylon.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/Game/Zone/shado-world-scene-layer.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(manager, /this\.engine\.resize\(true\)/);
  assert.match(manager, /this\.applyPrimaryViewport\(\)/);
  assert.match(manager, /await navigator\.gpu\.requestAdapter\(\)/);
  assert.match(manager, /WebGPU initialization failed; using WebGL/);
  assert.match(wrapper, /new ResizeObserver\(GameManager\.instance\.resize\)/);
  assert.match(wrapper, /GameManager\.instance\.resize\(\)/);
  assert.doesNotMatch(worldSceneLayer, /reduceWorld\(/);
  assert.doesNotMatch(worldSceneLayer, /chunk\.setIndices\(/);
  assert.match(worldSceneLayer, /validateRenderChunks\(world, chunks\)/);
});
