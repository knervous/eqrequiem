import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Entity, EntityKind, NPC, PC } from "./entity-store.js";
import { ZoneSimulationKernel } from "./zone-kernel.js";

describe("precompiled zone simulation kernel", () => {
  for (const build of ["debug", "release"] as const) {
    it(`ticks dense NPC SoA state with the ${build} kernel`, async () => {
      const kernel = await ZoneSimulationKernel.load(build);
      kernel.spawnNpc(0, 1001, 0, 0, 0, 4);
      kernel.setNpcTarget(0, 10, 0, 0);

      const snapshot = kernel.tick(1, 250);
      assert.equal(snapshot.state.entityId[0], 1001);
      assert.equal(snapshot.state.stateKind[0], EntityKind.npc);
      assert.equal(snapshot.dirtyIndices[0], 0);
      assert.equal(snapshot.state.statePosition[0], 1);
      assert.equal(snapshot.state.stateVelocity[0], 4);
      assert.equal(snapshot.state.stateMovementState[0], 1);
      assert.strictEqual(snapshot.netPayload, kernel.entities.netPayload());
      assert.strictEqual(snapshot.state.bytes.buffer, snapshot.netPayload.buffer);
    });
  }

  it("models PC and NPC subclasses as dirty-aware handles over one net arena", async () => {
    const kernel = await ZoneSimulationKernel.load("debug");
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
});
