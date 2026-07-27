import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadZoneSimulationKernel } from "./zone-kernel-node.js";
import { advanceMovementRoute, type MovementRoute } from "./movement-routes.js";

describe("NPC movement routes", () => {
  it("holds an arrived NPC until the elapsed-time pause expires", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const npc = kernel.spawnNpc(0, 100, 0, 0, 0, 5);
    const route: MovementRoute = {
      points: [
        { x: 0, y: 0, z: 0, heading: 0, pauseSeconds: 1 },
        { x: 10, y: 0, z: 0, heading: 0, pauseSeconds: 0 },
      ],
      targetIndex: 0,
      pauseUntilMs: 0,
    };

    advanceMovementRoute(npc, route, 250);
    assert.equal(route.targetIndex, 1);
    assert.equal(route.pauseUntilMs, 1250);
    assert.deepEqual([npc.target.x, npc.target.y, npc.target.z], [0, 0, 0]);

    advanceMovementRoute(npc, route, 1249);
    assert.equal(npc.target.x, 0);
    advanceMovementRoute(npc, route, 1250);
    assert.equal(route.pauseUntilMs, 0);
    assert.equal(npc.target.x, 10);
  });

  it("advances immediately through a waypoint without a pause", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const npc = kernel.spawnNpc(0, 101, 0, 0, 0, 5);
    const route: MovementRoute = {
      points: [
        { x: 0, y: 0, z: 0, heading: 0, pauseSeconds: 0 },
        { x: 0, y: 0, z: 10, heading: 0, pauseSeconds: 0 },
      ],
      targetIndex: 0,
      pauseUntilMs: 0,
    };

    advanceMovementRoute(npc, route, 100);
    assert.equal(route.targetIndex, 1);
    assert.equal(npc.target.z, 10);
  });
});
