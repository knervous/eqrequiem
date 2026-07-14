import type { Pool, PoolConnection, ResultSetHeader } from "mysql2/promise";

import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../backend.js";

/** mysql2 implementation of the same driver boundary used by SQLite and Postgres. */
export class MysqlBackend implements DatabaseBackend {
  readonly dialect = "mysql" as const;

  constructor(
    private readonly client: Pool | PoolConnection,
    private readonly ownsClient = true,
  ) {}

  async query<TRow extends DatabaseRow = DatabaseRow>(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    const [result] = await this.client.execute(statement, normalize(parameters));
    if (Array.isArray(result)) {
      return { rows: result as TRow[], affectedRows: 0 };
    }
    return { rows: [], affectedRows: (result as ResultSetHeader).affectedRows };
  }

  execute(statement: string, parameters: SqlParameters = []): Promise<DatabaseResult> {
    return this.query(statement, parameters);
  }

  async transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    if (!("getConnection" in this.client)) {
      throw new Error("Nested MySQL transactions are not supported");
    }
    const connection = await this.client.getConnection();
    await connection.beginTransaction();
    try {
      const value = await work(new MysqlBackend(connection, false));
      await connection.commit();
      return value;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async close(): Promise<void> {
    if (this.ownsClient && "end" in this.client) await this.client.end();
  }
}

function normalize(parameters: SqlParameters): Array<string | number | boolean | null | Uint8Array> {
  return parameters.map((value) => typeof value === "bigint" ? value.toString() : value);
}
