import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  recastToRuntimePoint,
  runtimeToRecastPoint,
} from "./coordinates.js";

describe("Requiem/Recast coordinate boundary", () => {
  it("maps final Babylon Y-up world coordinates to Recast and back", () => {
    const runtime = { x: -428, y: 3, z: -74 };
    const recast = runtimeToRecastPoint(runtime);
    assert.deepEqual(recast, { x: -74, y: 3, z: 428 });
    assert.deepEqual(recastToRuntimePoint(recast), runtime);
  });
});
