import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyClientMovement } from "./client-movement.js";
import { EntityKind } from "./entity-store.js";
import { loadZoneSimulationKernel } from "./zone-kernel-node.js";

describe("client SoA movement", () => {
  it("writes position, velocity, heading, and movement state into the shared arena", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const pc = kernel.entities.spawnPC({ id: 7001, x: 1, y: 2, z: 3 });
    kernel.tick(50);

    applyClientMovement(
      pc,
      { x: 1, y: 2, z: 3, heading: 0 },
      { x: 11, y: 2, z: -2, heading: 1.25 },
      500,
    );
    const snapshot = kernel.tick(50);

    assert.deepEqual(Array.from(snapshot.dirtyIndices), [pc.index]);
    assert.equal(snapshot.state.stateKind[pc.index], EntityKind.pc);
    assert.deepEqual(
      Array.from(snapshot.state.statePosition.subarray(pc.index * 3, pc.index * 3 + 3)),
      [11, 2, -2],
    );
    assert.deepEqual(
      Array.from(snapshot.state.stateVelocity.subarray(pc.index * 3, pc.index * 3 + 3)),
      [20, 0, -10],
    );
    assert.equal(snapshot.state.stateHeading[pc.index], 1.25);
    const orientation = pc.index * 4;
    assert.ok(
      Math.abs(snapshot.state.stateOrientation[orientation + 1]! - Math.sin(1.25 * 0.5))
        < 1e-6,
    );
    assert.ok(
      Math.abs(snapshot.state.stateOrientation[orientation + 3]! - Math.cos(1.25 * 0.5))
        < 1e-6,
    );
    assert.equal(snapshot.state.stateMovementState[pc.index], 1);
  });
});
