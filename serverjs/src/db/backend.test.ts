import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { databaseDialectFromUrl } from "./backend.js";
import { DatabaseInspector } from "./introspection.js";
import { createNodeDatabase } from "./node/factory.js";

describe("database backends", () => {
  it("selects a backend from its URL", () => {
    assert.equal(
      databaseDialectFromUrl("postgres://localhost/requiem"),
      "postgres",
    );
    assert.equal(databaseDialectFromUrl("sqlite::memory:"), "sqlite");
    assert.equal(databaseDialectFromUrl("mysql://localhost/requiem"), "mysql");
  });

  it("runs SQLite queries through the shared interface", async () => {
    const database = createNodeDatabase("sqlite::memory:");
    await database.execute(
      "CREATE TABLE actor (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    );
    await database.execute("INSERT INTO actor (name) VALUES (?)", ["Sol"]);
    const result = await database.query<{ id: number; name: string }>(
      "SELECT id, name FROM actor",
    );
    assert.deepEqual(result.rows, [{ id: 1, name: "Sol" }]);
    const inspector = new DatabaseInspector(database);
    assert.deepEqual(await inspector.listTables(), [
      { table: "actor", rowsEstimate: 0 },
    ]);
    assert.deepEqual(await inspector.primaryKeys("actor"), ["id"]);
    assert.equal(await inspector.update("actor", { id: 1, name: "Libra" }), 1);
    assert.equal((await inspector.rows("actor", 10, 0))[0]?.name, "Libra");
    await database.close();
  });
});
