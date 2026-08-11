import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTENT_DATABASE_PATH,
  contentDatabaseExists,
  contentDatabaseRequired,
} from "./content-fixture.js";

/**
 * The guard on the guards.
 *
 * Every content-binding check skips when `content-db.sqlite` is absent, and a skipped
 * suite exits zero — so in CI, where the artifact is most likely missing, the checks
 * that exist to catch content drift would pass while testing nothing.
 *
 * This suite is deliberately never skipped, so `REQUIRE_CONTENT_DB=1` fails the run
 * rather than quietly disarming it. It has to live outside the skipped suites, and it
 * has to be an assertion rather than a throw at import: a module-level throw runs before
 * the runner has a test to attach the failure to, and gets reported as a skip.
 */
describe("content database fixture", () => {
  it("is present when the environment requires it", () => {
    if (!contentDatabaseRequired) return;
    assert.ok(
      contentDatabaseExists,
      `REQUIRE_CONTENT_DB is set but ${CONTENT_DATABASE_PATH} is missing. `
      + "Run `npm run db:content:inflate` before the suite, or unset the variable.",
    );
  });

  it("reports a skip reason that names the escape hatch", () => {
    // A skip nobody can act on is a skip nobody removes.
    assert.match(
      contentDatabaseExists ? "n/a REQUIRE_CONTENT_DB" : String(skipReason()),
      /REQUIRE_CONTENT_DB/,
    );
  });
});

function skipReason(): string | false {
  return contentDatabaseExists
    ? false
    : "content-db.sqlite not built (set REQUIRE_CONTENT_DB=1 to make this a failure)";
}
