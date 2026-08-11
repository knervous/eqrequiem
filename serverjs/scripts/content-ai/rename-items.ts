import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { createNodeDatabase } from "../../src/db/node/factory.js";
import { loadGazetteer } from "./gazetteer.js";
import { ITEM_NAME_MAP, type ItemKind } from "./item-name-map.js";
import { SOURCE_DATABASE, artifactPath, contentDatabaseUrl } from "./paths.js";

/**
 * Applies the authored item name map, keyed by each row's *original* EverQuest name.
 *
 * This is the item half of the repair in `docs/shadows-of-eltania/08-npc-naming-repair.md`.
 * The same person-name generator was let loose on `items.name`, so 459 rows — every one
 * of them reachable as demo loot or merchant stock — are called things like
 * `Maren_Oakcrest_6`.
 *
 * Nothing is written until every gate below passes, and a reverse map is written
 * alongside the batch so the whole thing can be undone by item id.
 *
 *   npm run content-ai:rename-items -- --check     report only, touch nothing
 *   npm run content-ai:rename-items                validate, then write
 */

/** The defect signature: `Firstname_Surname`, optionally suffixed, never spaced. */
const BROKEN_NAME_GLOB = "[A-Z]*_[A-Z]*";

/**
 * Which kinds each `itemtype` may legitimately be filed under.
 *
 * A single derived value would be a lie: EverQuest's type 11 covers containers, recipe
 * books, ore, severed heads and quest orders alike, and type 17 covers both tradeskill
 * reagents and the bits cut off a rat. Naming a set of *permitted* kinds catches the
 * mistake that matters — a weapon filed as a consumable — without pretending the source
 * data draws a line it does not draw.
 */
const KINDS_BY_ITEMTYPE: Readonly<Record<number, readonly ItemKind[]>> = {
  0: ["weapon"],
  1: ["weapon"],
  2: ["weapon"],
  3: ["weapon"],
  8: ["armour"],
  10: ["armour", "tool", "component"],
  11: ["tool", "component", "token", "trophy", "consumable"],
  12: ["tool"],
  14: ["consumable"],
  15: ["consumable"],
  16: ["tool"],
  17: ["component", "trophy", "token"],
  18: ["consumable"],
  19: ["weapon"],
  20: ["scroll"],
  21: ["consumable"],
  24: ["tool"],
  25: ["tool"],
  29: ["armour"],
  32: ["tool"],
  33: ["token"],
  38: ["consumable"],
  45: ["weapon"],
};

/**
 * Prefixes that are form, not decoration. Dropping one changes what the row *is*.
 *
 * EverQuest's `Summoned: ` is deliberately absent: `summoned` is itself coined vocabulary
 * the gate rejects, so the one row carrying it cannot keep the prefix and says what it is
 * in words instead.
 */
const FORM_PREFIXES = ["Spell: ", "Song: "] as const;

/** Sizing is a race restriction the player reads off the name. */
const SIZE_WORDS = ["Small", "Large", "Medium"] as const;

/**
 * Grade words that order a tradeskill ladder. Reordering them would silently break
 * progression, so the replacement has to open with the same one.
 */
const GRADE_WORDS = [
  "Crude",
  "Fair",
  "Malleable",
  "Ductile",
  "Ossified",
  "Refractory",
  "Simple",
  "Complex",
  "Exquisite",
] as const;

interface Row {
  readonly id: number;
  readonly current: string;
  readonly original: string;
  readonly itemtype: number;
  readonly slots: number;
  readonly damage: number;
  readonly stackable: number;
  readonly maxcharges: number;
  readonly idfile: string;
}

interface Change {
  readonly id: number;
  readonly original: string;
  readonly previous: string;
  readonly proposed: string;
  readonly kind: ItemKind;
}

/**
 * Every row this batch is responsible for.
 *
 * The set is the union of two things, and it has to be, because they answer different
 * questions. Rows still carrying a person name are the damage; rows whose *original* is a
 * key in the map are the batch's remit whatever they are called right now. Selecting only
 * the first would make this script a one-shot: `db:content:export` restores EverQuest's
 * names, which are not person-shaped, so a re-run after a promote would match nothing and
 * quietly report success having done nothing at all.
 */
async function loadRows(): Promise<Row[]> {
  const database = createNodeDatabase(contentDatabaseUrl());
  await database.execute(`ATTACH DATABASE '${SOURCE_DATABASE}' AS source`);
  const mapped = Object.keys(ITEM_NAME_MAP);
  const placeholders = mapped.map(() => "?").join(", ");
  const rows = (
    await database.query<Row>(
      `SELECT i.id AS id, i.name AS current, s.name AS original, i.itemtype AS itemtype,
              i.slots AS slots, i.damage AS damage, i.stackable AS stackable,
              i.maxcharges AS maxcharges, i.idfile AS idfile
         FROM items i
         JOIN source.items s ON s.id = i.id
        WHERE (i.name GLOB ? AND i.name NOT LIKE '% %')
           OR s.name IN (${placeholders})
        ORDER BY i.id`,
      [BROKEN_NAME_GLOB, ...mapped],
    )
  ).rows;
  await database.close();
  return rows;
}

