import { rm, rename } from "node:fs/promises";
import { resolve } from "node:path";

import BetterSqlite3, { type Database } from "better-sqlite3";
import mysql, { type Connection, type RowDataPacket } from "mysql2";

interface SourceColumn extends RowDataPacket {
  COLUMN_NAME: string;
  DATA_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
}

interface SourceIndex extends RowDataPacket {
  INDEX_NAME: string;
  NON_UNIQUE: number;
  COLUMN_NAME: string;
}

const targets = [
  {
    source: process.env.MYSQL_CONTENT_DATABASE ?? "game_content",
    destination: resolve(process.env.SQLITE_CONTENT_PATH ?? "data/game_content.sqlite"),
  },
  {
    source: process.env.MYSQL_RUNTIME_DATABASE ?? "game_runtime",
    destination: resolve(process.env.SQLITE_RUNTIME_PATH ?? "data/game_runtime.sqlite"),
  },
];

async function main(): Promise<void> {
  for (const target of targets) await hydrate(target.source, target.destination);
}

async function hydrate(sourceDatabase: string, destination: string): Promise<void> {
  assertIdentifier(sourceDatabase);
  const temporary = `${destination}.importing`;
  await rm(temporary, { force: true });
  const source = mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? "3307"),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "admin7891",
    database: sourceDatabase,
    supportBigNumbers: true,
    bigNumberStrings: true,
    dateStrings: true,
  });
  await source.promise().connect();
  const sqlite = new BetterSqlite3(temporary);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = OFF");
  sqlite.pragma("foreign_keys = OFF");
  sqlite.pragma("temp_store = MEMORY");

  try {
    const [tableRows] = await source.promise().query<RowDataPacket[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      [sourceDatabase],
    );
    const tables = tableRows.map((row) => String(row.TABLE_NAME));
    let importedRows = 0;
    console.log(`[${sourceDatabase}] importing ${tables.length} tables -> ${destination}`);

    for (const [index, table] of tables.entries()) {
      const columns = await readColumns(source, sourceDatabase, table);
      const indexes = await readIndexes(source, sourceDatabase, table);
      createTable(sqlite, table, columns, indexes);
      const count = await copyRows(source, sqlite, table, columns);
      createIndexes(sqlite, table, indexes);
      importedRows += count;
      console.log(`[${sourceDatabase}] ${index + 1}/${tables.length} ${table}: ${count}`);
    }

    sqlite.pragma("optimize");
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    sqlite.close();
    source.end();
    await rm(destination, { force: true });
    await rename(temporary, destination);
    console.log(`[${sourceDatabase}] complete: ${tables.length} tables, ${importedRows} rows`);
  } catch (error) {
    if (sqlite.open) sqlite.close();
    source.destroy();
    await rm(temporary, { force: true });
    throw error;
  }
}

async function readColumns(connection: Connection, database: string, table: string): Promise<SourceColumn[]> {
  const [rows] = await connection.promise().query<SourceColumn[]>(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [database, table],
  );
  return rows;
}

async function readIndexes(connection: Connection, database: string, table: string): Promise<SourceIndex[]> {
  const [rows] = await connection.promise().query<SourceIndex[]>(
    `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [database, table],
  );
  return rows;
}

function createTable(database: Database, table: string, columns: SourceColumn[], indexes: SourceIndex[]): void {
  const primary = indexes.filter((index) => index.INDEX_NAME === "PRIMARY").map((index) => index.COLUMN_NAME);
  const declarations = columns.map((column) => {
    const nullable = column.IS_NULLABLE === "NO" && !primary.includes(column.COLUMN_NAME) ? " NOT NULL" : "";
    return `${quote(column.COLUMN_NAME)} ${sqliteType(column.DATA_TYPE)}${nullable}`;
  });
  if (primary.length > 0) declarations.push(`PRIMARY KEY (${primary.map(quote).join(", ")})`);
  database.exec(`CREATE TABLE ${quote(table)} (${declarations.join(", ")})`);
}

function createIndexes(database: Database, table: string, indexes: SourceIndex[]): void {
  const grouped = new Map<string, SourceIndex[]>();
  for (const index of indexes) {
    if (index.INDEX_NAME === "PRIMARY") continue;
    const entries = grouped.get(index.INDEX_NAME) ?? [];
    entries.push(index);
    grouped.set(index.INDEX_NAME, entries);
  }
  for (const [name, entries] of grouped) {
    const unique = entries[0]?.NON_UNIQUE === 0 ? "UNIQUE " : "";
    const indexName = `${table}__${name}`.replaceAll(/[^A-Za-z0-9_]/g, "_").slice(0, 120);
    const columns = entries.map((entry) => quote(entry.COLUMN_NAME)).join(", ");
    try {
      database.exec(`CREATE ${unique}INDEX ${quote(indexName)} ON ${quote(table)} (${columns})`);
    } catch (error) {
      console.warn(`[${table}] skipped index ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function copyRows(source: Connection, destination: Database, table: string, columns: SourceColumn[]): Promise<number> {
  if (columns.length === 0) return 0;
  const names = columns.map((column) => column.COLUMN_NAME);
  const insert = destination.prepare(
    `INSERT INTO ${quote(table)} (${names.map(quote).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
  );
  const insertBatch = destination.transaction((rows: unknown[][]) => {
    for (const row of rows) insert.run(...row.map(sqliteValue));
  });
  let batch: unknown[][] = [];
  let count = 0;
  await new Promise<void>((resolvePromise, reject) => {
    const stream = source.query({ sql: `SELECT * FROM ${quoteMysql(table)}`, rowsAsArray: true }).stream({ highWaterMark: 256 });
    stream.on("data", (row: unknown[]) => {
      batch.push(row);
      count += 1;
      if (batch.length >= 2_000) {
        insertBatch(batch);
        batch = [];
      }
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (batch.length > 0) insertBatch(batch);
      resolvePromise();
    });
  });
  return count;
}

function sqliteType(mysqlType: string): string {
  if (["tinyint", "smallint", "mediumint", "int", "integer", "bigint", "year"].includes(mysqlType)) return "INTEGER";
  if (["float", "double", "real"].includes(mysqlType)) return "REAL";
  if (["decimal", "numeric"].includes(mysqlType)) return "NUMERIC";
  if (["binary", "varbinary", "tinyblob", "blob", "mediumblob", "longblob", "bit", "geometry"].includes(mysqlType)) return "BLOB";
  return "TEXT";
}

function sqliteValue(value: unknown): string | number | bigint | Buffer | null {
  if (value === null) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return JSON.stringify(value);
}

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteMysql(identifier: string): string {
  assertIdentifier(identifier);
  return `\`${identifier}\``;
}

function assertIdentifier(identifier: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`invalid identifier: ${identifier}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
