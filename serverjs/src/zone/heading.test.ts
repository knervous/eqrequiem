import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { eqHeadingToRadians, radiansToEqHeading } from "./heading.js";

describe("heading units", () => {
  it("converts persisted EQ turns to runtime radians", () => {
    assert.equal(eqHeadingToRadians(0), 0);
    assert.equal(eqHeadingToRadians(128), Math.PI / 2);
    assert.equal(eqHeadingToRadians(256), Math.PI);
    assert.equal(eqHeadingToRadians(512), Math.PI * 2);
  });

  it("round-trips and normalizes runtime radians for persistence", () => {
    assert.equal(radiansToEqHeading(0), 0);
    assert.equal(radiansToEqHeading(Math.PI / 2), 128);
    assert.equal(radiansToEqHeading(-Math.PI / 2), 384);
    assert.equal(radiansToEqHeading(Math.PI * 2), 0);
  });
});
