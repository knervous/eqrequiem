import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Entity, EntityKind, NPC, PC } from "./entity-store.js";
import { loadZoneSimulationKernel } from "./zone-kernel-node.js";

describe("precompiled zone simulation kernel", () => {
  for (const build of ["debug", "release"] as const) {
    it(`ticks dense NPC SoA state with the ${build} kernel`, async () => {
      const kernel = await loadZoneSimulationKernel(build);
      kernel.spawnNpc(0, 1001, 0, 0, 0, 4);
      kernel.setNpcTarget(0, 10, 0, 0);

      const snapshot = kernel.tick(1, 250);
      assert.equal(snapshot.state.entityId[0], 1001);
      assert.equal(snapshot.state.stateKind[0], EntityKind.npc);
      assert.equal(snapshot.dirtyIndices[0], 0);
      assert.equal(snapshot.state.statePosition[0], 1);
      assert.equal(snapshot.state.stateVelocity[0], 4);
      assert.equal(snapshot.state.stateMovementState[0], 1);
      assert.ok(Math.abs(snapshot.state.stateHeading[0]!) < 1e-6);
      assert.ok(Math.abs(snapshot.state.stateOrientation[0]!) < 1e-6);
      assert.ok(Math.abs(snapshot.state.stateOrientation[1]!) < 1e-6);
      assert.ok(Math.abs(snapshot.state.stateOrientation[2]!) < 1e-6);
      assert.ok(Math.abs(snapshot.state.stateOrientation[3]! - 1) < 1e-6);
      assert.strictEqual(snapshot.netPayload, kernel.entities.netPayload());
      assert.strictEqual(snapshot.state.bytes.buffer, snapshot.netPayload.buffer);
    });
  }

  it("maps cardinal NPC motion to Babylon yaw for +X-forward models", async () => {
    const cases = [
      { target: [10, 0, 0], expected: 0 },
      { target: [0, 0, -10], expected: Math.PI / 2 },
      { target: [-10, 0, 0], expected: Math.PI },
      { target: [0, 0, 10], expected: -Math.PI / 2 },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const kernel = await loadZoneSimulationKernel("debug");
      kernel.spawnNpc(0, 3000 + index, 0, 0, 0, 1);
      kernel.setNpcTarget(
        0,
        testCase.target[0],
        testCase.target[1],
        testCase.target[2],
      );
      const snapshot = kernel.tick(100);
      const heading = snapshot.state.stateHeading[0]!;
      const difference = Math.atan2(
        Math.sin(heading - testCase.expected),
        Math.cos(heading - testCase.expected),
      );
      assert.ok(Math.abs(difference) < 1e-6);
      const orientation = snapshot.state.stateOrientation;
      assert.ok(Math.abs(orientation[0]!) < 1e-6);
      assert.ok(Math.abs(orientation[1]! - Math.sin(heading * 0.5)) < 1e-6);
      assert.ok(Math.abs(orientation[2]!) < 1e-6);
      assert.ok(Math.abs(orientation[3]! - Math.cos(heading * 0.5)) < 1e-6);
    }
  });

  it("models PC and NPC subclasses as dirty-aware handles over one net arena", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const npc = kernel.entities.spawnNPC({ id: 2001, x: 1, y: 2, z: 3, speed: 5 });
    const pc = kernel.entities.spawnPC({ id: 2002, x: 4, y: 5, z: 6 });

    assert.ok(npc instanceof Entity);
    assert.ok(npc instanceof NPC);
    assert.ok(pc instanceof PC);
    assert.strictEqual(kernel.entities.get(2001), npc);
    assert.deepEqual(Array.from(npc.position.typedArrays()[0] ?? []), [1, 2, 3]);

    npc.target.set(11, 2, 3);
    npc.aggroTargetId = 9001;
    npc.serverFlags = 0x10;
    pc.position.x = 9;
    pc.appearance = 42;
    const snapshot = kernel.tick(2, 200);

    assert.deepEqual(Array.from(snapshot.dirtyIndices), [0, 1]);
    assert.equal(snapshot.state.statePosition[3], 9);
    assert.equal(snapshot.state.stateAppearance[1], 42);
    assert.equal(npc.position.x, 2);
    assert.equal(npc.target.x, 11);
    assert.equal(npc.aggroTargetId, 9001);
    assert.equal(npc.serverFlags, 0x10);
  });

  it("emits one final stopped update and does not dirty stationary NPCs", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    kernel.spawnNpc(0, 3001, 0, 0, 0, 4);
    kernel.setNpcTarget(0, 1, 0, 0);

    const arrived = kernel.tick(1, 250);
    assert.deepEqual(Array.from(arrived.dirtyIndices), [0]);
    assert.equal(arrived.state.statePosition[0], 1);
    assert.equal(arrived.state.stateMovementState[0], 1);

    const stopped = kernel.tick(1, 50);
    assert.deepEqual(Array.from(stopped.dirtyIndices), [0]);
    assert.equal(stopped.state.stateVelocity[0], 0);
    assert.equal(stopped.state.stateMovementState[0], 0);
    assert.equal(kernel.tick(1, 50).dirtyIndices.length, 0);

    kernel.spawnNpc(1, 3002, 0, 0, 0, 0);
    kernel.setNpcTarget(1, 10, 0, 0);
    assert.deepEqual(Array.from(kernel.tick(2, 50).dirtyIndices), [1]);
    assert.equal(kernel.tick(2, 50).dirtyIndices.length, 0);
  });
});
