import assert from "node:assert/strict";
import test from "node:test";

import { LocalBackendConnection } from "../src/LocalBackend/connection.ts";

class FakeWorker extends EventTarget {
  static instances = [];
  static nextSendReady = true;

  messages = [];
  terminated = false;
  sendReady;

  constructor() {
    super();
    this.sendReady = FakeWorker.nextSendReady;
    FakeWorker.nextSendReady = true;
    FakeWorker.instances.push(this);
  }

  postMessage(message) {
    this.messages.push(message);
    if (message.type === "initialize" && this.sendReady) {
      queueMicrotask(() => {
        this.dispatchEvent(
          new MessageEvent("message", {
            data: {
              type: "ready",
              storage: "opfs",
              sqliteVersion: "test",
              contentVersion: "test",
            },
          }),
        );
      });
    }
    if (message.type === "close") {
      queueMicrotask(() => {
        this.dispatchEvent(
          new MessageEvent("message", { data: { type: "closed" } }),
        );
      });
    }
  }

  terminate() {
    this.terminated = true;
  }
}

globalThis.Worker = FakeWorker;

test("LocalBackendConnection waits for graceful worker shutdown", async () => {
  const connection = new LocalBackendConnection();
  const info = await connection.connect();
  const worker = FakeWorker.instances.at(-1);

  assert.equal(info.storage, "opfs");
  await connection.close();
  assert.deepEqual(
    worker.messages.map((message) => message.type),
    ["initialize", "close"],
  );
  assert.equal(worker.terminated, true);
});

test("closing during startup rejects the pending connection", async () => {
  const workerCount = FakeWorker.instances.length;
  const connection = new LocalBackendConnection();
  const pending = connection.connect();

  const closing = connection.close();
  await assert.rejects(pending, /closed/);
  await closing;
  assert.equal(FakeWorker.instances.length, workerCount);
});

test("only one connection can own OPFS storage at a time", async () => {
  const owner = new LocalBackendConnection();
  await owner.connect();
  const contender = new LocalBackendConnection();

  await assert.rejects(contender.connect(), /already in use/);
  assert.equal(
    FakeWorker.instances.filter((worker) => !worker.terminated).length,
    1,
  );
  await owner.close();
});

test("the OPFS ownership lease survives an HMR module reevaluation", async () => {
  const owner = new LocalBackendConnection();
  await owner.connect();
  const revisedModule = await import(
    `../src/LocalBackend/connection.ts?hmr-test=${Date.now()}`
  );
  const contender = new revisedModule.LocalBackendConnection();

  await assert.rejects(contender.connect(), /already in use/);
  assert.equal(
    FakeWorker.instances.filter((worker) => !worker.terminated).length,
    1,
  );
  await owner.close();
});
