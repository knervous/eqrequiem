import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { extract, type ExtractedName } from "./extract.js";
import { loadGazetteer, type Gazetteer } from "./gazetteer.js";
import { artifactPath } from "./paths.js";

export interface ProposedEntry {
  readonly target: {
    readonly table: ExtractedName["table"];
    readonly id: string;
  };
  readonly original: string;
  readonly proposed: string;
  readonly nameClass: ExtractedName["nameClass"];
  readonly cohort: string;
  readonly status: "approved" | "proposed" | "rejected";
  readonly note?: string;
}

export interface ProposalBatch {
  readonly batch: string;
  readonly timestamp: string;
  readonly status: "proposed" | "approved" | "promoted";
  readonly entries: readonly ProposedEntry[];
}

/**
 * NOTE: the NPC path here is superseded by `name-map.ts` + `rename-npcs.ts`.
 *
 * `generateCleanEltaniaToken` can only emit `Firstname_Surname`, so this gave personal
 * names to rats, boots and spawn timers, dropped every rank, and resolved its own
 * collisions with `_N` suffixes. It also never checks a candidate against names the same
 * batch already produced, and its two surname indices are correlated at `attempt = 0`,
 * which is why 15 surnames covered most of the world. See
 * `docs/shadows-of-eltania/08-npc-naming-repair.md`.
 *
 * Items and zones still flow through here. Do not use it to rename NPCs.
 */

/** Specific high-quality rule replacements for known EverQuest terms in Eltania lore */
const SPECIFIC_REPLACEMENTS: Record<string, string> = {
  // Zones
  "South Qeynos": "Talios Lowharbor",
  "North Qeynos": "Talios Crownward",
  "The Qeynos Hills": "The Greymarch",
  "The Surefall Glade": "The Greenveil",
  "Blackburrow": "Blackroot Hold",
  "Befallen": "Mournvault: The First Descent",

  // Pinned & Known Key NPCs
  "Guard_Gehnus": "Serjeant_Halvane",
  "Guard_Hezlan": "Watchman_Brey",
  "Captain_Tillin": "Captain_Robert_Vance",
  "Fippy_Darkpaw": "Blackroot_Raider",
  "Gnasher_Furgutt": "Blackroot_Road_Striker",
  "Lord_Elgnub": "Lord_Blackroot_Vale",
  "Gynok_Moltor": "Lord_Vane_Ash_Warden",
};

const FIRST_PREFIXES = [
  "Ael", "Hal", "Vanc", "Ther", "Kael", "Ery", "Cor", "Brey", "Sor", "Aeth",
  "Vael", "Gid", "Luc", "Cael", "Tar", "Ryl", "Mir", "Sil", "Bram", "Cal",
  "Drak", "Eld", "Falk", "Gar", "Hadr", "Iv", "Jor", "Lys", "Mar", "Nev",
  "Phel", "Quin", "Row", "Tor", "Ulr", "West",
];

const FIRST_SUFFIXES = [
  "ric", "vane", "ence", "on", "en", "ion", "in", "is", "gard", "or",
  "us", "ath", "oth", "ian", "dor", "mar", "reth", "thor", "wynn", "ar",
];

const LAST_PREFIXES = [
  "Crown", "Val", "Ash", "Silver", "Oak", "Shadow", "Frost", "Grey",
  "Alder", "Dawn", "High", "Gold", "Iron", "Storm", "Star",
];

const LAST_SUFFIXES = [
  "ward", "guard", "ford", "haven", "crest", "march", "wood", "seeker",
  "watch", "spire", "realm", "dale", "hand", "rider", "end",
];

