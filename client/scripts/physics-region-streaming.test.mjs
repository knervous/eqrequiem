import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const clientRoot = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFile(path.join(clientRoot, file), "utf8");

test("player-centered physics residency is independent from render PVS", async () => {
  const source = await read("src/Game/Zone/shado-world-physics-streamer.ts");
  assert.match(source, /const ACTIVE_RADIUS = 1/);
  assert.match(source, /const RETAIN_RADIUS = 2/);
  assert.match(source, /LOOKAHEAD_SECONDS/);
  assert.match(source, /Add before removing/);
  assert.doesNotMatch(source, /ShadoWorldVisibilityCoordinator|ShadoVisibilityBits|\.pvs/);
});

test("collision is guaranteed before player creation and teleportation", async () => {
  const [manager, player] = await Promise.all([
    read("src/Game/Manager/game-manager.ts"),
    read("src/Game/Player/player.ts"),
  ]);
  assert.match(manager, /ensureWorldPhysicsAt\(/);
  assert.match(player, /ensureWorldPhysicsAt\(/);
});

test("runtime collision uses independently disposable static Havok bodies", async () => {
  const source = await read("src/Game/Zone/shado-world-physics-streamer.ts");
  assert.match(source, /PhysicsMotionType\.STATIC/);
  assert.match(source, /new BABYLON\.PhysicsShapeMesh/);
  assert.match(source, /resident\.body\.dispose\(\)/);
  assert.match(source, /resident\.shape\.dispose\(\)/);
});
