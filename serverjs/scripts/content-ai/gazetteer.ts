import { readFile } from "node:fs/promises";

import { createNodeDatabase } from "../../src/db/node/factory.js";
import { SOURCE_DATABASE } from "./paths.js";

/**
 * The set of names that must not survive into the shipped content database.
 *
 * Detection is deliberately not a judgement call and never involves a model. The raw
 * EverQuest hydration database *is* the source material, so "does this name come from
 * EverQuest" is set membership: exact, reproducible, and complete by construction.
 *
 * Two granularities are needed:
 *
 * - **Whole names** catch a carried-over name outright.
 * - **Coined tokens** catch a name that merely reuses a proper noun — a replacement
 *   like "Qeynos Watch Spear" is new text, so whole-name matching would pass it, and it
 *   is exactly the mistake a generator left unconstrained will make.
 *
 * A coined token is one that appears in the source data and is not an ordinary English
 * word. Subtracting the system dictionary is a blunt instrument, but it errs toward
 * flagging, and a false positive costs one regenerated name.
 */

const SYSTEM_WORDLIST = "/usr/share/dict/words";

/**
 * Tokens the dictionary happens to contain but which are still EverQuest's, plus the
 * franchise names themselves. Small and hand-kept on purpose: everything else is
 * derived.
 */
const ALWAYS_COINED = [
  "everquest",
  "norrath",
  "qeynos",
  "antonica",
  "faydwer",
  "kunark",
  "velious",
  "luclin",
  "odus",
  "freeport",
  "befallen",
  "blackburrow",
  "surefall",
  "highpass",
  "erollisi",
  "rallos",
  "tunare",
  "brell",
  "innoruuk",
  "cazic",
  "bertoxxulous",
  "mithaniel",
  "karana",
  "prexus",
  "quellious",
  "rodcet",
  "solusek",
  "tribunal",
  "veeshan",
  "firiona",
] as const;

export interface Gazetteer {
  /** True when the exact name is carried over from the source data. */
  hasName(name: string): boolean;
  /** Coined tokens found inside a candidate name. Empty means clean. */
  coinedTokensIn(name: string): string[];
  readonly nameCount: number;
  readonly tokenCount: number;
}

/** Case- and separator-insensitive: `Guard_Gehnus` and `guard gehnus` are one name. */
export function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
}

export function tokenize(value: string): string[] {
  return normalizeName(value)
    .split(/[^a-z`']+/)
    .map((token) => token.replaceAll(/[`']/g, ""))
    .filter((token) => token.length >= 3);
}

async function englishWords(): Promise<Set<string>> {
  try {
    const contents = await readFile(SYSTEM_WORDLIST, "utf8");
    return new Set(
      contents
        .split("\n")
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word.length > 0),
    );
  } catch {
    // Without a dictionary every source token looks coined. That over-flags rather
    // than under-flags, which is the safe direction, but say so loudly.
    process.stderr.write(
      `content-ai: no system wordlist at ${SYSTEM_WORDLIST}; every source token will `
      + "be treated as coined\n",
    );
    return new Set();
  }
}

export async function loadGazetteer(
  sourcePath = SOURCE_DATABASE,
): Promise<Gazetteer> {
  const database = createNodeDatabase(`sqlite:${sourcePath}`);
  const names = new Set<string>();
  const collect = async (sql: string): Promise<void> => {
    const rows = (await database.query<{ value: string }>(sql)).rows;
    for (const row of rows) {
      if (typeof row.value === "string" && row.value.trim()) {
        names.add(normalizeName(row.value));
      }
    }
  };
  await collect("SELECT DISTINCT name AS value FROM npc_types");
  await collect("SELECT DISTINCT name AS value FROM items");
  await collect("SELECT DISTINCT long_name AS value FROM zone");
  await collect("SELECT DISTINCT short_name AS value FROM zone");
  await database.close();

  const dictionary = await englishWords();
  const coined = new Set<string>(ALWAYS_COINED);
  for (const name of names) {
    for (const token of tokenize(name)) {
      if (!dictionary.has(token)) coined.add(token);
    }
  }

  return {
    hasName: (name) => names.has(normalizeName(name)),
    coinedTokensIn: (name) => {
      const seen = new Set<string>();
      for (const token of tokenize(name)) {
        if (coined.has(token)) seen.add(token);
      }
      return [...seen];
    },
    nameCount: names.size,
    tokenCount: coined.size,
  };
}
