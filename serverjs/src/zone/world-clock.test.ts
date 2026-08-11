import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

  /**
   * The client sky derives its hour from the same function of wall time rather than
   * receiving it, so the only thing holding the two in phase is these constants being
   * equal. Nothing else in either build would notice if one of them changed.
   */
  it("agrees with the client sky on epoch hour and day length", async () => {
    const path = fileURLToPath(
      new URL("../../../client/src/Game/Sky/sky-motion.ts", import.meta.url),
    );
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch {
      return; // Server-only checkout; nothing to hold in phase.
    }
    const epochHour = /WORLD_CLOCK_EPOCH_HOUR\s*=\s*(\d+(?:\.\d+)?)/.exec(source)?.[1];
    const dayLength = /dayLengthSeconds:\s*(\d+)/.exec(source)?.[1];
    assert.equal(
      Number(epochHour),
      worldHourAt(0),
      "client epoch hour must match the server world clock at the Unix epoch",
    );
    assert.equal(Number(dayLength), DEFAULT_DAY_LENGTH_SECONDS);
  });
});
