import { extract } from "./extract.js";

/**
 * The release gate: does anything the demo can reach still carry an EverQuest name?
 *
 * This needs no model and no artifacts, so it is worth running long before the renaming
 * machinery exists — it measures the problem now and proves when it is solved. It is
 * checklist item N's "automated scan for banned legacy names in shipped content".
 *
 * Exit code 1 when legacy names remain, so CI can depend on it.
 */

export interface AuditReport {
  readonly total: number;
  readonly byClass: Record<string, number>;
  readonly byCohort: { readonly cohort: string; readonly remaining: number }[];
  readonly clean: boolean;
}

export async function audit(): Promise<AuditReport> {
  const names = await extract();
  const byClass: Record<string, number> = {};
  const cohorts = new Map<string, number>();
  for (const entry of names) {
    byClass[entry.nameClass] = (byClass[entry.nameClass] ?? 0) + 1;
    if (entry.nameClass === "legacy" || entry.nameClass === "structural") {
      cohorts.set(entry.cohort, (cohorts.get(entry.cohort) ?? 0) + 1);
    }
  }
  const byCohort = [...cohorts.entries()]
    .map(([cohort, remaining]) => ({ cohort, remaining }))
    .sort((left, right) => right.remaining - left.remaining);
  return {
    total: names.length,
    byClass,
    byCohort,
    // `pinned` counts as unclean too: a pinned name is legacy text the demo displays,
    // it is merely one the renamer may not touch without also editing eltania.ts.
    clean: (byClass.legacy ?? 0) + (byClass.structural ?? 0) + (byClass.pinned ?? 0) === 0,
  };
}

async function main(): Promise<void> {
  const report = await audit();
  const remaining =
    (report.byClass.legacy ?? 0)
    + (report.byClass.structural ?? 0)
    + (report.byClass.pinned ?? 0);

  process.stdout.write(
    `content-ai audit — ${report.total} demo-reachable names\n`
    + `  legacy      ${report.byClass.legacy ?? 0}\n`
    + `  structural  ${report.byClass.structural ?? 0}\n`
    + `  pinned      ${report.byClass.pinned ?? 0}  (bound in eltania.ts)\n`
    + `  clean       ${report.byClass.clean ?? 0}\n\n`,
  );

  if (report.clean) {
    process.stdout.write("no EverQuest names reachable from demo content\n");
    return;
  }

  process.stdout.write("largest remaining cohorts:\n");
  for (const entry of report.byCohort.slice(0, 12)) {
    process.stdout.write(`  ${String(entry.remaining).padStart(5)}  ${entry.cohort}\n`);
  }
  process.stderr.write(`\n${remaining} names still come from the EverQuest source data\n`);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
