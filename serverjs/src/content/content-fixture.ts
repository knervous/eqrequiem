import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Whether the content database a test needs is actually present.
 *
 * The content database is a build artifact (`db:content:inflate`), so tests that check
 * the vocabulary against real content have to tolerate its absence on a fresh clone.
 * The trap is that a silent skip looks identical to a pass: in CI, where the artifact is
 * most likely missing, the checks that exist specifically to catch content drift would
 * protect nothing and say so in a way nobody reads.
 *
 * So absence is only tolerated when nobody has claimed it should be there. Set
 * `REQUIRE_CONTENT_DB=1` — in CI, or locally after inflating — and a missing artifact
 * becomes a failure instead of a skip.
 */

export const CONTENT_DATABASE_PATH = fileURLToPath(
  new URL("../../data/content-db.sqlite", import.meta.url),
);

export const contentDatabaseExists = existsSync(CONTENT_DATABASE_PATH);

/** Set by CI, or locally after inflating, to turn a skip into a failure. */
export const contentDatabaseRequired =
  process.env.REQUIRE_CONTENT_DB === "1" || process.env.REQUIRE_CONTENT_DB === "true";

/**
 * The `skip` value for a suite that needs real content. `false` runs it; a string skips
 * with a reason. Never skips when the artifact is required.
 */
export const skipWithoutContentDatabase: false | string = contentDatabaseExists
  ? false
  : "content-db.sqlite not built (set REQUIRE_CONTENT_DB=1 to make this a failure)";
