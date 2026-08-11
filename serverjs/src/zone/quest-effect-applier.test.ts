import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyCanonicalContentSchema,
  applyCanonicalRuntimeSchema,
} from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { CharacterProgressRepository } from "../progression/character-progress-repository.js";
import { QuestEffectApplier, type QuestEffectSource } from "./quest-effect-applier.js";
import { LevelCurve, questExperience } from "./quest-progression.js";
import type { QuestEffect } from "./quest-types.js";
import type { ZoneDeferredWrite } from "../persist/zone-write-intents.js";

const SESSION = 1;
const CHARACTER = 1;

/**
 * A content curve deliberately unlike the built-in default, so a test that passes can
 * only be reading the authored one.
 */
const AUTHORED_CURVE = [
  { level: 1, cumulativeExperience: 0 },
  { level: 2, cumulativeExperience: 1_000 },
  { level: 3, cumulativeExperience: 3_000 },
  { level: 4, cumulativeExperience: 7_000 },
  { level: 5, cumulativeExperience: 15_000 },
  { level: 6, cumulativeExperience: 40_000 },
];

async function fixture() {
  const database = createNodeDatabase("sqlite::memory:");
  await applyCanonicalRuntimeSchema(database);
  await applyCanonicalContentSchema(database);
  await database.execute(
    "INSERT INTO accounts (id, identity) VALUES (1, 'test')",
  );
  await database.execute(
    "INSERT INTO characters (id, account_id, name, level, experience) VALUES (?, 1, 'Ezaltarem', 5, ?)",
    [CHARACTER, 15_000],
  );
  for (const entry of AUTHORED_CURVE) {
    await database.execute(
      "INSERT INTO level_experience_curve (level, cumulative_experience) VALUES (?, ?)",
      [entry.level, entry.cumulativeExperience],
    );
  }
  const repository = new CharacterProgressRepository(database, database);
  const committed: { experience: number; level: number }[] = [];
  const source: QuestEffectSource = {
    journalFor: () => [],
    drainPersistence: () => [],
    character: () => ({ characterId: CHARACTER }),
    setCharacterProgression: (_sessionId, experience, level) => {
      committed.push({ experience, level });
    },
    dispatchLevelUp: () => [],
  };
  return { database, repository, source, committed };
}

function beatEffect(weight: "hint" | "discovery" | "beat" | "resolution", atLevel: number): QuestEffect {
  return {
    type: "award_xp",
    sessionId: SESSION,
    characterId: CHARACTER,
    questKey: "missing-patrol",
    // What the shard guessed from the built-in curve; the applier must not use it.
    amount: questExperience(LevelCurve.default(), atLevel, weight),
    source: "discovery",
    sourceKey: "missing-patrol:found-camp",
    awardKey: "found-camp",
    weight,
    atLevel,
  };
}

