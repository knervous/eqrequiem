import Database from "better-sqlite3";

export interface ItemAuditSummary {
  readonly totalItems: number;
  readonly genericCleanItems: number;
  readonly legacyIpItemsCount: number;
  readonly sampleLegacyItems: readonly { id: number; name: string; matchedTerms: readonly string[] }[];
}

export const LEGACY_IP_TERMS = [
  "qeynos", "surefall", "blackburrow", "befallen", "freeport", "highpass",
  "antonica", "faydwer", "kunark", "velious", "luclin", "\\bodus\\b", "erollisi",
  "rallos", "tunare", "brell", "innoruuk", "cazic", "bertoxxulous", "mithaniel",
  "karana", "prexus", "quellious", "rodcet", "solusek", "tribunal", "veeshan",
  "firiona", "darkpaw", "splitpaw", "gnoll", "erudite", "iksar", "teir`dal", "teir'dal",
  "koada`dal", "koada'dal", "fier`dal", "fier'dal",
] as const;

export function auditAllDatabaseItems(dbPath = "data/content-db.sqlite"): ItemAuditSummary {
  const db = new Database(dbPath);
  const items = db.prepare("SELECT id, name FROM items").all() as { id: number; name: string }[];
  
  const sampleLegacyItems: { id: number; name: string; matchedTerms: string[] }[] = [];
  let genericCleanItems = 0;

  for (const item of items) {
    const lower = item.name.toLowerCase();
    const matchedTerms = LEGACY_IP_TERMS.filter((term) => new RegExp(term, "i").test(item.name));

    if (matchedTerms.length > 0) {
      sampleLegacyItems.push({ id: item.id, name: item.name, matchedTerms });
    } else {
      genericCleanItems++;
    }
  }

  db.close();

  return {
    totalItems: items.length,
    genericCleanItems,
    legacyIpItemsCount: sampleLegacyItems.length,
    sampleLegacyItems,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = auditAllDatabaseItems();
  console.log("=== FULL DATABASE ITEM AUDIT REPORT ===");
  console.log(`Total Items in Content DB: ${summary.totalItems}`);
  console.log(`Generic & Clean Items:    ${summary.genericCleanItems} (e.g. Short Sword, Leather Boots)`);
  console.log(`Legacy IP Items Flagged:  ${summary.legacyIpItemsCount}`);
  console.log("\nSample Flagged Items (carrying legacy IP terms):");
  for (const item of summary.sampleLegacyItems.slice(0, 20)) {
    console.log(`  [ID ${item.id}] ${item.name} -> matches: [${item.matchedTerms.join(", ")}]`);
  }
}
