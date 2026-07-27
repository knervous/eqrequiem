import assert from "node:assert/strict";
import test from "node:test";

import {
  isIsolatedPromotedTextureUrl,
  promotedObjectFileName,
} from "../src/Game/Model/object-asset-identity.ts";

test("promoted object files have prototype-scoped glTF identities", () => {
  const barrel = promotedObjectFileName("barrel3");
  const tree = promotedObjectFileName("tree1");

  assert.equal(barrel, "barrel3.glb");
  assert.equal(tree, "tree1.glb");
  assert.notEqual(barrel, tree);
  assert.equal(
    isIsolatedPromotedTextureUrl("data:tree1.glb#image0", tree),
    true,
  );
  assert.equal(
    isIsolatedPromotedTextureUrl("data:final.glb#image0", tree),
    false,
  );
  assert.equal(
    isIsolatedPromotedTextureUrl("data:image/png;base64,AAAA", tree),
    true,
  );
});

test("invalid prototype IDs cannot become loader cache keys", () => {
  assert.throws(() => promotedObjectFileName("../barrel3"), /Invalid/);
});
