import postgres, { type Sql } from "postgres";

import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../backend.js";

export class PostgresBackend implements DatabaseBackend {
  readonly dialect = "postgres" as const;

  constructor(private readonly sql: Sql = postgres()) {}

  async query<TRow extends DatabaseRow = DatabaseRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    const normalized = parameters.map((value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    const rows = await this.sql.unsafe<TRow[]>(
      postgresPlaceholders(statement),
      normalized,
    );
    return { rows: [...rows], affectedRows: rows.count };
  }

  execute(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult> {
    return this.query(statement, parameters);
  }

  async transaction<T>(
    work: (database: DatabaseBackend) => Promise<T>,
  ): Promise<T> {
    const result = await this.sql.begin(async (transaction) =>
      work(new PostgresBackend(transaction as unknown as Sql)),
    );
    return result as T;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

/** The shared backend API uses SQLite-style positional placeholders. */
function postgresPlaceholders(statement: string): string {
  let index = 0;
  return statement.replaceAll("?", () => `$${++index}`);
}
