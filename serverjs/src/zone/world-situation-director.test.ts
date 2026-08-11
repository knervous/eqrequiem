import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { WorldStateRepository } from "../persist/world-state-repository.js";
import { WorldStateService } from "./world-state-service.js";
import {
  runSituationDirector,
  WorldSituationDirector,
} from "./world-situation-director.js";
import { defineSituation, situationRng } from "./world-situations.js";
import { WORLD_FACTS } from "./world-facts.js";
import { validateSituations, WORLD_SITUATIONS } from "./situations/index.js";

/**
 * The director must be reproducible from a seed and a world state, because that is the
 * only way authored content that "sometimes happens" can be tested at all.
 */
async function harness(options: { seed?: number; now?: () => number } = {}) {
  const database = createNodeDatabase("sqlite::memory:");
  await applyCanonicalRuntimeSchema(database);
  const repository = new WorldStateRepository(database);
  const world = new WorldStateService(
    repository,
    options.now ? { now: options.now } : {},
  );
  await world.start();
  return { database, repository, world };
}

const ambush = defineSituation({
  key: "greymarch:road-ambush",
  discovery: { kind: "sight", text: "Carts stopped wrong on the road." },
  canStart: ({ world }) => world.number(WORLD_FACTS.blackrootPressure) >= 60,
  weight: 8,
  cooldown: { minMinutes: 30, maxMinutes: 30 },
  durationMinutes: 10,
  exclusiveGroup: "greymarch-road",
  create: ({ rng }) => ({ route: rng.pick(["west-road", "farm-road", "north-track"]) }),
});

const patrol = defineSituation({
  key: "greymarch:overdue-patrol",
  discovery: { kind: "rumor", text: "The watch is short a patrol." },
  canStart: ({ world }) => world.number(WORLD_FACTS.blackrootPressure) >= 45,
  weight: 6,
  exclusiveGroup: "greymarch-road",
});

describe("world situation director", () => {
  it("waits for an in-flight evaluation when its loop stops", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const began = new Promise<void>((resolve) => { started = resolve; });
    const director = {
      evaluate: async () => {
        started();
        await gate;
        return { started: [], expired: [], skipped: [] };
      },
    } as unknown as WorldSituationDirector;
    const loop = runSituationDirector(director);
    await began;

    let stopped = false;
    const stopping = loop.stop().then(() => { stopped = true; });
    await Promise.resolve();
    assert.equal(stopped, false);
    release();
    await stopping;
    assert.equal(stopped, true);
  });

  it("starts nothing while world state says the reason does not exist", async () => {
    const { database, world } = await harness();
    const director = new WorldSituationDirector(world, [ambush], { seed: 7 });
    await world.setFact(WORLD_FACTS.blackrootPressure, 20);

    const result = await director.evaluate(1_000);
    assert.deepEqual(result.started, []);
    assert.equal(director.explain("greymarch:road-ambush", 1_000), "world state says no");
    await database.close();
  });

  it("produces the same occurrence twice from the same seed and state", async () => {
    const first = await harness();
    const second = await harness();
    for (const { world } of [first, second]) {
      await world.setFact(WORLD_FACTS.blackrootPressure, 80);
    }
    const runs = await Promise.all(
      [first, second].map(async ({ world }) => {
        const director = new WorldSituationDirector(world, [ambush, patrol], { seed: 42 });
        const evaluation = await director.evaluate(5_000);
        return evaluation.started.map((entry) => ({
          key: entry.situationKey,
          seed: entry.seed,
          data: entry.data,
        }));
      }),
    );
    assert.equal(runs[0]!.length, 1);
    assert.deepEqual(runs[0], runs[1], "same seed and state must replay identically");
    await Promise.all([first.database.close(), second.database.close()]);
  });

  it("holds an exclusive group to one situation at a time", async () => {
    const { database, world } = await harness();
    await world.setFact(WORLD_FACTS.blackrootPressure, 80);
    const director = new WorldSituationDirector(world, [ambush, patrol], {
      seed: 3,
      maxStartsPerEvaluation: 5,
    });

    const result = await director.evaluate(1_000);
    assert.equal(result.started.length, 1, "greymarch-road holds one situation");
    const blocked = result.skipped.find((entry) => entry.reason.includes("group"))
      ?? (await director.evaluate(1_100)).skipped.find((entry) =>
        entry.reason.includes("group"),
      );
    assert.ok(blocked, "the other member of the group must report why it was skipped");
    await database.close();
  });

  it("respects its hidden cooldown, then becomes possible again", async () => {
    const { database, world } = await harness();
    await world.setFact(WORLD_FACTS.blackrootPressure, 80);
    const director = new WorldSituationDirector(world, [ambush], { seed: 11 });

    const first = await director.evaluate(0);
    assert.equal(first.started.length, 1);

    // Still inside the occurrence's own 10-minute window.
    assert.equal((await director.evaluate(60_000)).started.length, 0);
    assert.equal(director.explain("greymarch:road-ambush", 60_000), "already active");

    // Past the 10-minute duration but still inside the 30-minute cooldown.
    const midway = await director.evaluate(15 * 60_000);
    assert.equal(midway.expired.length, 1, "the unresolved occurrence expires on its own");
    assert.equal(midway.started.length, 0);
    assert.equal(director.explain("greymarch:road-ambush", 15 * 60_000), "cooling down");

    const later = await director.evaluate(45 * 60_000);
    assert.equal(later.started.length, 1, "the world may produce a new occurrence");
    assert.notEqual(later.started[0]!.id, first.started[0]!.id);
    await database.close();
  });

  it("does not re-fire everything at once after a restart", async () => {
    const { database, repository, world } = await harness();
    await world.setFact(WORLD_FACTS.blackrootPressure, 80);
    const before = new WorldSituationDirector(world, [ambush], { seed: 5 });
    await before.evaluate(0);
    await world.closeOccurrence(world.view().activeSituations()[0]!.id);

    const after = new WorldSituationDirector(world, [ambush], { seed: 5 });
    await after.start(repository);
    assert.equal(
      after.explain("greymarch:road-ambush", 60_000),
      "cooling down",
      "cooldown must be rebuilt from persisted history",
    );
    await database.close();
  });
});

