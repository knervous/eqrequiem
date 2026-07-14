import { sql, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { PgDialect } from "drizzle-orm/pg-core";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "./backend.js";

/**
 * Dialect-neutral Drizzle execution boundary. Repositories author one SQL AST;
 * Drizzle compiles it for SQLite, MySQL, or Postgres, then the selected driver
 * executes it. This also works over the browser OPFS DatabaseBackend.
 */
export class DrizzleDatabase {
  constructor(private readonly driver: DatabaseBackend) {}

  get dialect() { return this.driver.dialect; }

  query<TRow extends DatabaseRow = DatabaseRow>(
    query: SQL | string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    query = typeof query === "string" ? parameterized(query, parameters) : query;
    const compiled = this.compile(query);
    return this.driver.query<TRow>(compiled.sql, compiled.params as SqlParameters);
  }

  execute(query: SQL | string, parameters: SqlParameters = []): Promise<DatabaseResult> {
    query = typeof query === "string" ? parameterized(query, parameters) : query;
    const compiled = this.compile(query);
    return this.driver.execute(compiled.sql, compiled.params as SqlParameters);
  }

  transaction<T>(work: (database: DrizzleDatabase) => Promise<T>): Promise<T> {
    return this.driver.transaction((transaction) => work(new DrizzleDatabase(transaction)));
  }

  close(): Promise<void> {
    return this.driver.close();
  }

  private compile(query: SQL): { sql: string; params: unknown[] } {
    if (this.driver.dialect === "postgres") return new PgDialect().sqlToQuery(query);
    if (this.driver.dialect === "mysql") return new MySqlDialect().sqlToQuery(query);
    return new SQLiteSyncDialect().sqlToQuery(query);
  }
}

/** Converts the shared positional-query form into a Drizzle SQL AST. */
function parameterized(statement: string, parameters: SqlParameters): SQL {
  const parts = statement.split("?");
  if (parts.length !== parameters.length + 1) {
    throw new Error(`SQL placeholder mismatch: expected ${parts.length - 1}, received ${parameters.length}`);
  }
  const chunks: SQL[] = [];
  for (const [index, part] of parts.entries()) {
    chunks.push(sql.raw(part));
    if (index < parameters.length) chunks.push(sql`${parameters[index]}`);
  }
  return sql.join(chunks, sql.raw(""));
}
