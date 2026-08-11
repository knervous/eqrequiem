import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { CLASS_IDS } from "../combat/ability-types.js";
import { aspectPointsForLevel } from "../combat/aspects/types.js";
import { WARRIOR_ASPECTS } from "../combat/aspects/warrior.js";
import { TechniqueRepository } from "./technique-repository.js";
import {
  ASPECTS_BY_CLASS,
  LOADOUT,
  availablePoints,
  canLearn,
  canPrepare,
  canSpendAspectPoint,
  levelUpOutcome,
  newlyLearnable,
  slotKind,
  startingTechniques,
  trackDepth,
  type CharacterTechniqueState,
} from "./technique-progression.js";

function state(overrides: Partial<CharacterTechniqueState> = {}): CharacterTechniqueState {
  return {
    level: 1,
    classId: CLASS_IDS.warrior,
    learned: new Set(startingTechniques(CLASS_IDS.warrior)),
    knowledge: new Set(),
    prepared: new Map(),
    aspectPoints: new Map(),
    ...overrides,
  };
}

describe("technique acquisition", () => {
  it("makes a level 1 Warrior playable without visiting a trainer", () => {
    const starting = startingTechniques(CLASS_IDS.warrior);
    assert.deepEqual(starting.sort(), ["warrior.kick", "warrior.taunt"]);
  });

  it("keeps eligibility and acquisition separate", () => {
    // Level makes Brace *possible*; it does not hand it over.
    assert.equal(canLearn("warrior.brace", state({ level: 1 })), "level_too_low");
    assert.equal(canLearn("warrior.brace", state({ level: 2 })), null);
    const eligible = newlyLearnable(state({ level: 2 })).map((a) => a.id);
    assert.ok(eligible.includes("warrior.brace"));
    // Eligible is not learned: it is still absent from the character's kit.
    assert.equal(state({ level: 2 }).learned.has("warrior.brace"), false);
  });

  it("refuses a technique from another class", () => {
    assert.equal(
      canLearn("warrior.kick", state({ classId: CLASS_IDS.wizard, learned: new Set() })),
      "wrong_class",
    );
  });

  it("holds a technique behind the knowledge its acquisition requires", () => {
    // Intercept is learned from a guard captain, not bought at a level-up counter.
    assert.equal(canLearn("warrior.intercept", state({ level: 10 })), "missing_knowledge");
    assert.equal(
      canLearn("warrior.intercept", state({
        level: 10,
        knowledge: new Set(["talios.watch_trust"]),
      })),
      null,
    );
  });

  it("does not re-offer something already known", () => {
    assert.equal(
      canLearn("warrior.kick", state({ level: 5 })),
      "already_known",
    );
  });
});

describe("level up", () => {
  it("grants capability, not hotbar buttons", () => {
    const outcome = levelUpOutcome(2, 3, state({ level: 3 }));
    assert.equal(outcome.aspectPointsGained, 1);
    // It reports what became possible so a trainer can mention it...
    assert.ok(outcome.newlyEligible.includes("warrior.shield_bash"));
    // ...but nothing was learned by levelling.
    assert.equal(state({ level: 3 }).learned.has("warrior.shield_bash"), false);
  });

  it("grants one Aspect Point per level from level 2", () => {
    assert.equal(aspectPointsForLevel(1), 0);
    assert.equal(aspectPointsForLevel(2), 1);
    // The demo cap: nine points at level 10, exactly as designed.
    assert.equal(aspectPointsForLevel(10), 9);
  });
});

describe("prepared loadout", () => {
  it("is six primary, two reaction and one consumable", () => {
    assert.equal(LOADOUT.primarySlots, 6);
    assert.equal(LOADOUT.reactionSlots, 2);
    assert.equal(LOADOUT.totalSlots, 9);
    assert.equal(slotKind(0), "primary");
    assert.equal(slotKind(6), "reaction");
    assert.equal(slotKind(8), "consumable");
    assert.equal(slotKind(9), null);
  });

  it("locks swapping in combat", () => {
    const current = state({ level: 5 });
    assert.equal(canPrepare("warrior.kick", 0, current, false), null);
    assert.equal(canPrepare("warrior.kick", 0, current, true), "in_combat");
  });

  it("refuses to prepare something not learned, or twice", () => {
    const current = state({ level: 5, prepared: new Map([[0, "warrior.kick"]]) });
    assert.equal(canPrepare("warrior.brace", 1, current, false), "not_learned");
    assert.equal(canPrepare("warrior.kick", 1, current, false), "already_prepared");
    // Re-placing it in its own slot is a no-op, not a duplicate.
    assert.equal(canPrepare("warrior.kick", 0, current, false), null);
  });
});

