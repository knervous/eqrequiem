import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { createNodeDatabase } from "../../src/db/node/factory.js";
import { questManifest } from "../../src/zone/quest-zone-registry.js";
import { ZONES } from "../../src/content/eltania.js";
import { loadGazetteer } from "./gazetteer.js";
import { NAME_MAP, type NameKind } from "./name-map.js";
import { SOURCE_DATABASE, artifactPath, contentDatabaseUrl } from "./paths.js";

/**
 * Applies the authored NPC name map, keyed by each row's *original* EverQuest name.
 *
 * The rename this replaces was keyed by nothing in particular: it hashed a string and
 * hoped. Keying on the original name is what makes identical creatures identical again
 * and unrelated people distinct, without any collision detection at all.
 *
 * Nothing is written until every check below passes, and a reverse map is written
 * alongside the batch so the whole thing can be undone by key.
 *
 *   npm run content-ai:rename -- --check     report only, touch nothing
 *   npm run content-ai:rename                validate, then write
 */

const DEMO_ZONE_IDS = Object.values(ZONES).map((zone) => zone.id);

/** Names authored quest content matches on. Renaming one silently breaks the content. */
const PINNED = new Set(
  questManifest()
    .flatMap((manifestEntry) => manifestEntry.bindings)
    .filter((binding) => binding.kind === "npc")
    .map((binding) => binding.key.replaceAll(" ", "_")),
);

/** Kinds whose names identify one individual, so they may not be shared. */
const MUST_BE_UNIQUE: ReadonlySet<NameKind> = new Set<NameKind>(["character", "titled"]);

interface Row {
  readonly npc_key: string;
  readonly current: string;
  readonly original: string;
}

interface Change {
  readonly npcKey: string;
  readonly original: string;
  readonly previous: string;
  readonly proposed: string;
  readonly kind: NameKind;
}

async function loadRows(): Promise<Row[]> {
  const database = createNodeDatabase(contentDatabaseUrl());
  await database.execute(`ATTACH DATABASE '${SOURCE_DATABASE}' AS source`);
  const placeholders = DEMO_ZONE_IDS.map(() => "?").join(", ");
  const rows = (
    await database.query<Row>(
      `SELECT a.npc_key AS npc_key, a.name AS current, t.name AS original
         FROM npc_archetypes a
         JOIN source.npc_types t
           ON t.id = CAST(substr(a.npc_key, 5) AS INTEGER)
        WHERE a.id IN (
                SELECT m.npc_archetype_id
                  FROM spawn_points p
                  JOIN spawn_group_members m ON m.spawn_group_id = p.spawn_group_id
                 WHERE p.zone_id IN (${placeholders}))
        ORDER BY a.npc_key`,
      [...DEMO_ZONE_IDS],
    )
  ).rows;
  await database.close();
  return rows;
}

/** The article has to agree with the word that follows it, not with the word it replaced. */
function articleFor(head: string): "a" | "an" {
  return /^[aeiou]/i.test(head) ? "an" : "a";
}

