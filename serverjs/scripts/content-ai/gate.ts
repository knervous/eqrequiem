import { readFile } from "node:fs/promises";
import { loadGazetteer } from "./gazetteer.js";
import { artifactPath } from "./paths.js";
import type { ProposalBatch } from "./propose.js";

export interface GateResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
}

export async function validateBatch(batchName: string = "demo-eltania-rename"): Promise<GateResult> {
  const filePath = artifactPath(batchName);
  const raw = await readFile(filePath, "utf8");
  const batch: ProposalBatch = JSON.parse(raw);
  const gazetteer = await loadGazetteer();
  const errors: string[] = [];
  const proposedNames = new Set<string>();

  for (const entry of batch.entries) {
    if (entry.status !== "approved") continue;

    const proposed = entry.proposed;

    // Gate 1: No survivor in game_content.sqlite gazetteer
    const coinedInProposed = gazetteer.coinedTokensIn(proposed);
    if (coinedInProposed.length > 0) {
      errors.push(
        `Gate 1 Failure [Survivor]: '${proposed}' contains legacy EverQuest tokens [${coinedInProposed.join(", ")}]`,
      );
    }

    // Gate 2: No duplicate collisions for non-generic names
    const isGeneric = /^an?[ _]/i.test(entry.original);
    if (!isGeneric && proposedNames.has(proposed.toLowerCase())) {
      errors.push(`Gate 2 Failure [Collision]: Duplicate proposed name '${proposed}'`);
    }
    proposedNames.add(proposed.toLowerCase());

    // Gate 3: Form preservation (# prefix and a_/an_ article)
    if (entry.original.startsWith("#") && !proposed.startsWith("#")) {
      errors.push(`Gate 3 Failure [Form]: '${entry.original}' lost its '#' prefix in '${proposed}'`);
    }
    if (/^an?[ _]/i.test(entry.original) && !/^an?[ _]/i.test(proposed)) {
      errors.push(`Gate 3 Failure [Form]: '${entry.original}' lost its article prefix in '${proposed}'`);
    }

    // Gate 4: Maximum width check (< 64 chars)
    if (proposed.length > 64) {
      errors.push(`Gate 4 Failure [Width]: '${proposed}' exceeds maximum buffer length of 64 characters`);
    }
  }

  const passed = errors.length === 0;
  console.log(`Gate validation for '${batchName}': ${passed ? "PASSED" : "FAILED (" + errors.length + " errors)"}`);
  if (!passed) {
    for (const err of errors.slice(0, 10)) {
      console.error(`  - ${err}`);
    }
  }

  return { passed, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await validateBatch();
  if (!result.passed) process.exitCode = 1;
}
