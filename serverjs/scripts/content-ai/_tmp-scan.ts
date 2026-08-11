import { createNodeDatabase } from "../../src/db/node/factory.js";
import { loadGazetteer } from "./gazetteer.js";
import { contentDatabaseUrl, SOURCE_DATABASE } from "./paths.js";

const db = createNodeDatabase(contentDatabaseUrl());
await db.execute(`ATTACH DATABASE '${SOURCE_DATABASE}' AS source`);
const rows = (await db.query<{ id: number; original: string; itemtype: number }>(
  `SELECT i.id, s.name AS original, i.itemtype FROM items i JOIN source.items s ON s.id = i.id
    WHERE i.name GLOB '[A-Z]*_[A-Z]*' AND i.name NOT LIKE '% %' ORDER BY i.itemtype, s.name`,
)).rows;
await db.close();
const gaz = await loadGazetteer();
const counts = new Map<string, number>();
for (const r of rows) for (const t of gaz.coinedTokensIn(r.original)) counts.set(t, (counts.get(t) ?? 0) + 1);
console.log("coined tokens across the 459 originals:");
for (const [t, c] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)}  ${t}`);
