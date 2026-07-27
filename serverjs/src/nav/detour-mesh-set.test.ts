import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { prepareDetourMeshSet } from "./detour-mesh-set.js";

const meshPath = fileURLToPath(
  new URL("../../../server/maps/qeynos2.bin", import.meta.url),
);

describe("Detour mesh-set preparation", () => {
  it("normalizes the checked-in legacy Qeynos tile stream", async () => {
    const source = new Uint8Array(await readFile(meshPath));
    const prepared = prepareDetourMeshSet(source);
    const view = new DataView(
      prepared.bytes.buffer,
      prepared.bytes.byteOffset,
      prepared.bytes.byteLength,
    );

    assert.equal(prepared.normalizedLegacyFormat, true);
    assert.equal(prepared.tileCount, 32);
    assert.equal(view.getUint32(8, true), 32);
    assert.notEqual(view.getUint32(40, true), 0);
    assert.equal(view.getUint32(48, true), 0x444e4156);
  });

  it("rejects bytes that are not a Recast MSET", () => {
    assert.throws(
      () => prepareDetourMeshSet(new Uint8Array(40)),
      /invalid MSET magic/,
    );
  });
});
