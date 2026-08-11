import { fileURLToPath } from "node:url";

/**
 * Where the content-renaming pipeline reads and writes.
 *
 * `contentDatabase` is the promoted, shipped content. `sourceDatabase` is the raw
 * EverQuest hydration input, used only as the gazetteer — the pipeline never writes to
 * it, and treats its contents purely as the set of names that must not survive.
 */

export const CONTENT_DATABASE = fileURLToPath(
  new URL("../../data/content-db.sqlite", import.meta.url),
);

export const SOURCE_DATABASE = fileURLToPath(
  new URL("../../data/game_content.sqlite", import.meta.url),
);

export const BATCH_DIRECTORY = fileURLToPath(
  new URL("../../artifacts/content-rename", import.meta.url),
);

export function contentDatabaseUrl(path = CONTENT_DATABASE): string {
  return `sqlite:${path}`;
}

export function artifactPath(batchName: string): string {
  return `${BATCH_DIRECTORY}/${batchName}.json`;
}
