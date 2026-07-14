import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";

import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../backend.js";

/** Must be constructed inside a browser Worker for OPFS support. */
export class BrowserSqliteOpfsBackend implements DatabaseBackend {
  readonly dialect = "sqlite" as const;

  private constructor(
    private readonly database: Database,
    readonly storage: "opfs" | "memory",
    readonly sqliteVersion: string,
  ) {}

  static async open(
    filename = "/eqrequiem-mock.sqlite3",
    wasmUrl?: string,
    seed?: {
      filename: string;
      url: string;
      version: string;
      compressed?: "gzip";
      force?: boolean;
    },
  ): Promise<BrowserSqliteOpfsBackend> {
    // The regular OPFS VFS creates a nested proxy Worker. That URL is fragile
    // once this module is itself bundled as a Worker, so use SQLite's direct
    // synchronous-access-handle pool VFS instead.
    (globalThis as typeof globalThis & {
      sqlite3ApiConfig?: { disable: { vfs: Record<string, boolean> } };
    }).sqlite3ApiConfig = {
      disable: { vfs: { opfs: true, "opfs-wl": true } },
    };
    const init = sqlite3InitModule as unknown as (
      options?: { locateFile(path: string): string },
    ) => ReturnType<typeof sqlite3InitModule>;
    const sqlite = await init(
      wasmUrl
        ? {
            locateFile: (path) => path === "sqlite3.wasm" ? wasmUrl : path,
          }
        : undefined,
    );
    let pool;
    try {
      pool = await sqlite.installOpfsSAHPoolVfs({
        name: "eqrequiem-opfs",
        directory: ".eqrequiem-opfs",
        initialCapacity: 8,
      });
      await pool.reserveMinimumCapacity(8);
    } catch (error) {
      throw new Error(
        "Offline mode requires persistent OPFS SQLite. Ensure this page is cross-origin isolated (COOP/COEP) and use a browser with OPFS synchronous access-handle support.",
        { cause: error },
      );
    }
    let needsSeedImport = false;
    if (seed) {
      needsSeedImport = seed.force === true || !pool.getFileNames().includes(seed.filename);
      if (!needsSeedImport) {
        try {
          const seedDatabase = new pool.OpfsSAHPoolDb(seed.filename);
          const rows = seedDatabase.exec(
            "SELECT value FROM content_artifact_meta WHERE key = 'version' LIMIT 1",
            { rowMode: "object", returnValue: "resultRows" },
          ) as Array<{ value: string }>;
          needsSeedImport = rows[0]?.value !== seed.version;
          seedDatabase.close();
        } catch {
          needsSeedImport = true;
        }
      }
    }
    if (seed && needsSeedImport) {
      if (pool.getFileNames().includes(seed.filename)) pool.unlink(seed.filename);
      const response = await fetch(seed.url);
      if (!response.ok) {
        throw new Error(`Unable to fetch offline SQLite seed (${response.status} ${response.statusText})`);
      }
      let bytes = new Uint8Array(await response.arrayBuffer());

      // Dev servers and CDNs may apply Content-Encoding to the checked-in .gz
      // artifact, which makes fetch return an already-decoded SQLite image.
      // Only decompress when the response body still contains the gzip magic.
      if (seed.compressed === "gzip" && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const compressed = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
        const stream = new Blob([compressed])
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }

      const sqliteHeader = "SQLite format 3\0";
      const hasSqliteHeader = bytes.length >= sqliteHeader.length
        && sqliteHeader.split("").every((character, index) =>
          bytes[index] === character.charCodeAt(0)
        );
      if (!hasSqliteHeader) {
        throw new Error(
          "Offline content artifact is neither a gzip stream nor a valid SQLite database",
        );
      }
      await pool.importDb(seed.filename, bytes.buffer);
    }
    let database: Database;
    try {
      database = new pool.OpfsSAHPoolDb(filename);
    } catch (error) {
      throw new Error("Unable to open persistent offline SQLite database in OPFS", { cause: error });
    }
    database.exec("PRAGMA foreign_keys = ON");
    return new BrowserSqliteOpfsBackend(
      database,
      "opfs",
      sqlite.version.libVersion,
    );
  }

  query<TRow extends DatabaseRow = DatabaseRow>(
    sql: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    const rows = this.database.exec(sql, {
      bind: parameters,
      rowMode: "object",
      returnValue: "resultRows",
    }) as TRow[];
    return Promise.resolve({ rows, affectedRows: 0 });
  }

  execute(
    sql: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult> {
    this.database.exec(sql, { bind: parameters });
    return Promise.resolve({ rows: [], affectedRows: this.database.changes() });
  }

  async transaction<T>(
    work: (database: DatabaseBackend) => Promise<T>,
  ): Promise<T> {
    this.database.exec("BEGIN");
    try {
      const value = await work(this);
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): Promise<void> {
    this.database.close();
    return Promise.resolve();
  }
}