export async function validate(rows: readonly Row[]): Promise<{
  readonly changes: readonly Change[];
  readonly errors: readonly string[];
}> {
  const gazetteer = await loadGazetteer();
  const errors: string[] = [];
  const changes: Change[] = [];

  // Completeness. A row the map does not cover would silently keep its bad name.
  const missing = [...new Set(rows.filter((row) => !NAME_MAP[row.original]).map((r) => r.original))];
  for (const name of missing.sort()) {
    errors.push(`no mapping for original name '${name}'`);
  }

  const unused = Object.keys(NAME_MAP).filter(
    (key) => !rows.some((row) => row.original === key),
  );
  for (const key of unused.sort()) {
    errors.push(`map entry '${key}' matches no demo-reachable row`);
  }

  const byProposed = new Map<string, Change[]>();

  for (const row of rows) {
    const mapped = NAME_MAP[row.original];
    if (!mapped) continue;
    const change: Change = {
      npcKey: row.npc_key,
      original: row.original,
      previous: row.current,
      proposed: mapped.name,
      kind: mapped.kind,
    };
    changes.push(change);

    // Gate 1 — no survivor. The replacement must not itself be EverQuest text, whole
    // name or coined token.
    if (gazetteer.hasName(mapped.name)) {
      errors.push(`'${mapped.name}' is itself a name in the source database`);
    }
    const coined = gazetteer.coinedTokensIn(mapped.name);
    if (coined.length > 0) {
      errors.push(`'${mapped.name}' reuses EverQuest token(s): ${coined.join(", ")}`);
    }

    // Gate 2 — form. `#` marks a special spawn; the article marks a generic.
    if (row.original.startsWith("#") && !mapped.name.startsWith("#")) {
      errors.push(`'${row.original}' -> '${mapped.name}' drops the '#' prefix`);
    }
    if (!row.original.startsWith("#") && mapped.name.startsWith("#")) {
      errors.push(`'${row.original}' -> '${mapped.name}' gains a '#' prefix it did not have`);
    }

    // Gate 3 — article agreement. This is what produced `an_pheldor_dawnspire`.
    const article = /^(an?)_/i.exec(mapped.name.replace(/^#/, ""));
    if (article) {
      const head = mapped.name.replace(/^#/, "").slice(article[1].length + 1);
      const expected = articleFor(head);
      if (article[1].toLowerCase() !== expected) {
        errors.push(
          `'${mapped.name}' reads "${article[1]} ${head.replaceAll("_", " ")}" — should be '${expected}_'`,
        );
      }
    }

    // Gate 4 — width, against the protocol's fixed-width name buffer.
    if (mapped.name.length > 64) {
      errors.push(`'${mapped.name}' is ${mapped.name.length} characters, over the 64 limit`);
    }

    // Gate 5 — no manufactured disambiguation suffixes. This is the defect being repaired.
    if (/_[0-9]+$/.test(mapped.name)) {
      errors.push(`'${mapped.name}' carries a numeric disambiguation suffix`);
    }

    const bucket = byProposed.get(mapped.name.toLowerCase());
    if (bucket) bucket.push(change);
    else byProposed.set(mapped.name.toLowerCase(), [change]);
  }

  // Gate 6 — uniqueness, but only where it means something. Creatures, props and engine
  // rows are expected to share; individuals are not.
  for (const [, sharing] of byProposed) {
    const individuals = sharing.filter((change) => MUST_BE_UNIQUE.has(change.kind));
    const distinctOriginals = new Set(individuals.map((change) => change.original));
    if (distinctOriginals.size > 1) {
      errors.push(
        `'${individuals[0]?.proposed}' is shared by unrelated individuals: `
        + [...distinctOriginals].join(", "),
      );
    }
  }

  // Gate 7 — pinned integrity. Quest content addresses these names; after the rename each
  // must still resolve to exactly one row.
  for (const pinned of PINNED) {
    const matches = changes.filter((change) => change.proposed === pinned);
    if (matches.length !== 1) {
      errors.push(
        `quest content addresses '${pinned}', which ${matches.length} rows would carry `
        + "after this rename (expected exactly 1)",
      );
    }
  }

  return { changes, errors };
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const rows = await loadRows();
  const { changes, errors } = await validate(rows);

  const byKind = new Map<NameKind, number>();
  for (const change of changes) {
    byKind.set(change.kind, (byKind.get(change.kind) ?? 0) + 1);
  }
  process.stdout.write(`content-ai rename — ${rows.length} demo-reachable NPC rows\n`);
  for (const [kind, count] of [...byKind].sort((l, r) => r[1] - l[1])) {
    process.stdout.write(`  ${kind.padEnd(10)} ${String(count).padStart(4)}\n`);
  }
  process.stdout.write(
    `  ${"names".padEnd(10)} ${String(new Set(changes.map((c) => c.proposed)).size).padStart(4)} distinct\n\n`,
  );

  if (errors.length > 0) {
    // `--check` is the authoring loop, so it prints everything; a failing write prints a
    // readable head and the count.
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

  const artifact = artifactPath("demo-npc-names");
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(
    artifact,
    `${JSON.stringify(
      {
        batch: "demo-npc-names",
        timestamp: new Date().toISOString(),
        source: "scripts/content-ai/name-map.ts",
        // The reverse map is the point of writing this file: the previous rename left no
        // way back, so its result could not be reproduced or undone.
        reverse: Object.fromEntries(changes.map((c) => [c.npcKey, c.previous])),
        entries: changes,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const database = createNodeDatabase(contentDatabaseUrl());
  for (const change of changes) {
    await database.execute("UPDATE npc_archetypes SET name = ? WHERE npc_key = ?", [
      change.proposed,
      change.npcKey,
    ]);
  }
  await database.close();

  process.stdout.write(`wrote ${changes.length} names; reverse map in ${artifact}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
