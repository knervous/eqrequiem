import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { loadWorldSpatialContract } from "./world-spatial.js";

const worldPath = fileURLToPath(
  new URL(
    "../../../client/public/eqrequiem/worlds/talioscrownward.spatial.json.gz",
    import.meta.url,
  ),
);

describe("backend world spatial contract", () => {
  it("loads the same preprocessed Talios Crownward package consumed by the client", async () => {
    const contract = await loadWorldSpatialContract(worldPath, "talioscrownward");
    assert.equal(contract.zoneKey, "talioscrownward");
    assert.match(contract.layoutHash, /^[0-9a-f]{8}$/);
    assert.ok(contract.bounds.min[0] < -1_900);
  });

  it("rejects a package requested under another zone identity", async () => {
    await assert.rejects(
      loadWorldSpatialContract(worldPath, "talioslowharbor"),
      /incompatible runtime contract/,
    );
  });
});
