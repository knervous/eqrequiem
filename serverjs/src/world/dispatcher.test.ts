import { strict as assert } from "node:assert";
import test from "node:test";

import { OP } from "../protocol/opcodes.js";
import { encodeSidecar, SIDECAR_SCHEMA } from "../protocol/sidecar-codec.js";
import type { PersistService } from "../persist/index.js";
import type { Logger } from "../shared/logger.js";
import { WorldDispatcher, type GatewayMessenger } from "./dispatcher.js";

class TestMessenger implements GatewayMessenger {
  datagrams: Array<{
    sessionId: number;
    opcode: number;
    payload: Uint8Array | undefined;
  }> = [];
  streams: Array<{
    sessionId: number;
    opcode: number;
    payload: Uint8Array | undefined;
  }> = [];

  sendDatagram(
    sessionId: number,
    opcode: number,
    payload?: Uint8Array,
  ): Promise<void> {
    this.datagrams.push({ sessionId, opcode, payload });
    return Promise.resolve();
  }

  sendStream(
    sessionId: number,
    opcode: number,
    payload?: Uint8Array,
  ): Promise<void> {
    this.streams.push({ sessionId, opcode, payload });
    return Promise.resolve();
  }
}

function createLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function createPersistMock(): PersistService {
  return {
    loginLoad: () => Promise.resolve({ accountId: 1, characters: [] }),
    createCharacter: (_accountId: number, name: string) =>
      Promise.resolve({ ok: true, characters: [{ name, level: 1 }] }),
    deleteCharacter: () => Promise.resolve({ ok: true, characters: [] }),
    moveItem: () => Promise.resolve({ ok: true }),
    deleteItem: () => Promise.resolve({ ok: true }),
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  } as unknown as PersistService;
}

void test("world dispatcher enforces auth gate and forwards only after zoning", async () => {
  const dispatcher = new WorldDispatcher(createLogger(), createPersistMock());
  const messenger = new TestMessenger();
  dispatcher.setMessenger(messenger);
  dispatcher.onSessionConnected(1, "127.0.0.1");

  const unauthResult = dispatcher.handleInbound({
    sessionId: 1,
    transport: "datagram",
    opcode: OP.CLIENT_UPDATE,
    payload: new Uint8Array(),
  });
  assert.equal(unauthResult.forwardToZone, false);

  const loginResult = dispatcher.handleInbound({
    sessionId: 1,
    transport: "datagram",
    opcode: OP.JWT_LOGIN,
    payload: encodeSidecar(SIDECAR_SCHEMA.JWT_LOGIN, { token: "token-1" }),
  });
  assert.equal(loginResult.forwardToZone, false);

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    messenger.datagrams.some((d) => d.opcode === OP.JWT_RESPONSE),
    true,
  );
  assert.equal(
    messenger.streams.some((s) => s.opcode === OP.SEND_CHAR_INFO),
    true,
  );

  const noZoneResult = dispatcher.handleInbound({
    sessionId: 1,
    transport: "datagram",
    opcode: OP.CLIENT_UPDATE,
    payload: new Uint8Array(),
  });
  assert.equal(noZoneResult.forwardToZone, false);

  dispatcher.handleInbound({
    sessionId: 1,
    transport: "datagram",
    opcode: OP.ZONE_SESSION,
    payload: encodeSidecar(SIDECAR_SCHEMA.ZONE_SESSION, {
      zoneId: 2,
      instanceId: 7,
    }),
  });

  dispatcher.handleInbound({
    sessionId: 1,
    transport: "datagram",
    opcode: OP.ENTER_WORLD,
    payload: encodeSidecar(SIDECAR_SCHEMA.ENTER_WORLD, { name: "Kjeldor" }),
  });

  const routed = dispatcher.handleInbound({
    sessionId: 1,
    transport: "datagram",
    opcode: OP.REQUEST_CLIENT_ZONE_CHANGE,
    payload: encodeSidecar(SIDECAR_SCHEMA.ZONE_CHANGE, { type: 0 }),
  });

  assert.equal(routed.forwardToZone, true);
  assert.equal(routed.zoneId, 2);
  assert.equal(routed.instanceId, 7);
  assert.equal(routed.characterName, "Kjeldor");
});

void test("world dispatcher handles character create and delete bookkeeping", async () => {
  const dispatcher = new WorldDispatcher(createLogger(), createPersistMock());
  const messenger = new TestMessenger();
  dispatcher.setMessenger(messenger);
  dispatcher.onSessionConnected(2, "127.0.0.2");

  dispatcher.handleInbound({
    sessionId: 2,
    transport: "datagram",
    opcode: OP.JWT_LOGIN,
    payload: encodeSidecar(SIDECAR_SCHEMA.JWT_LOGIN, { token: "token-2" }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  dispatcher.handleInbound({
    sessionId: 2,
    transport: "datagram",
    opcode: OP.CHARACTER_CREATE,
    payload: encodeSidecar(SIDECAR_SCHEMA.CHARACTER_CREATE, {
      name: "Pauladin",
    }),
  });

  dispatcher.handleInbound({
    sessionId: 2,
    transport: "datagram",
    opcode: OP.DELETE_CHARACTER,
    payload: encodeSidecar(SIDECAR_SCHEMA.STRING, { value: "Pauladin" }),
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const approvePackets = messenger.datagrams.filter(
    (packet) => packet.opcode === OP.APPROVE_NAME_SERVER,
  );
  assert.equal(approvePackets.length, 1);

  const charInfoPackets = messenger.streams.filter(
    (packet) => packet.opcode === OP.SEND_CHAR_INFO,
  );
  assert.equal(charInfoPackets.length >= 2, true);
});