const inertWorld = {
  revision: 1,
  facts: {},
  value: () => undefined,
  number: (_key: string, fallback = 0) => fallback,
  boolean: (_key: string, fallback = false) => fallback,
  text: (_key: string, fallback = "") => fallback,
  hasActive: () => false,
  active: () => null,
  activeSituations: () => [],
};

describe("authored situations", () => {
  it("passes its own static checks", () => {
    validateSituations();
    assert.ok(WORLD_SITUATIONS.length >= 8, "the demo targets 8-12 situations");
    assert.ok(WORLD_SITUATIONS.length <= 16, "this is a set to learn, not a catalog");
  });

  it("gives every situation a reason in world state to exist", () => {
    // A predicate that ignores the world entirely is a scheduler, not a world reaction,
    // and would drift straight back into daily-chore territory.
    for (const situation of WORLD_SITUATIONS) {
      const neverStarts = [0, 6, 12, 18, 23].every(
        (hour) => !situation.canStart({ world: inertWorld, hour, nowMs: 0 }),
      );
      assert.ok(
        neverStarts,
        `${situation.key} starts against an empty world; it needs a world-state reason`,
      );
    }
  });

  it("gives every situation a natural way to be found", () => {
    for (const situation of WORLD_SITUATIONS) {
      assert.ok(situation.discovery.text.length > 10, situation.key);
      // The hook has to be something perceived, not an instruction.
      assert.doesNotMatch(
        situation.discovery.text,
        /\b(quest|objective|marker|task)\b/i,
        `${situation.key} describes a UI affordance rather than a perception`,
      );
    }
  });

  it("never gates content on weather, which has no authoritative source", () => {
    for (const situation of WORLD_SITUATIONS) {
      assert.doesNotMatch(
        situation.canStart.toString(),
        /weather/i,
        `${situation.key} reads weather; it would gate on a null placeholder`,
      );
    }
  });

  it("replays its authored variants from a seed", () => {
    for (const situation of WORLD_SITUATIONS) {
      if (!situation.create) continue;
      const context = { world: inertWorld, hour: 21, nowMs: 0 };
      const left = situation.create({ ...context, rng: situationRng(1234) });
      const right = situation.create({ ...context, rng: situationRng(1234) });
      assert.deepEqual(left, right, `${situation.key} must be replayable from its seed`);
    }
  });

  it("varies its authored variants across seeds", () => {
    // Seeded is not the same as constant: a situation whose variant never changes is a
    // fixed encounter, and the player learns it once.
    for (const situation of WORLD_SITUATIONS) {
      if (!situation.create) continue;
      const context = { world: inertWorld, hour: 21, nowMs: 0 };
      const seen = new Set(
        [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
          JSON.stringify(situation.create!({ ...context, rng: situationRng(seed) })),
        ),
      );
      assert.ok(seen.size > 1, `${situation.key} produces the same variant every time`);
    }
  });

  it("covers every demo zone", () => {
    const zones = new Set(WORLD_SITUATIONS.map((s) => s.key.split(":")[0]));
    for (const zone of ["greymarch", "greenveil", "lowharbor", "blackroot", "mournvault"]) {
      assert.ok(zones.has(zone), `no situations authored for ${zone}`);
    }
  });
});
