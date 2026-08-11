import { loadGazetteer } from "./gazetteer.js";

/**
 * Authoring aid: which of these candidate words would the release gate reject?
 *
 * The gate calls a token "coined" when it appears somewhere in the EverQuest source data
 * and is not in the system dictionary. That is deliberately blunt and over-flags — it
 * rejects ordinary English inflections like `charred` and `fouled` because the dictionary
 * holds base forms only and EverQuest happens to use them. A false positive costs one
 * word, so the cheap fix is to check candidate vocabulary up front instead of discovering
 * it one failed batch at a time.
 *
 *   npm run content-ai:tokens -- gaunt rimebound charred
 */

async function main(): Promise<void> {
  const candidates = process.argv.slice(2).filter((argument) => !argument.startsWith("-"));
  if (candidates.length === 0) {
    process.stderr.write("usage: content-ai:tokens <word> [word …]\n");
    process.exitCode = 1;
    return;
  }
  const gazetteer = await loadGazetteer();
  const clean: string[] = [];
  const rejected: string[] = [];
  for (const candidate of candidates) {
    const coined = gazetteer.coinedTokensIn(candidate);
    const whole = gazetteer.hasName(candidate);
    if (coined.length === 0 && !whole) clean.push(candidate);
    else rejected.push(`${candidate}${whole ? " (whole name in source)" : ""}`);
  }
  process.stdout.write(`clean    ${clean.join(" ")}\n`);
  process.stdout.write(`rejected ${rejected.join(" ")}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
