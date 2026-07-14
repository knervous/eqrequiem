import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRenderSnapshotNetBatch,
  encodeDeleteItemNet,
  encodeMoveItemNet,
  encodeZoneSessionNet,
  NET_HEADER_BYTES,
  RENDER_SNAPSHOT_NET_STRIDE,
} from "./generated/net-structs.js";
import {
  decodeDeleteItemRequest,
  decodeMoveItemRequest,
  decodeZoneRouteRequest,
  encodeInteger,
} from "./game-codec.js";

describe("Shado game codec", () => {
  it("decodes generated fixed-size request messages", () => {
    assert.deepEqual(
      decodeZoneRouteRequest(
        encodeZoneSessionNet({ zoneId: 202, instanceId: 7 }),
      ),
      {
        zoneId: 202,
        instanceId: 7,
      },
    );
    assert.deepEqual(
      decodeMoveItemRequest(
        encodeMoveItemNet({ fromSlot: 1, toSlot: 2, fromBag: -1, toBag: 3 }),
      ),
      { fromSlot: 1, toSlot: 2, fromBag: -1, toBag: 3 },
    );
    assert.deepEqual(
      decodeDeleteItemRequest(encodeDeleteItemNet({ slot: 9, bag: -1 })),
      { slot: 9, bag: -1 },
    );
  });

  it("can select Shado for outbound integer messages", () => {
    const payload = encodeInteger(42);
    assert.equal(
      new DataView(payload.buffer, payload.byteOffset).getUint16(0, true),
      0x5348,
    );
  });

  it("keeps snapshot batches as directly shareable record memory", () => {
    const backing = new SharedArrayBuffer(
      NET_HEADER_BYTES + 2 * RENDER_SNAPSHOT_NET_STRIDE,
    );
    const batch = createRenderSnapshotNetBatch(2, new Uint8Array(backing));
    batch.entityId[0] = 42;
    batch.stateKind[0] = 2;
    batch.statePosition.set([1, 2, 3]);
    batch.stateOrientation.set([0, 0, 0, 1]);
    batch.stateVelocity.set([4, 5, 6]);
    batch.stateAnimation[0] = 7;
    batch.stateMovementState[0] = 8;
    batch.stateAppearance[0] = 9;

    assert.equal(batch.payload.buffer, backing);
    assert.equal(batch.payload.byteOffset, NET_HEADER_BYTES);
    assert.equal(batch.payload.byteLength, 2 * RENDER_SNAPSHOT_NET_STRIDE);
    assert.equal(batch.entityId[0], 42);
    assert.deepEqual(Array.from(batch.statePosition.slice(0, 3)), [1, 2, 3]);
  });
});
