import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  encodeWorldSpawnBatch,
  encodeWorldStatePacket,
  readWorldSpawn,
  viewWorldStatePacket,
  WORLD_STATE_FLAGS,
} from "./world-state.js";
import { createRenderSnapshotNetBatch } from "./generated/net-structs.js";

describe("Shado world state transport", () => {
  it("ships public SoA planes with a compact UTF-8 sidecar", () => {
    const bytes = encodeWorldSpawnBatch([{
      id: 9001,
      spawnId: 42,
      name: "Guard Gehnus",
      modelKey: "hum_chr",
      level: 12,
      race: 1,
      gender: 0,
      charClass: 1,
      bodytype: 1,
      size: 6,
      x: 10,
      y: 20,
      z: 30,
      heading: 1.25,
      equipment: { chest: 3, primary: 10609, secondary: 0 },
    }], 7);
    const packet = viewWorldStatePacket(bytes);
    assert.ok(packet);
    assert.equal(packet.full, true);
    assert.equal(packet.revision, 7);
    assert.equal(packet.state.statePosition[2], 30);
    assert.equal(packet.state.statePrimary[0], 10609);
    assert.deepEqual(readWorldSpawn(packet.state, packet.sidecar, 0), {
      id: 9001,
      spawnId: 42,
      name: "Guard Gehnus",
      level: 12,
      race: 1,
      gender: 0,
      modelKey: "hum_chr",
      size: 6,
      face: 0,
      helm: 0,
      equipChest: 3,
      charClass: 1,
      bodytype: 1,
      x: 10,
      y: 20,
      z: 30,
      heading: 1.25,
      equipment: { head: 0, chest: 3, primary: 10609, secondary: 0 },
      isNpc: true,
    });
  });

  it("keeps private reducer fields outside delta packets", () => {
    const state = createRenderSnapshotNetBatch(1);
    state.entityId[0] = 4;
    const packet = viewWorldStatePacket(
      encodeWorldStatePacket(state, new Uint8Array(), WORLD_STATE_FLAGS.DELTA, 9),
    );
    assert.ok(packet);
    assert.equal(packet.full, false);
    assert.equal("stateServerFlags" in packet.state, false);
    assert.equal("stateCombatTimer" in packet.state, false);
    assert.equal("stateAggroTarget" in packet.state, false);
  });
});
