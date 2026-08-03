import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OP } from "../protocol/opcodes.js";
import {
  decodeSidecar,
  encodeSidecar,
  SIDECAR_SCHEMA,
} from "../protocol/sidecar-codec.js";
import { viewWorldStatePacket } from "../protocol/world-state.js";
import type {
  BackendEvent,
  BackendEventDelivery,
  BackendRequest,
  GameBackend,
} from "./contracts.js";
import { encodeEvent, GameBackendPacketAdapter } from "./packet-adapter.js";

class RecordingBackend implements GameBackend {
  request: BackendRequest | null = null;
  disconnectedSession: number | null = null;
  closed = false;
  listener: ((delivery: BackendEventDelivery) => void) | null = null;

  initialize(): Promise<void> {
    return Promise.resolve();
  }
  connect(): Promise<BackendEvent[]> {
    return Promise.resolve([]);
  }
  disconnect(sessionId: number): Promise<void> {
    this.disconnectedSession = sessionId;
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
  handle(_sessionId: number, request: BackendRequest): Promise<BackendEvent[]> {
    this.request = request;
    return Promise.resolve([
      {
        type: "level_update",
        value: { level: 12, exp: 0 },
        transport: "control-stream",
      },
    ]);
  }
  subscribe(listener: (delivery: BackendEventDelivery) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
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
      decodeSidecar(
        SIDECAR_SCHEMA.LEVEL,
        output[0]?.payload ?? new Uint8Array(),
      ),
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

  it("decodes movement and forwards tick-driven Shado packets", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);
    await adapter.receive(4, {
      opcode: OP.CLIENT_UPDATE,
      transport: "datagram",
      payload: encodeSidecar(SIDECAR_SCHEMA.CLIENT_POSITION, {
        x: 1,
        y: 2,
        z: 3,
        heading: 4,
      }),
    });
    assert.deepEqual(backend.request, {
      type: "client_update",
      x: 1,
      y: 2,
      z: 3,
      heading: 4,
    });

    const payload = encodeEvent({
      type: "zone_spawns",
      value: { spawns: [{ spawnId: 20, x: 1, y: 2, z: 3 }] },
    }).payload;
    let pushed:
      | { sessionIds: readonly number[]; opcode: number; payload: Uint8Array }
      | undefined;
    adapter.onPacket((sessionIds, packet) => {
      pushed = { sessionIds, opcode: packet.opcode, payload: packet.payload };
    });
    backend.listener?.({
      sessionIds: [4],
      event: {
        type: "render_snapshot",
        value: { payload },
        transport: "control-stream",
      },
    });

    assert.deepEqual(pushed?.sessionIds, [4]);
    assert.equal(pushed?.opcode, OP.RENDER_SNAPSHOT);
    assert.equal(
      viewWorldStatePacket(pushed?.payload ?? new Uint8Array())?.state
        .entityId[0],
      20,
    );
  });

  it("encodes dev-only NPC pursuit diagnostics", () => {
    const packet = encodeEvent({
      type: "npc_debug_state",
      value: {
        npcId: 20,
        tick: 50,
        engaged: true,
        aggroTargetId: 10,
      },
      transport: "control-stream",
    });
    assert.equal(packet.opcode, OP.NPC_DEBUG_STATE);
    assert.deepEqual(
      decodeSidecar(SIDECAR_SCHEMA.NPC_DEBUG_STATE, packet.payload),
      {
        npcId: 20,
        tick: 50,
        engaged: true,
        aggroTargetId: 10,
      },
    );
  });

