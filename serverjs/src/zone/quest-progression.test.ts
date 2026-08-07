import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LevelCurve,
  combatExperience,
  defaultLevelCurve,
  questExperience,
  splitGroupExperience,
} from "./quest-progression.js";

describe("LevelCurve", () => {
  it("derives level and in-level progress from cumulative experience", () => {
    const curve = new LevelCurve([
      { level: 1, cumulativeExperience: 0 },
      { level: 2, cumulativeExperience: 100 },
      { level: 3, cumulativeExperience: 300 },
    ]);

    assert.deepEqual(curve.progress(0), {
      level: 1, experience: 0, intoLevel: 0, forLevel: 100, capped: false,
    });
    assert.deepEqual(curve.progress(150), {
      level: 2, experience: 150, intoLevel: 50, forLevel: 200, capped: false,
    });
    assert.deepEqual(curve.progress(400), {
      level: 3, experience: 400, intoLevel: 100, forLevel: 0, capped: true,
    });
  });

  it("reports the crossed threshold and never rolls a granted level back", () => {
    const curve = new LevelCurve([
      { level: 1, cumulativeExperience: 0 },
      { level: 2, cumulativeExperience: 100 },
      { level: 3, cumulativeExperience: 300 },
    ]);

    const levelled = curve.award({ experience: 90, level: 1 }, 20);
    assert.equal(levelled.level, 2);
    assert.equal(levelled.previousLevel, 1);
    assert.equal(levelled.leveled, true);
    assert.equal(levelled.gained, 20);

    // A GM-granted level ahead of the curve survives an award.
    const granted = curve.award({ experience: 0, level: 3 }, 10);
    assert.equal(granted.level, 3);
    assert.equal(granted.leveled, false);
  });

  it("ships a monotonic default curve", () => {
    const entries = defaultLevelCurve(20);
    assert.equal(entries.length, 20);
    for (let index = 1; index < entries.length; index++) {
      assert.ok(
        entries[index]!.cumulativeExperience > entries[index - 1]!.cumulativeExperience,
        `level ${entries[index]!.level} must cost more than the level before it`,
      );
    }
    assert.equal(LevelCurve.default(20).levelFor(0), 1);
  });
});

describe("experience sources", () => {
  it("trivializes targets far below the killer instead of scaling the world", () => {
    assert.equal(combatExperience(10, 10), combatExperience(10, 12));
    assert.ok(combatExperience(10, 14) < combatExperience(10, 10));
    assert.equal(combatExperience(5, 20), 0);
  });

  it("never penalizes a group for sharing credit with a small bonus", () => {
    assert.equal(splitGroupExperience(300, 1), 300);
    assert.ok(splitGroupExperience(300, 3) * 3 > 300);
    assert.ok(splitGroupExperience(300, 3) < 300);
  });
});

describe("authored beat values", () => {
  it("keeps a beat worth the same share of a level across the band", () => {
    const curve = LevelCurve.default();
    for (const level of [1, 5, 20, 50]) {
      const award = questExperience(curve, level, "discovery");
      const levelCost = curve.progress(curve.cumulativeFor(level)).forLevel;
      const share = award / levelCost;
      assert.ok(
        share > 0.07 && share < 0.09,
        `level ${level} discovery was ${Math.round(share * 100)}% of a level`,
      );
    }
  });

  it("orders beats by how much they should matter", () => {
    const curve = LevelCurve.default();
    const at = (weight: Parameters<typeof questExperience>[2]) =>
      questExperience(curve, 5, weight);
    assert.ok(at("hint") < at("discovery"));
    assert.ok(at("discovery") < at("beat"));
    assert.ok(at("beat") < at("resolution"));
  });

  it("stays comparable to what killing things pays", () => {
    const curve = LevelCurve.default();
    // A resolution should be worth a session's worth of camp, not a level.
    const resolution = questExperience(curve, 10, "resolution");
    const perKill = combatExperience(10, 10);
    assert.ok(resolution > perKill, "a story resolution should beat one kill");
    assert.ok(resolution < perKill * 12, "but it should not replace playing the game");
  });
});
