import { type SQL } from "drizzle-orm";
import type { DatabaseBackend, DatabaseResult, DatabaseRow, SqlParameters } from "./backend.js";
/**
 * Dialect-neutral Drizzle execution boundary. Repositories author one SQL AST;
 * Drizzle compiles it for SQLite, MySQL, or Postgres, then the selected driver
 * executes it. This also works over the browser OPFS DatabaseBackend.
 */
export declare class DrizzleDatabase {
    private readonly driver;
    constructor(driver: DatabaseBackend);
    get dialect(): import("./backend.js").DatabaseDialect;
    query<TRow extends DatabaseRow = DatabaseRow>(query: SQL | string, parameters?: SqlParameters): Promise<DatabaseResult<TRow>>;
    execute(query: SQL | string, parameters?: SqlParameters): Promise<DatabaseResult>;
    transaction<T>(work: (database: DrizzleDatabase) => Promise<T>): Promise<T>;
    close(): Promise<void>;
    private compile;
}
