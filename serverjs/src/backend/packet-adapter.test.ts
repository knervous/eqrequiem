import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OP } from "../protocol/opcodes.js";
import { decodeSidecar, encodeSidecar, SIDECAR_SCHEMA } from "../protocol/sidecar-codec.js";
import { viewWorldStatePacket } from "../protocol/world-state.js";
import type { BackendEvent, BackendRequest, GameBackend } from "./contracts.js";
import { encodeEvent, GameBackendPacketAdapter } from "./packet-adapter.js";

class RecordingBackend implements GameBackend {
  request: BackendRequest | null = null;

  initialize(): Promise<void> { return Promise.resolve(); }
  connect(): Promise<BackendEvent[]> { return Promise.resolve([]); }
  disconnect(): Promise<void> { return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
  handle(_sessionId: number, request: BackendRequest): Promise<BackendEvent[]> {
    this.request = request;
    return Promise.resolve([{
      type: "level_update",
      value: { level: 12, exp: 0 },
      transport: "control-stream",
    }]);
  }
}

describe("game backend packet adapter", () => {
  it("is the shared protocol boundary for worker and network transports", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);
    const output = await adapter.receive(4, {
      opcode: OP.GM_COMMAND,
      transport: "datagram",
      payload: encodeSidecar(SIDECAR_SCHEMA.COMMAND, {
        command: "level",
        args: ["12"],
      }),
    });
    assert.deepEqual(backend.request, {
      type: "gm_command",
      command: "level",
      args: ["12"],
    });
    assert.equal(output[0]?.opcode, OP.LEVEL_UPDATE);
    assert.equal(output[0]?.transport, "control-stream");
    assert.deepEqual(
      decodeSidecar(SIDECAR_SCHEMA.LEVEL, output[0]?.payload ?? new Uint8Array()),
      { level: 12, exp: 0 },
    );
  });

  it("encodes offline spawn hydration as a full world-state packet", () => {
    const packet = encodeEvent({
      type: "zone_spawns",
      value: {
        spawns: [{ id: 10, spawnId: 20, name: "Guard", x: 1, y: 2, z: 3 }],
      },
      transport: "control-stream",
    });
    const world = viewWorldStatePacket(packet.payload);
    assert.equal(packet.opcode, OP.BATCH_ZONE_SPAWNS);
    assert.equal(packet.transport, "control-stream");
    assert.equal(world?.full, true);
    assert.equal(world?.state.entityId[0], 20);
  });
});
