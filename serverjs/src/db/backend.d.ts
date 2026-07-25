export type DatabaseDialect = "mysql" | "postgres" | "sqlite";
export type SqlPrimitive = string | number | bigint | boolean | null | Uint8Array;
export type SqlParameters = readonly SqlPrimitive[];
export type DatabaseRow = Record<string, unknown>;
export interface DatabaseResult<TRow extends DatabaseRow = DatabaseRow> {
    rows: TRow[];
    affectedRows: number;
}
/** Minimal database boundary shared by Node and browser mock backends. */
export interface DatabaseBackend {
    readonly dialect: DatabaseDialect;
    query<TRow extends DatabaseRow = DatabaseRow>(sql: string, parameters?: SqlParameters): Promise<DatabaseResult<TRow>>;
    execute(sql: string, parameters?: SqlParameters): Promise<DatabaseResult>;
    transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
export declare function databaseDialectFromUrl(url: string): DatabaseDialect;
