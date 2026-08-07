import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { questManifest, validateQuestContent } from "./quest-zone-registry.js";

describe("quest content manifest", () => {
  it("passes its own static checks", () => {
    const problems = validateQuestContent();
    assert.deepEqual(
      problems,
      [],
      `authored quest content has manifest problems:\n${problems
        .map((problem) => `  ${problem.questKey}: ${problem.rule} (${problem.detail})`)
        .join("\n")}`,
    );
  });

  it("exposes every authored quest with a stable key and revision", () => {
    const manifest = questManifest();
    assert.ok(manifest.length > 0);
    for (const entry of manifest) {
      assert.match(entry.questKey, /^[a-z0-9:_-]+$/, entry.questKey);
      assert.ok(entry.revision >= 1, `${entry.questKey} needs a revision`);
    }
    assert.ok(
      manifest.some((entry) => entry.questKey === "qeynos2:missing-patrol"),
      "the vertical slice should be discoverable through the manifest",
    );
  });
});
