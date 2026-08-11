import Database from "better-sqlite3";
import { LEGACY_IP_TERMS } from "./audit-all-items.js";

const ITEM_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bQeynos\b/gi, "Talios"],
  [/\bFreeport\b/gi, "Highpoint"],
  [/\bSurefall\b/gi, "Greenveil"],
  [/\bBlackburrow\b/gi, "Blackroot"],
  [/\bBefallen\b/gi, "Mournvault"],
  [/\bHighpass\b/gi, "Sunspire"],
  [/\bAntonican\b/gi, "Eltanian"],
  [/\bAntonica\b/gi, "Eltania"],
  [/\bFaydwer\b/gi, "Sylvanus"],
  [/\bKunark\b/gi, "Solskar"],
  [/\bVelious\b/gi, "Frostreach"],
  [/\bLuclinite\b/gi, "Moontide"],
  [/\bQuellious\b/gi, "Serenity"],
  [/\bPrexus\b/gi, "Ocean Lord"],
  [/\bLuclin\b/gi, "Moontide"],
  [/\bOdus\b/gi, "Deepcrest"],
  [/\bBrells\b/gi, "Iron Forge's"],
  [/\bBrellium\b/gi, "Forgemetal"],
  [/\bBrellian\b/gi, "Forge-Iron"],
  [/\bBrell's\b/gi, "Iron Forge's"],
  [/\bBrell\b/gi, "Iron Forge"],
  [/\bRallosian\b/gi, "Iron Hearth"],
  [/\bCazicite\b/gi, "Fear-Gem"],
  [/\bGnollish\b/gi, "Blackroot"],
  [/\bTunarean\b/gi, "Silvan"],
  [/\bErollisi\b/gi, "Harmony"],
  [/\bErollisian\b/gi, "Harmonic"],
  [/\bErudition\b/gi, "Aethir Wisdom"],
  [/\bIksarian\b/gi, "Solskar"],
  [/\bTunare\b/gi, "Silvanus"],
  [/\bKarana\b/gi, "The Storm"],
  [/\bRallos\b/gi, "Iron Hearth"],
  [/\bInnoruuk\b/gi, "Hollow Star"],
  [/\bCazic\b/gi, "Fear Warden"],
  [/\bBertoxxulous\b/gi, "Blight Warden"],
  [/\bMithaniel\b/gi, "Valiant Light"],
  [/\bRodcet\b/gi, "Life Giver"],
  [/\bSolusek\b/gi, "Sunforge"],
  [/\bTunareberry\b/gi, "Silvanberry"],
  [/Tribunal/gi, "Concordance"],
  [/\bVeeshan\b/gi, "Skywyrm"],
  [/\bFiriona\b/gi, "Faelen"],
  [/\bGnoll\b/gi, "Blackroot"],
  [/\bgnoll\b/g, "blackroot"],
  [/\bErudite\b/gi, "Aethir"],
  [/\bIksar\b/gi, "Solskar"],
  [/\bTeir[`']Dal\b/gi, "Shadow Elf"],
  [/\bKoada[`']Dal\b/gi, "High Elf"],
  [/\bFier[`']Dal\b/gi, "Wood Elf"],
  [/\bDarkpaw\b/gi, "Blackroot"],
  [/\bSplitpaw\b/gi, "Ironfang"],
];

export function renameLegacyItems(dbPath = "data/content-db.sqlite"): { updatedCount: number } {
  const db = new Database(dbPath);
  const items = db.prepare("SELECT id, name FROM items").all() as { id: number; name: string }[];
  
  const updateStmt = db.prepare("UPDATE items SET name = ? WHERE id = ?");
  let updatedCount = 0;

  db.transaction(() => {
    for (const item of items) {
      const lower = item.name.toLowerCase();
      const hasLegacyTerm = LEGACY_IP_TERMS.some((term) => lower.includes(term));
      
      if (hasLegacyTerm) {
        let newName = item.name;
        for (const [regex, replacement] of ITEM_REPLACEMENTS) {
          newName = newName.replace(regex, replacement);
        }

        if (newName !== item.name) {
          updateStmt.run(newName, item.id);
          updatedCount++;
        }
      }
    }
  })();

  db.close();
  return { updatedCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Renaming all remaining legacy items across the database...");
  const result = renameLegacyItems();
  console.log(`Successfully renamed ${result.updatedCount} legacy items in content-db.sqlite!`);
}