/** Every item name already in the database that this batch is not rewriting. */
async function loadForeignNames(ids: ReadonlySet<number>): Promise<Map<string, number>> {
  const database = createNodeDatabase(contentDatabaseUrl());
  const rows = (
    await database.query<{ id: number; name: string }>("SELECT id, name FROM items")
  ).rows;
  await database.close();
  const names = new Map<string, number>();
  for (const row of rows) {
    if (ids.has(Number(row.id))) continue;
    names.set(row.name.trim().toLowerCase(), Number(row.id));
  }
  return names;
}

function leadingWord(name: string, words: readonly string[]): string | null {
  for (const word of words) {
    if (name.startsWith(`${word} `)) return word;
  }
  return null;
}

export async function validate(rows: readonly Row[]): Promise<{
  readonly changes: readonly Change[];
  readonly errors: readonly string[];
}> {
  const gazetteer = await loadGazetteer();
  const ids = new Set(rows.map((row) => Number(row.id)));
  const foreign = await loadForeignNames(ids);
  const errors: string[] = [];
  const changes: Change[] = [];

  // Gate 1 — completeness. A person-named row the map does not cover would keep its
  // person name, and an entry that matches no row at all is a typo in the key.
  const missing = [
    ...new Set(rows.filter((row) => !ITEM_NAME_MAP[row.original]).map((r) => r.original)),
  ];
  for (const name of missing.sort()) {
    errors.push(`no mapping for original name '${name}'`);
  }
  const unused = Object.keys(ITEM_NAME_MAP).filter(
    (key) => !rows.some((row) => row.original === key),
  );
  for (const key of unused.sort()) {
    errors.push(`map entry '${key}' matches no broken row`);
  }

  const byProposed = new Map<string, Change[]>();

  for (const row of rows) {
    const mapped = ITEM_NAME_MAP[row.original];
    if (!mapped) continue;
    const proposed = mapped.name;
    const change: Change = {
      id: Number(row.id),
      original: row.original,
      previous: row.current,
      proposed,
      kind: mapped.kind,
    };
    changes.push(change);

    // Gate 2 — no survivor. The replacement must not itself be EverQuest text, whole
    // name or coined token.
    if (gazetteer.hasName(proposed)) {
      errors.push(`'${proposed}' is itself a name in the source database`);
    }
    const coined = gazetteer.coinedTokensIn(proposed);
    if (coined.length > 0) {
      errors.push(`'${proposed}' reuses EverQuest token(s): ${coined.join(", ")}`);
    }

    // Gate 3 — kind agreement. This is the step the original pass skipped entirely: the
    // authored kind has to be one the row's own `itemtype` allows.
    const permitted = KINDS_BY_ITEMTYPE[Number(row.itemtype)];
    if (!permitted) {
      errors.push(`'${row.original}' has unclassified itemtype ${row.itemtype}`);
    } else if (!permitted.includes(mapped.kind)) {
      errors.push(
        `'${row.original}' -> '${proposed}' is filed as ${mapped.kind}, but itemtype `
        + `${row.itemtype} allows only ${permitted.join(", ")}`,
      );
    }

    // Gate 4 — the kind has to agree with the row's mechanics too, so a mis-filed entry
    // cannot hide behind a permissive itemtype.
    if (mapped.kind === "weapon" && Number(row.damage) <= 0) {
      errors.push(`'${proposed}' is filed as a weapon but deals no damage`);
    }
    if (mapped.kind === "armour" && Number(row.slots) === 0) {
      errors.push(`'${proposed}' is filed as armour but occupies no slot`);
    }
    if (
      mapped.kind === "consumable"
      && Number(row.stackable) === 0
      && Number(row.maxcharges) === 0
    ) {
      errors.push(`'${proposed}' is filed as a consumable but neither stacks nor charges`);
    }
    if (mapped.kind === "scroll" && !/^(Spell|Song): /.test(proposed)) {
      errors.push(`'${proposed}' is filed as a scroll but carries no 'Spell: '/'Song: '`);
    }

    // Gate 5 — form. A prefix that says what the row is must survive.
    for (const prefix of FORM_PREFIXES) {
      if (row.original.startsWith(prefix) && !proposed.startsWith(prefix)) {
        errors.push(`'${row.original}' -> '${proposed}' drops the '${prefix.trim()}' prefix`);
      }
      if (!row.original.startsWith(prefix) && proposed.startsWith(prefix)) {
        errors.push(`'${row.original}' -> '${proposed}' gains a '${prefix.trim()}' prefix`);
      }
    }

    // Gate 6 — sizing. Small and Large rows carry different race restrictions, so the
    // player has to be able to tell them apart by name.
    const size = leadingWord(row.original, SIZE_WORDS);
    if (size !== leadingWord(proposed, SIZE_WORDS)) {
      errors.push(
        `'${row.original}' -> '${proposed}' changes the size word `
        + `(${size ?? "none"} -> ${leadingWord(proposed, SIZE_WORDS) ?? "none"})`,
      );
    }

    // Gate 7 — tradeskill grade. The ore and rune ladders are ordered.
    const grade = leadingWord(row.original, GRADE_WORDS);
    if (grade !== null && leadingWord(proposed, GRADE_WORDS) !== grade) {
      errors.push(`'${row.original}' -> '${proposed}' loses its '${grade}' grade`);
    }

    // Gate 8 — width, against the protocol's fixed-width name buffer.
    if (proposed.length > 64) {
      errors.push(`'${proposed}' is ${proposed.length} characters, over the 64 limit`);
    }

    // Gate 9 — no manufactured disambiguation suffixes. This is the defect being repaired.
    if (/_[0-9]+$/.test(proposed)) {
      errors.push(`'${proposed}' carries a numeric disambiguation suffix`);
    }

    // Gate 10 — no collision with a row this batch is not touching.
    const clash = foreign.get(proposed.trim().toLowerCase());
    if (clash !== undefined) {
      errors.push(`'${proposed}' is already the name of item ${clash}`);
    }

    const bucket = byProposed.get(proposed.toLowerCase());
    if (bucket) bucket.push(change);
    else byProposed.set(proposed.toLowerCase(), [change]);
  }

  // Gate 11 — one name per original. Two rows may share a name only when EverQuest
  // shipped them sharing one; unrelated originals colliding is the old defect returning.
  for (const [, sharing] of byProposed) {
    const distinctOriginals = new Set(sharing.map((change) => change.original));
    if (distinctOriginals.size > 1) {
      errors.push(
        `'${sharing[0]?.proposed}' is shared by unrelated items: `
        + [...distinctOriginals].join(", "),
      );
    }
  }

  return { changes, errors };
}

