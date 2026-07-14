import BetterSqlite3, { type Database } from "better-sqlite3";

import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../backend.js";

export class SqliteBackend implements DatabaseBackend {
  readonly dialect = "sqlite" as const;

  constructor(
    private readonly database: Database = new BetterSqlite3(":memory:"),
  ) {
    this.database.pragma("foreign_keys = ON");
  }

  query<TRow extends DatabaseRow = DatabaseRow>(
    sql: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    const rows = this.database.prepare(sql).all(...parameters) as TRow[];
    return Promise.resolve({ rows, affectedRows: 0 });
  }

  execute(
    sql: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult> {
    const result = this.database.prepare(sql).run(...parameters);
    return Promise.resolve({ rows: [], affectedRows: result.changes });
  }

  transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    this.database.exec("BEGIN");
    return work(this).then(
      (value) => {
        this.database.exec("COMMIT");
        return value;
      },
      (error: unknown) => {
        this.database.exec("ROLLBACK");
        throw error;
      },
    );
  }

  close(): Promise<void> {
    this.database.close();
    return Promise.resolve();
  }
}
