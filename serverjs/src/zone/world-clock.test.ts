import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_DAY_LENGTH_SECONDS, isNight, worldHourAt } from "./world-clock.js";

describe("world clock", () => {
  it("advances one full day per configured day length", () => {
    const start = worldHourAt(0);
    assert.equal(start, 12);
    assert.equal(worldHourAt(DEFAULT_DAY_LENGTH_SECONDS * 1000), 12);
    assert.equal(worldHourAt((DEFAULT_DAY_LENGTH_SECONDS / 2) * 1000), 0);
  });

  it("stays inside a day and is a pure function of the timestamp", () => {
    for (const nowMs of [0, 1, 12_345_678, 1e12, 1.7e12]) {
      const hour = worldHourAt(nowMs);
      assert.ok(hour >= 0 && hour < 24, `hour out of range: ${hour}`);
      assert.equal(worldHourAt(nowMs), hour);
    }
  });

  it("puts night where content expects it", () => {
    assert.equal(isNight(23), true);
    assert.equal(isNight(2), true);
    assert.equal(isNight(5), false);
    assert.equal(isNight(12), false);
  });
});
