import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import postgres from "postgres";
import { createPool } from "mysql2/promise";

import { databaseDialectFromUrl, type DatabaseBackend } from "../backend.js";
import { PostgresBackend } from "./postgres-backend.js";
import { SqliteBackend } from "./sqlite-backend.js";
import { MysqlBackend } from "./mysql-backend.js";

export function createNodeDatabase(url: string): DatabaseBackend {
  const dialect = databaseDialectFromUrl(url);
  if (dialect === "postgres") return new PostgresBackend(postgres(url));
  if (dialect === "mysql") return new MysqlBackend(createPool(url));
  if (dialect === "sqlite") {
    const filename = sqliteFilename(url);
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    return new SqliteBackend(new BetterSqlite3(filename));
  }
  throw new Error(`Unsupported database dialect: ${dialect}`);
}

function sqliteFilename(url: string): string {
  if (url === "sqlite::memory:" || url === "file::memory:") return ":memory:";
  const parsed = new URL(url);
  const pathname = decodeURIComponent(parsed.pathname);
  return pathname.startsWith("/") ? pathname : resolve(pathname);
}
