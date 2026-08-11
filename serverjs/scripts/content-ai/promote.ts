import { readFile } from "node:fs/promises";
import { createNodeDatabase } from "../../src/db/node/factory.js";
import { validateBatch } from "./gate.js";
import { artifactPath, contentDatabaseUrl } from "./paths.js";
import type { ProposalBatch } from "./propose.js";

export async function promoteBatch(batchName: string = "demo-eltania-rename"): Promise<void> {
  const gateResult = await validateBatch(batchName);
  if (!gateResult.passed) {
    throw new Error(`Cannot promote batch '${batchName}': failed gate checks.`);
  }

  const raw = await readFile(artifactPath(batchName), "utf8");
  const batch: ProposalBatch = JSON.parse(raw);
  const database = createNodeDatabase(contentDatabaseUrl());

  console.log(`Promoting batch '${batchName}' into ${contentDatabaseUrl()}...`);

  let updatedNpcs = 0;
  let updatedItems = 0;
  let updatedZones = 0;

  for (const entry of batch.entries) {
    if (entry.status !== "approved") continue;

    if (entry.target.table === "npc_archetypes") {
      await database.execute(
        "UPDATE npc_archetypes SET name = ? WHERE npc_key = ?",
        [entry.proposed, entry.target.id],
      );
      updatedNpcs++;
    } else if (entry.target.table === "items") {
      await database.execute(
        "UPDATE items SET name = ? WHERE id = ?",
        [entry.proposed, Number(entry.target.id)],
      );
      updatedItems++;
    } else if (entry.target.table === "zones") {
      await database.execute(
        "UPDATE zones SET name = ? WHERE id = ?",
        [entry.proposed, Number(entry.target.id)],
      );
      updatedZones++;
    }
  }

  await database.close();
  console.log(`Successfully promoted batch '${batchName}':`);
  console.log(`  - ${updatedZones} zones updated`);
  console.log(`  - ${updatedNpcs} NPC archetypes updated`);
  console.log(`  - ${updatedItems} items updated`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await promoteBatch();
}