const ITEM_PREFIXES = [
  "Eltanian", "Crownward", "Lowharbor", "Greymarch", "Greenveil",
  "Solskar", "Aethir", "Concordance", "Blackroot", "Mournvault",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function generateCleanEltaniaToken(seed: string, gazetteer: Gazetteer): string {
  const hash = hashString(seed);
  for (let attempt = 0; attempt < 100; attempt++) {
    const pIdx = (hash + attempt * 7) % FIRST_PREFIXES.length;
    const sIdx = (hash + attempt * 13) % FIRST_SUFFIXES.length;
    const first = FIRST_PREFIXES[pIdx] + FIRST_SUFFIXES[sIdx];

    const lpIdx = (hash + attempt * 17) % LAST_PREFIXES.length;
    const lsIdx = (hash + attempt * 23) % LAST_SUFFIXES.length;
    const last = LAST_PREFIXES[lpIdx] + LAST_SUFFIXES[lsIdx];

    const candidate = `${first}_${last}`;
    if (gazetteer.coinedTokensIn(candidate).length === 0 && !gazetteer.hasName(candidate)) {
      return candidate;
    }
  }
  return `Eltanian_${hash % 10000}`;
}

function transformName(original: string, gazetteer: Gazetteer, id: string, table: string): string {
  if (SPECIFIC_REPLACEMENTS[original]) {
    return SPECIFIC_REPLACEMENTS[original];
  }

  let name = original;

  // Franchise and lore terms
  name = name.replace(/\bQeynos\b/gi, "Talios");
  name = name.replace(/\bSurefall\b/gi, "Alderhollow");
  name = name.replace(/\bBlackburrow\b/gi, "Blackroot");
  name = name.replace(/\bBefallen\b/gi, "Mournvault");
  name = name.replace(/\bGnoll\b/gi, "Blackroot");
  name = name.replace(/\bgnoll\b/g, "blackroot");
  name = name.replace(/\bSabertooth\b/gi, "Blackroot_Company");
  name = name.replace(/\bTunare\b/gi, "Silvanus");
  name = name.replace(/\bKarana\b/gi, "Storm");
  name = name.replace(/\bRallos\b/gi, "Iron_Hearth");
  name = name.replace(/\bInnoruuk\b/gi, "Hollow_Star");
  name = name.replace(/\bBertoxxulous\b/gi, "Blight");
  name = name.replace(/\bCazic\b/gi, "Fear");
  name = name.replace(/\bDarkpaw\b/gi, "Blackroot");
  name = name.replace(/\bSplitpaw\b/gi, "Ironfang");

  // Check if the exact name still exists in gazetteer (source DB)
  if (gazetteer.hasName(name)) {
    if (table === "items") {
      const hash = hashString(name + id);
      const prefix = ITEM_PREFIXES[hash % ITEM_PREFIXES.length];
      name = `${prefix} ${name}`;
    } else {
      const coined = gazetteer.coinedTokensIn(name);
      if (coined.length > 0 || gazetteer.hasName(name)) {
        const cleanToken = generateCleanEltaniaToken(name + "_" + id, gazetteer);
        if (original.startsWith("#")) {
          name = "#" + cleanToken;
        } else if (/^an?[ _]/i.test(original)) {
          const match = original.match(/^(an?[ _])/i);
          const article = match ? match[1] : "a_";
          name = article + cleanToken.toLowerCase();
        } else {
          name = cleanToken;
        }
      }
    }
  }

  return name;
}

export async function generateProposals(batchName: string = "demo-eltania-rename"): Promise<ProposalBatch> {
  const extracted = await extract();
  const gazetteer = await loadGazetteer();
  const entries: ProposedEntry[] = [];
  const nameCounts = new Map<string, number>();

  for (const item of extracted) {
    if (item.nameClass === "clean") {
      continue;
    }

    let proposed = transformName(item.name, gazetteer, item.id, item.table);

    const lower = proposed.toLowerCase();
    const count = (nameCounts.get(lower) ?? 0) + 1;
    nameCounts.set(lower, count);
    if (count > 1 && !item.name.startsWith("a_") && !item.name.startsWith("an_") && item.table !== "items") {
      proposed = `${proposed}_${count}`;
    }

    entries.push({
      target: {
        table: item.table,
        id: item.id,
      },
      original: item.name,
      proposed,
      nameClass: item.nameClass,
      cohort: item.cohort,
      status: "approved",
      note: item.nameClass === "pinned" ? "Matches eltania.ts NPCS" : "Eltania canonical replacement",
    });
  }

  const batch: ProposalBatch = {
    batch: batchName,
    timestamp: new Date().toISOString(),
    status: "approved",
    entries,
  };

  const outputPath = artifactPath(batchName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(batch, null, 2), "utf8");

  console.log(`Generated proposal batch '${batchName}' with ${entries.length} entries.`);
  return batch;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateProposals();
}
