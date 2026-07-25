import type { DatabaseBackend, DatabaseResult, DatabaseRow, SqlParameters } from "../backend.js";
/** Must be constructed inside a browser Worker for OPFS support. */
export declare class BrowserSqliteOpfsBackend implements DatabaseBackend {
    private readonly database;
    private readonly pool;
    readonly storage: "opfs" | "memory";
    readonly sqliteVersion: string;
    readonly dialect: "sqlite";
    private constructor();
    static open(filename?: string, wasmUrl?: string, seed?: {
        filename: string;
        url: string;
        version: string;
        compressed?: "gzip";
        force?: boolean;
    }): Promise<BrowserSqliteOpfsBackend>;
    query<TRow extends DatabaseRow = DatabaseRow>(sql: string, parameters?: SqlParameters): Promise<DatabaseResult<TRow>>;
    execute(sql: string, parameters?: SqlParameters): Promise<DatabaseResult>;
    transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