  it("preserves a reliable zone transition destination for persistence", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);
    await adapter.receive(4, {
      opcode: OP.REQUEST_CLIENT_ZONE_CHANGE,
      transport: "control-stream",
      payload: encodeSidecar(SIDECAR_SCHEMA.ZONE_CHANGE, {
        zoneId: 2,
        instanceId: 3,
        useSafeLocation: true,
        x: 10,
        y: 20,
        z: 30,
        heading: Math.PI,
      }),
    });
    assert.deepEqual(backend.request, {
      type: "zone_change",
      zoneId: 2,
      instanceId: 3,
      useSafeLocation: true,
      x: 10,
      y: 20,
      z: 30,
      heading: Math.PI,
    });
  });

  it("decodes auto-attack intent and encodes authoritative combat events", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);
    await adapter.receive(4, {
      opcode: OP.AUTO_ATTACK,
      transport: "control-stream",
      payload: encodeSidecar(SIDECAR_SCHEMA.AUTO_ATTACK, {
        enabled: true,
        targetId: 20,
      }),
    });
    assert.deepEqual(backend.request, {
      type: "auto_attack",
      enabled: true,
      targetId: 20,
    });

    const event = {
      tick: 10,
      attackerId: 4,
      targetId: 20,
      outcome: "hit",
      swingSequence: 1,
      damage: 7,
      targetCurrentHp: 13,
      targetMaximumHp: 20,
      killed: false,
    };
    const packet = encodeEvent({
      type: "combat_event",
      value: event,
      transport: "control-stream",
    });
    assert.equal(packet.opcode, OP.COMBAT_EVENT);
    assert.deepEqual(
      decodeSidecar(SIDECAR_SCHEMA.COMBAT_EVENT, packet.payload),
      event,
    );
  });

  it("decodes corpse loot intents and encodes loot windows", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);
    await adapter.receive(4, {
      opcode: OP.LOOT_REQUEST,
      transport: "control-stream",
      payload: encodeSidecar(SIDECAR_SCHEMA.LOOT_REQUEST, { corpseId: 20 }),
    });
    assert.deepEqual(backend.request, {
      type: "loot_request",
      corpseId: 20,
    });
    await adapter.receive(4, {
      opcode: OP.LOOT_ITEM,
      transport: "control-stream",
      payload: encodeSidecar(SIDECAR_SCHEMA.LOOT_ITEM, {
        corpseId: 20,
        lootSlot: 1,
      }),
    });
    assert.deepEqual(backend.request, {
      type: "loot_item",
      corpseId: 20,
      lootSlot: 1,
    });

    const packet = encodeEvent({
      type: "loot_window",
      value: {
        corpseId: 20,
        corpseName: "Guard",
        items: [{ itemId: 100, slot: 1 }],
      },
      transport: "control-stream",
    });
    assert.equal(packet.opcode, OP.LOOT_WINDOW);
    assert.deepEqual(
      decodeSidecar(SIDECAR_SCHEMA.LOOT_WINDOW, packet.payload),
      {
        corpseId: 20,
        corpseName: "Guard",
        items: [{ itemId: 100, slot: 1 }],
      },
    );
  });

  it("decodes merchant intents and encodes server-owned quotes", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);
    await adapter.receive(4, {
      opcode: OP.MERCHANT_BUY,
      transport: "control-stream",
      payload: encodeSidecar(SIDECAR_SCHEMA.MERCHANT_BUY, {
        npcId: 20,
        merchantSlot: 7,
        quantity: 2,
      }),
    });
    assert.deepEqual(backend.request, {
      type: "merchant_buy",
      npcId: 20,
      merchantSlot: 7,
      quantity: 2,
    });
    const packet = encodeEvent({
      type: "merchant_window",
      value: {
        npcId: 20,
        merchantName: "Kane",
        currencyCopper: 500,
        items: [{ merchantSlot: 7, itemId: 100, unitPrice: 12 }],
      },
      transport: "control-stream",
    });
    assert.equal(packet.opcode, OP.MERCHANT_WINDOW);
    assert.deepEqual(
      decodeSidecar(SIDECAR_SCHEMA.MERCHANT_WINDOW, packet.payload),
      {
        npcId: 20,
        merchantName: "Kane",
        currencyCopper: 500,
        items: [{ merchantSlot: 7, itemId: 100, unitPrice: 12 }],
      },
    );
  });

  it("disconnects the session before releasing backend storage", async () => {
    const backend = new RecordingBackend();
    const adapter = new GameBackendPacketAdapter(backend);

    await adapter.close(7);

    assert.equal(backend.disconnectedSession, 7);
    assert.equal(backend.closed, true);
  });
});