/**
 * `idfile` is an asset reference — `IT63` names a mesh on disk. Renaming an item must
 * never move it, so the values are read before the write and checked after.
 */
async function idfileFingerprint(ids: readonly number[]): Promise<string> {
  const database = createNodeDatabase(contentDatabaseUrl());
  const placeholders = ids.map(() => "?").join(", ");
  const rows = (
    await database.query<{ id: number; idfile: string }>(
      `SELECT id, idfile FROM items WHERE id IN (${placeholders}) ORDER BY id`,
      [...ids],
    )
  ).rows;
  await database.close();
  return rows.map((row) => `${row.id}:${row.idfile}`).join("|");
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const rows = await loadRows();
  const { changes, errors } = await validate(rows);

  const byKind = new Map<ItemKind, number>();
  for (const change of changes) {
    byKind.set(change.kind, (byKind.get(change.kind) ?? 0) + 1);
  }
  process.stdout.write(`content-ai rename-items — ${rows.length} rows in the batch\n`);
  for (const [kind, count] of [...byKind].sort((l, r) => r[1] - l[1])) {
    process.stdout.write(`  ${kind.padEnd(11)} ${String(count).padStart(4)}\n`);
  }
  process.stdout.write(
    `  ${"names".padEnd(11)} ${String(new Set(changes.map((c) => c.proposed)).size).padStart(4)} distinct\n\n`,
  );

  if (errors.length > 0) {
    const shown = checkOnly ? errors : errors.slice(0, 40);
    process.stderr.write(`${errors.length} problem(s); nothing written:\n`);
    for (const error of shown) process.stderr.write(`  - ${error}\n`);
    if (shown.length < errors.length) {
      process.stderr.write(`  … and ${errors.length - shown.length} more\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write("all gates passed\n");
  if (checkOnly) return;

  const ids = changes.map((change) => change.id);
  const before = await idfileFingerprint(ids);

  const artifact = artifactPath("demo-item-names");
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(
    artifact,
    `${JSON.stringify(
      {
        batch: "demo-item-names",
        timestamp: new Date().toISOString(),
        source: "scripts/content-ai/item-name-map.ts",
        // The reverse map is the point of writing this file: the previous rename left no
        // way back, so its result could not be reproduced or undone.
        reverse: Object.fromEntries(changes.map((c) => [String(c.id), c.previous])),
        entries: changes,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const database = createNodeDatabase(contentDatabaseUrl());
  for (const change of changes) {
    await database.execute("UPDATE items SET name = ? WHERE id = ?", [
      change.proposed,
      change.id,
    ]);
  }
  await database.close();

  const after = await idfileFingerprint(ids);
  if (before !== after) {
    process.stderr.write("idfile changed during the rename; asset references have moved\n");
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `wrote ${changes.length} names, ${ids.length} idfile references unchanged; `
    + `reverse map in ${artifact}\n`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
