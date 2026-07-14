import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readLibraDevEnv } from "./dev-env.js";

describe("standalone Libra development config", () => {
  it("opens the canonical content SQLite without a game backend", () => {
    const env = readLibraDevEnv({}, "/workspace/serverjs");
    assert.equal(env.http.host, "127.0.0.1");
    assert.equal(env.http.port, 8082);
    assert.equal(env.db.contentUrl, "sqlite:/workspace/serverjs/data/content-db.sqlite");
    assert.equal(env.db.runtimeUrl, "sqlite:/workspace/serverjs/data/libra-runtime.sqlite");
    assert.equal(env.libra.readonlyRuntime, true);
  });

  it("allows a dedicated Libra content database override", () => {
    const env = readLibraDevEnv({
      LIBRA_DEV_PORT: "9092",
      LIBRA_CONTENT_DATABASE_URL: "sqlite:/tmp/edit-content.sqlite",
    });
    assert.equal(env.http.port, 9092);
    assert.equal(env.db.contentUrl, "sqlite:/tmp/edit-content.sqlite");
  });
});
