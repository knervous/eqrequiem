import type {
  DatabaseBackend,
  DatabaseDialect,
  DatabaseRow,
  SqlParameters,
} from "./backend.js";

export interface TableMetadata {
  table: string;
  rowsEstimate: number;
}

export interface ColumnMetadata {
  name: string;
  dataType: string;
  nullable: boolean;
  key: string;
}

export class DatabaseInspector {
  constructor(private readonly database: DatabaseBackend) {}

  get dialect(): DatabaseDialect {
    return this.database.dialect;
  }

  async listTables(): Promise<TableMetadata[]> {
    if (this.database.dialect === "sqlite") {
      const result = await this.database.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      return result.rows.map(({ name }) => ({ table: name, rowsEstimate: 0 }));
    }
    if (this.database.dialect === "mysql") {
      const result = await this.database.query<{ table_name: string; rows_estimate: number }>(
        `SELECT table_name, COALESCE(table_rows, 0) AS rows_estimate
         FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      return result.rows.map((row) => ({
        table: row.table_name,
        rowsEstimate: Number(row.rows_estimate),
      }));
    }

    const result = await this.database.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name",
    );
    return result.rows.map(({ table_name }) => ({
      table: table_name,
      rowsEstimate: 0,
    }));
  }

  async listColumns(table: string): Promise<ColumnMetadata[]> {
    assertIdentifier(table);
    if (this.database.dialect === "sqlite") {
      const result = await this.database.query<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>(`PRAGMA table_info(${quoteIdentifier(table, "sqlite")})`);
      return result.rows.map((row) => ({
        name: row.name,
        dataType: row.type,
        nullable: row.notnull === 0,
        key: row.pk > 0 ? "PRI" : "",
      }));
    }
    if (this.database.dialect === "mysql") {
      const result = await this.database.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_key: string;
      }>(
        `SELECT column_name, data_type, is_nullable, column_key
         FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = ?
         ORDER BY ordinal_position`,
        [table],
      );
      return result.rows.map((row) => ({
        name: row.column_name,
        dataType: row.data_type,
        nullable: row.is_nullable === "YES",
        key: row.column_key,
      }));
    }

    const result = await this.database.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      is_primary: boolean;
    }>(
      `SELECT c.column_name, c.data_type, c.is_nullable,
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
           AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = c.table_schema
            AND tc.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_primary
       FROM information_schema.columns c
       WHERE c.table_schema = current_schema() AND c.table_name = ?
       ORDER BY c.ordinal_position`,
      [table],
    );
    return result.rows.map((row) => ({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      key: row.is_primary ? "PRI" : "",
    }));
  }

  async rows(table: string, limit: number, offset: number): Promise<DatabaseRow[]> {
    if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("limit and offset must be non-negative integers");
    }
    return (
      await this.database.query(
        `SELECT * FROM ${quoteIdentifier(table, this.database.dialect)} LIMIT ${limit} OFFSET ${offset}`,
      )
    ).rows;
  }

  async insert(table: string, row: DatabaseRow): Promise<number> {
    const entries = serializableEntries(row);
    if (entries.length === 0) throw new Error("row is empty");
    const names = entries.map(([name]) => quoteIdentifier(name, this.database.dialect));
    const result = await this.database.execute(
      `INSERT INTO ${quoteIdentifier(table, this.database.dialect)} (${names.join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`,
      entries.map(([, value]) => value),
    );
    return result.affectedRows;
  }

  async update(table: string, row: DatabaseRow): Promise<number> {
    const keys = await this.primaryKeys(table);
    requireKeys(row, keys);
    const values = serializableEntries(row).filter(([name]) => !keys.includes(name));
    if (values.length === 0) throw new Error("no mutable fields provided");
    const set = values.map(([name]) => `${quoteIdentifier(name, this.database.dialect)} = ?`);
    const where = keys.map((name) => `${quoteIdentifier(name, this.database.dialect)} = ?`);
    const result = await this.database.execute(
      `UPDATE ${quoteIdentifier(table, this.database.dialect)} SET ${set.join(", ")} WHERE ${where.join(" AND ")}`,
      [...values.map(([, value]) => value), ...keys.map((name) => sqlValue(row[name]))],
    );
    return result.affectedRows;
  }

  async delete(table: string, key: DatabaseRow): Promise<number> {
    const keys = await this.primaryKeys(table);
    requireKeys(key, keys);
    const where = keys.map((name) => `${quoteIdentifier(name, this.database.dialect)} = ?`);
    const result = await this.database.execute(
      `DELETE FROM ${quoteIdentifier(table, this.database.dialect)} WHERE ${where.join(" AND ")}`,
      keys.map((name) => sqlValue(key[name])),
    );
    return result.affectedRows;
  }

  async primaryKeys(table: string): Promise<string[]> {
    return (await this.listColumns(table))
      .filter((column) => column.key === "PRI")
      .map((column) => column.name);
  }
}

export function quoteIdentifier(name: string, dialect: DatabaseDialect): string {
  assertIdentifier(name);
  return dialect === "mysql" ? `\`${name}\`` : `"${name}"`;
}

export function assertIdentifier(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
}

function serializableEntries(row: DatabaseRow): Array<[string, SqlParameters[number]]> {
  return Object.entries(row)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => {
      assertIdentifier(name);
      return [name, sqlValue(value)];
    });
}

function sqlValue(value: unknown): SqlParameters[number] {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean" ||
    value instanceof Uint8Array
  ) return value;
  if (typeof value === "object") return JSON.stringify(value);
  throw new Error(`unsupported SQL value: ${typeof value}`);
}

function requireKeys(row: DatabaseRow, keys: readonly string[]): void {
  if (keys.length === 0) throw new Error("table has no primary key");
  for (const key of keys) {
    if (!(key in row)) throw new Error(`row missing primary key column: ${key}`);
  }
}
