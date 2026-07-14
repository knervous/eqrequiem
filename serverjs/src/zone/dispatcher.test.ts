import { strict as assert } from "node:assert";
import test from "node:test";

import { OP } from "../protocol/opcodes.js";
import type { Logger } from "../shared/logger.js";
import { ZoneDispatcher } from "./dispatcher.js";

function createLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

void test("zone dispatcher accepts known opcodes and rejects unknown", () => {
  const dispatcher = new ZoneDispatcher(createLogger());

  const known = dispatcher.handleInbound(
    {
      sessionId: 7,
      transport: "datagram",
      opcode: OP.CLIENT_UPDATE,
      payload: new Uint8Array(),
    },
    2,
    1,
  );

  const unknown = dispatcher.handleInbound(
    {
      sessionId: 7,
      transport: "datagram",
      opcode: 65500,
      payload: new Uint8Array(),
    },
    2,
    1,
  );

  assert.equal(known, true);
  assert.equal(unknown, false);
});
