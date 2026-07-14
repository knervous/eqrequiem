import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ZoneSpatialIndex } from "./spatial-index.js";

describe("zone spatial AOI index", () => {
  it("selects sessions from the 27 neighboring cells and rebuckets movement", () => {
    const index = new ZoneSpatialIndex(300, 1);
    index.upsertEntity(7, { x: 0, y: 0, z: 0 });
    index.upsertSession(10, { x: 299, y: 0, z: 0 });
    index.upsertSession(11, { x: 301, y: 0, z: 0 });
    index.upsertSession(12, { x: 601, y: 0, z: 0 });
    assert.deepEqual(index.recipientsForEntity(7), [10, 11]);

    assert.equal(index.upsertEntity(7, { x: 600, y: 0, z: 0 }), true);
    assert.deepEqual(index.recipientsForEntity(7), [11, 12]);
    assert.deepEqual(index.entitiesForSession(10), []);
  });

  it("cleans empty sparse buckets", () => {
    const index = new ZoneSpatialIndex();
    index.upsertEntity(1, { x: -1, y: -1, z: -1 });
    index.upsertSession(2, { x: -1, y: -1, z: -1 });
    index.removeEntity(1);
    index.removeSession(2);
    assert.equal(index.occupiedEntityCells, 0);
    assert.equal(index.occupiedSessionCells, 0);
  });
});
