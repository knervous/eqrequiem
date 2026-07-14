import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyCanonicalContentSchema, applyCanonicalRuntimeSchema } from "./canonical-schema.js";
import { createNodeDatabase } from "./node/factory.js";

describe("canonical database schema", () => {
  it("applies forward content and runtime migrations idempotently", async () => {
    const content = createNodeDatabase("sqlite::memory:");
    const runtime = createNodeDatabase("sqlite::memory:");
    await applyCanonicalContentSchema(content);
    await applyCanonicalContentSchema(content);
    await applyCanonicalRuntimeSchema(runtime);
    await applyCanonicalRuntimeSchema(runtime);
    assert.deepEqual((await content.query("SELECT namespace, version FROM schema_migrations")).rows, [
      { namespace: "content", version: 1 },
      { namespace: "content", version: 2 },
      { namespace: "content", version: 3 },
      { namespace: "content", version: 4 },
      { namespace: "content", version: 5 },
      { namespace: "content", version: 6 },
    ]);
    assert.deepEqual((await runtime.query("SELECT namespace, version FROM schema_migrations")).rows, [
      { namespace: "runtime", version: 1 },
      { namespace: "runtime", version: 2 },
    ]);
    assert.equal((await content.query("SELECT name FROM sqlite_master WHERE name = 'spawn_points'")).rows.length, 1);
    assert.equal((await content.query("SELECT name FROM sqlite_master WHERE name = 'items'")).rows.length, 1);
    assert.equal((await content.query("SELECT name FROM sqlite_master WHERE name = 'character_origins'")).rows.length, 1);
    assert.equal((await content.query("SELECT name FROM sqlite_master WHERE name = 'character_starting_items'")).rows.length, 1);
    assert.equal((await content.query("SELECT name FROM sqlite_master WHERE name = 'class_skill_caps'")).rows.length, 1);
    assert.equal((await runtime.query("SELECT name FROM sqlite_master WHERE name = 'player_inventory'")).rows.length, 1);
    assert.equal((await runtime.query("SELECT name FROM sqlite_master WHERE name = 'character_binds'")).rows.length, 1);
    await Promise.all([content.close(), runtime.close()]);
  });
});
