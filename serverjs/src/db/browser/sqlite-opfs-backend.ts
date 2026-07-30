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
    private readonly pool: { pauseVfs(): unknown },
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
    (
      globalThis as typeof globalThis & {
        sqlite3ApiConfig?: { disable: { vfs: Record<string, boolean> } };
      }
    ).sqlite3ApiConfig = {
      disable: { vfs: { opfs: true, "opfs-wl": true } },
    };
    const init = sqlite3InitModule as unknown as (options?: {
      locateFile(path: string): string;
    }) => ReturnType<typeof sqlite3InitModule>;
    const sqlite = await init(
      wasmUrl
        ? {
            locateFile: (path) => (path === "sqlite3.wasm" ? wasmUrl : path),
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
    let database: Database | undefined;
    try {
      let needsSeedImport = false;
      if (seed) {
        needsSeedImport =
          seed.force === true || !pool.getFileNames().includes(seed.filename);
        if (!needsSeedImport) {
          let seedDatabase: InstanceType<typeof pool.OpfsSAHPoolDb> | undefined;
          try {
            seedDatabase = new pool.OpfsSAHPoolDb(seed.filename);
            assertDatabaseIntegrity(seedDatabase, seed.filename);
            const rows = seedDatabase.exec(
              "SELECT value FROM content_artifact_meta WHERE key = 'version' LIMIT 1",
              { rowMode: "object", returnValue: "resultRows" },
            ) as Array<{ value: string }>;
            needsSeedImport = rows[0]?.value !== seed.version;
          } catch {
            needsSeedImport = true;
          } finally {
            seedDatabase?.close();
          }
        }
      }
      if (seed && needsSeedImport) {
        if (pool.getFileNames().includes(seed.filename))
          pool.unlink(seed.filename);
        const response = await fetch(seed.url);
        if (!response.ok) {
          throw new Error(
            `Unable to fetch offline SQLite seed (${response.status} ${response.statusText})`,
          );
        }
        let bytes = new Uint8Array(await response.arrayBuffer());

        // Dev servers and CDNs may apply Content-Encoding to the checked-in .gz
        // artifact, which makes fetch return an already-decoded SQLite image.
        // Only decompress when the response body still contains the gzip magic.
        if (
          seed.compressed === "gzip" &&
          bytes[0] === 0x1f &&
          bytes[1] === 0x8b
        ) {
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
        const hasSqliteHeader =
          bytes.length >= sqliteHeader.length &&
          sqliteHeader
            .split("")
            .every(
              (character, index) => bytes[index] === character.charCodeAt(0),
            );
        if (!hasSqliteHeader) {
          throw new Error(
            "Offline content artifact is neither a gzip stream nor a valid SQLite database",
          );
        }
        await pool.importDb(seed.filename, bytes.buffer);
      }
      try {
        database = new pool.OpfsSAHPoolDb(filename);
      } catch (error) {
        throw new Error(
          "Unable to open persistent offline SQLite database in OPFS",
          { cause: error },
        );
      }
      try {
        assertDatabaseIntegrity(database, filename);
      } catch (error) {
        database.close();
        if (!(error instanceof ConfirmedSqliteCorruptionError)) {
          pool.pauseVfs();
          throw error;
        }

        const quarantineName = await quarantineDatabaseImage(
          await pool.exportFile(filename),
          filename,
        );
        for (const candidate of [
          filename,
          `${filename}-journal`,
          `${filename}-wal`,
          `${filename}-shm`,
        ]) {
          if (pool.getFileNames().includes(candidate)) pool.unlink(candidate);
        }
        database = new pool.OpfsSAHPoolDb(filename);
        assertDatabaseIntegrity(database, filename);
        console.warn(
          `[local-backend] Rebuilt corrupt SQLite runtime database; preserved damaged image as ${quarantineName}`,
        );
      }
      database.exec("PRAGMA foreign_keys = ON");
      return new BrowserSqliteOpfsBackend(
        database,
        pool,
        "opfs",
        sqlite.version.libVersion,
      );
    } catch (error) {
      try {
        database?.close();
      } catch {
        // Continue relinquishing the pool even if SQLite already closed it.
      }
      try {
        pool.pauseVfs();
      } catch (pauseError) {
        console.error(
          "[local-backend] Failed to release OPFS SQLite handles after startup error",
          pauseError,
        );
      }
      throw error;
    }
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
    this.pool.pauseVfs();
    return Promise.resolve();
  }
}

class ConfirmedSqliteCorruptionError extends Error {
  constructor(filename: string, detail: string, options?: ErrorOptions) {
    super(`SQLite database ${filename} is corrupt: ${detail}`, options);
    this.name = "ConfirmedSqliteCorruptionError";
  }
}

function assertDatabaseIntegrity(database: Database, filename: string): void {
  let rows: Array<Record<string, unknown>>;
  try {
    rows = database.exec("PRAGMA quick_check(1)", {
      rowMode: "object",
      returnValue: "resultRows",
    }) as Array<Record<string, unknown>>;
  } catch (error) {
    if (!isSqliteCorruption(error)) throw error;
    throw new ConfirmedSqliteCorruptionError(
      filename,
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
  const result = rows[0] && Object.values(rows[0])[0];
  if (result !== "ok") {
    throw new ConfirmedSqliteCorruptionError(
      filename,
      typeof result === "string" ? result : "PRAGMA quick_check failed",
    );
  }
}

function isSqliteCorruption(error: unknown): boolean {
  const candidate = error as {
    resultCode?: unknown;
    sqlite3Rc?: unknown;
    message?: unknown;
  };
  const code = Number(candidate?.resultCode ?? candidate?.sqlite3Rc);
  if (code === 11 || code === 26) return true;
  const message = String(candidate?.message ?? error).toLowerCase();
  return (
    message.includes("sqlite_corrupt") ||
    message.includes("sqlite_notadb") ||
    message.includes("database disk image is malformed") ||
    message.includes("file is not a database")
  );
}

async function quarantineDatabaseImage(
  bytes: Uint8Array,
  filename: string,
): Promise<string> {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(".eqrequiem-recovery", {
    create: true,
  });
  const basename = filename.split("/").pop() || "database.sqlite3";
  const quarantineName = `${basename}.corrupt-${Date.now()}`;
  const handle = await directory.getFileHandle(quarantineName, {
    create: true,
  });
  const writable = await handle.createWritable();
  try {
    const image = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    await writable.write(image);
  } finally {
    await writable.close();
  }
  return `/.eqrequiem-recovery/${quarantineName}`;
}