describe("authored beat awards", () => {
  it("publishes the in-memory XP result while deferring durable work", async () => {
    const { database, repository, committed } = await fixture();
    const deferred: Array<{ characterId: number; intent: ZoneDeferredWrite }> = [];
    const source: QuestEffectSource = {
      journalFor: () => [],
      drainPersistence: () => [],
      character: () => ({
        characterId: CHARACTER,
        // QuestCharacterState has already applied the effect before publishing it.
        experience: 15_225,
        level: 5,
      }),
      setCharacterProgression: (_sessionId, experience, level) => {
        committed.push({ experience, level });
      },
      dispatchLevelUp: () => [],
    };
    const applier = new QuestEffectApplier(repository, {
      deferWrite: (characterId, intent) => deferred.push({ characterId, intent }),
    });

    const deliveries = await applier.apply(source, [{
      type: "award_xp",
      sessionId: SESSION,
      characterId: CHARACTER,
      questKey: "combat:a_rat",
      amount: 225,
      source: "combat",
      sourceKey: "a_rat",
      awardKey: null,
    }]);

    assert.equal(deliveries[0]?.value.experience, 15_225);
    assert.deepEqual(deferred, [{
      characterId: CHARACTER,
      intent: { kind: "xp_award", amount: 225, resultingLevel: 5 },
    }]);
    assert.equal(
      Number((await database.query<{ experience: number }>(
        "SELECT experience FROM characters WHERE id = ?",
        [CHARACTER],
      )).rows[0]?.experience),
      15_000,
    );
    await database.close();
  });

  it("resolves a beat against the content curve, not the shard's estimate", async () => {
    const { database, repository, source, committed } = await fixture();
    const applier = new QuestEffectApplier(repository);

    await applier.apply(source, [beatEffect("discovery", 5)]);

    const expected = questExperience(new LevelCurve(AUTHORED_CURVE), 5, "discovery");
    assert.equal(committed.length, 1);
    assert.equal(committed[0]!.experience - 15_000, expected);
    assert.notEqual(
      expected,
      questExperience(LevelCurve.default(), 5, "discovery"),
      "the fixture must actually distinguish the two curves",
    );
    await database.close();
  });

  it("reconciles a deferred authored beat from the shard estimate to the content curve", async () => {
    const { database, repository, committed } = await fixture();
    const optimistic = questExperience(LevelCurve.default(), 5, "discovery");
    const resolved = questExperience(new LevelCurve(AUTHORED_CURVE), 5, "discovery");
    assert.notEqual(optimistic, resolved);
    const deferred: Array<{ characterId: number; intent: ZoneDeferredWrite }> = [];
    const source: QuestEffectSource = {
      journalFor: () => [],
      drainPersistence: () => [],
      character: () => ({
        characterId: CHARACTER,
        experience: 15_000 + optimistic,
        level: 5,
      }),
      setCharacterProgression: (_sessionId, experience, level) => {
        committed.push({ experience, level });
      },
      dispatchLevelUp: () => [],
    };
    const applier = new QuestEffectApplier(repository, {
      deferWrite: (characterId, intent) => deferred.push({ characterId, intent }),
    });

    const deliveries = await applier.apply(source, [beatEffect("discovery", 5)]);

    assert.equal(deliveries[0]?.value.experience, 15_000 + resolved);
    assert.deepEqual(committed, [{ experience: 15_000 + resolved, level: 5 }]);
    assert.deepEqual(deferred, [{
      characterId: CHARACTER,
      intent: { kind: "xp_award", amount: resolved, resultingLevel: 5 },
    }]);
    await database.close();
  });

  it("keeps a beat worth the same share of progress across the level band", async () => {
    const { database, repository, source, committed } = await fixture();
    const applier = new QuestEffectApplier(repository);
    const curve = new LevelCurve(AUTHORED_CURVE);

    await applier.apply(source, [beatEffect("discovery", 2)]);
    const lowAward = committed[0]!.experience - 15_000;

    // The same authored beat met ten levels later is worth more raw experience, but
    // the same fraction of the level it is earned at. That is the whole point of the
    // weight: a fixed 120 would be two thirds of level 1 and a rounding error later.
    const lowShare = lowAward / curve.progress(curve.cumulativeFor(2)).forLevel;
    const highShare =
      questExperience(curve, 5, "discovery")
      / curve.progress(curve.cumulativeFor(5)).forLevel;
    assert.ok(Math.abs(lowShare - highShare) < 0.005);
    await database.close();
  });

  it("still commits a literal award unchanged", async () => {
    const { database, repository, source, committed } = await fixture();
    const applier = new QuestEffectApplier(repository);

    await applier.apply(source, [{
      type: "award_xp",
      sessionId: SESSION,
      characterId: CHARACTER,
      questKey: "combat:a_rat",
      amount: 225,
      source: "combat",
      sourceKey: "a_rat",
      awardKey: null,
    }]);

    assert.equal(committed[0]!.experience - 15_000, 225);
    await database.close();
  });
});