describe("aspects", () => {
  it("never lets a track become a subclass", () => {
    for (const aspects of ASPECTS_BY_CLASS) {
      assert.equal(aspects.tracks.length, 2);
      assert.ok(aspects.neverLost.length > 0, "a class must declare what it keeps");
      for (const track of aspects.tracks) {
        for (const node of track.nodes) {
          // A node modifies, unlocks or reacts. Nothing removes a class verb.
          assert.ok(["passive", "modifier", "active", "reaction"].includes(node.kind));
          assert.ok(node.effect.length > 10, `${node.id} needs a real effect`);
          assert.ok(node.cost >= 1);
        }
      }
    }
  });

  it("gates depth per track, not by total points spent", () => {
    const bulwark = WARRIOR_ASPECTS.tracks[0];
    const deep = bulwark.nodes.find((node) => node.requiresTrackDepth >= 3)!;
    // Four points, but all in the *other* track: the gate must still hold.
    const vanguard = WARRIOR_ASPECTS.tracks[1];
    const inVanguard = new Map(vanguard.nodes.slice(0, 4).map((node) => [node.id, 1]));
    assert.equal(
      canSpendAspectPoint(deep.id, state({ level: 10, aspectPoints: inVanguard })),
      "track_too_shallow",
    );
    assert.equal(trackDepth(vanguard.id, inVanguard), 4);
    assert.equal(trackDepth(bulwark.id, inVanguard), 0);
  });

  it("lets points be split freely across both tracks", () => {
    // No "pick a spec" gate: a 5/4 split is a legal, ordinary build.
    let points = new Map<string, number>();
    let current = state({ level: 10, aspectPoints: points });
    for (const track of WARRIOR_ASPECTS.tracks) {
      for (const node of track.nodes.slice(0, 4)) {
        assert.equal(canSpendAspectPoint(node.id, current), null, node.id);
        points = new Map([...points, [node.id, 1]]);
        current = state({ level: 10, aspectPoints: points });
      }
    }
    assert.equal(availablePoints(current), 1);
  });

  it("refuses to spend points the character does not have", () => {
    const first = WARRIOR_ASPECTS.tracks[0].nodes[0]!;
    assert.equal(
      canSpendAspectPoint(first.id, state({ level: 1 })),
      "no_points_remaining",
    );
  });
});

describe("progression persistence", () => {
  async function fixture() {
    const database = createNodeDatabase("sqlite::memory:");
    await applyCanonicalRuntimeSchema(database);
    await database.execute("INSERT INTO accounts (id, identity) VALUES (1, 'test')");
    await database.execute(
      "INSERT INTO characters (id, account_id, name, level, class_id) VALUES (1, 1, 'Halvane', 10, ?)",
      [CLASS_IDS.warrior],
    );
    return { database, repository: new TechniqueRepository(database) };
  }

  it("round-trips learned techniques, loadout and aspects", async () => {
    const { database, repository } = await fixture();
    await repository.grantStartingTechniques(1, CLASS_IDS.warrior);

    let current = await repository.load(1, { level: 10, classId: CLASS_IDS.warrior });
    assert.equal(current.learned.size, 2);
    // Both starting techniques land on the bar; which slot each takes is authoring
    // order, not a rule worth pinning.
    assert.deepEqual(
      [...current.prepared.values()].sort(),
      ["warrior.kick", "warrior.taunt"],
    );

    assert.equal(await repository.learn(1, "warrior.brace", current), null);
    current = await repository.load(1, { level: 10, classId: CLASS_IDS.warrior });
    assert.equal(await repository.prepare(1, "warrior.brace", 2, current, false), null);

    const node = WARRIOR_ASPECTS.tracks[0].nodes[0]!;
    current = await repository.load(1, { level: 10, classId: CLASS_IDS.warrior });
    assert.equal(await repository.spendAspectPoint(1, node.id, current), null);

    const reloaded = await repository.load(1, { level: 10, classId: CLASS_IDS.warrior });
    assert.ok(reloaded.learned.has("warrior.brace"));
    assert.equal(reloaded.prepared.get(2), "warrior.brace");
    assert.equal(reloaded.aspectPoints.get(node.id), 1);
    await database.close();
  });

  it("refuses an ineligible learn at the persistence boundary too", async () => {
    const { database, repository } = await fixture();
    const current = await repository.load(1, { level: 1, classId: CLASS_IDS.warrior });
    assert.equal(await repository.learn(1, "warrior.brace", current), "level_too_low");
    const after = await repository.load(1, { level: 1, classId: CLASS_IDS.warrior });
    assert.equal(after.learned.has("warrior.brace"), false);
    await database.close();
  });

  it("refunds every point on respec and keeps knowledge", async () => {
    const { database, repository } = await fixture();
    await repository.grantStartingTechniques(1, CLASS_IDS.warrior);
    let current = await repository.load(1, { level: 10, classId: CLASS_IDS.warrior });
    await repository.spendAspectPoint(1, WARRIOR_ASPECTS.tracks[0].nodes[0]!.id, current);

    await repository.respecAspects(1);
    current = await repository.load(1, { level: 10, classId: CLASS_IDS.warrior });
    assert.equal(current.aspectPoints.size, 0);
    assert.equal(availablePoints(current), 9, "all nine points return");
    assert.equal(current.learned.size, 2, "a respec must never unlearn a technique");
    await database.close();
  });
});
