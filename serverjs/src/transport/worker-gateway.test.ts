import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { InboundPacket } from "../protocol/index.js";
import { WorkerClientTransport } from "./worker-client.js";
import { WorkerGatewayService } from "./worker-gateway.js";
import type { GamePacketRouter } from "./game-transport.js";
import type {
  WorkerMessagePort,
  WorkerTransportMessage,
} from "./worker-protocol.js";

class TestPort implements WorkerMessagePort {
  peer?: TestPort;
  private listeners = new Set<
    (event: MessageEvent<WorkerTransportMessage>) => void
  >();
  postMessage(message: WorkerTransportMessage): void {
    this.peer?.dispatch(message);
  }
  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerTransportMessage>) => void,
  ): void {
    this.listeners.add(listener);
  }
  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<WorkerTransportMessage>) => void,
  ): void {
    this.listeners.delete(listener);
  }
  private dispatch(message: WorkerTransportMessage): void {
    for (const listener of this.listeners)
      listener({ data: message } as MessageEvent<WorkerTransportMessage>);
  }
}

describe("worker transport", () => {
  it("routes packets without changing protocol semantics", async () => {
    const clientPort = new TestPort();
    const serverPort = new TestPort();
    clientPort.peer = serverPort;
    serverPort.peer = clientPort;
    let inbound: InboundPacket | undefined;
    const router: GamePacketRouter = {
      onSessionConnected: () => undefined,
      onSessionDisconnected: () => undefined,
      handleWorldPacket: (packet) => {
        inbound = packet;
        return { forwardToZone: false, zoneId: -1, instanceId: 0 };
      },
      handleZonePacket: () => undefined,
    };
    const gateway = new WorkerGatewayService(serverPort, router);
    const client = new WorkerClientTransport(clientPort, 4);
    await gateway.start();
    client.connect();
    client.sendDatagram(99, new Uint8Array([1, 2, 3]));
    assert.equal(inbound?.opcode, 99);
    assert.deepEqual(inbound?.payload, new Uint8Array([1, 2, 3]));
    client.close();
    await gateway.stop();
  });
});
