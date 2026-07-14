import { resolve } from "node:path";

import BetterSqlite3 from "better-sqlite3";
import mysql, { type RowDataPacket } from "mysql2/promise";

const targets = [
  { source: process.env.MYSQL_CONTENT_DATABASE ?? "game_content", destination: resolve(process.env.SQLITE_CONTENT_PATH ?? "data/game_content.sqlite") },
  { source: process.env.MYSQL_RUNTIME_DATABASE ?? "game_runtime", destination: resolve(process.env.SQLITE_RUNTIME_PATH ?? "data/game_runtime.sqlite") },
];

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? "3307"),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PASSWORD ?? "admin7891",
  });
  try {
    for (const target of targets) {
      const sqlite = new BetterSqlite3(target.destination, { readonly: true });
      const [tables] = await connection.query<RowDataPacket[]>(
        "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
        [target.source],
      );
      let sourceTotal = 0;
      let destinationTotal = 0;
      for (const row of tables) {
        const table = String(row.TABLE_NAME);
        assertIdentifier(table);
        const [sourceRows] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS count FROM \`${target.source}\`.\`${table}\``);
        const sourceCount = Number(sourceRows[0]?.count ?? 0);
        const sqliteCount = Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get() as { count: number }).count);
        if (sourceCount !== sqliteCount) throw new Error(`${target.source}.${table}: MySQL=${sourceCount}, SQLite=${sqliteCount}`);
        sourceTotal += sourceCount;
        destinationTotal += sqliteCount;
      }
      sqlite.close();
      console.log(`${target.source}: verified ${tables.length} tables and ${destinationTotal} rows (${sourceTotal === destinationTotal ? "exact" : "mismatch"})`);
    }
  } finally {
    await connection.end();
  }
}

function assertIdentifier(identifier: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`invalid identifier: ${identifier}`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
