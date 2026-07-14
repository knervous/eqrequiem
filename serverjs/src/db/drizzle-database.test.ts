import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";

import type {
  DatabaseBackend,
  DatabaseDialect,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "./backend.js";
import { DrizzleDatabase } from "./drizzle-database.js";

describe("Drizzle database boundary", () => {
  it("compiles the same repository query for SQLite, MySQL, and Postgres", async () => {
    const observed: Array<{ dialect: DatabaseDialect; statement: string; parameters: SqlParameters }> = [];
    for (const dialect of ["sqlite", "mysql", "postgres"] as const) {
      const database = new DrizzleDatabase(new CaptureBackend(dialect, observed));
      await database.query(sql`SELECT id FROM characters WHERE account_id = ${7}`);
    }
    assert.deepEqual(observed, [
      { dialect: "sqlite", statement: "SELECT id FROM characters WHERE account_id = ?", parameters: [7] },
      { dialect: "mysql", statement: "SELECT id FROM characters WHERE account_id = ?", parameters: [7] },
      { dialect: "postgres", statement: "SELECT id FROM characters WHERE account_id = $1", parameters: [7] },
    ]);
  });
});

class CaptureBackend implements DatabaseBackend {
  constructor(
    readonly dialect: DatabaseDialect,
    private readonly observed: Array<{
      dialect: DatabaseDialect;
      statement: string;
      parameters: SqlParameters;
    }>,
  ) {}

  query<TRow extends DatabaseRow = DatabaseRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    this.observed.push({ dialect: this.dialect, statement, parameters });
    return Promise.resolve({ rows: [], affectedRows: 0 });
  }

  execute(statement: string, parameters: SqlParameters = []): Promise<DatabaseResult> {
    return this.query(statement, parameters);
  }

  transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    return work(this);
  }

  close(): Promise<void> { return Promise.resolve(); }
}
