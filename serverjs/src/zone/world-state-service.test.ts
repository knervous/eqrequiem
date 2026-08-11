import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import type { DatabaseBackend } from "../db/backend.js";
import { WorldStateRepository } from "../persist/world-state-repository.js";
import { WorldStateService } from "./world-state-service.js";
import { occurrenceAwardKey, worldStateView } from "./world-state-types.js";
import { worldContextFlags, WORLD_SITUATION_FLAG_PREFIX } from "./quest-runtime.js";

async function runtimeDatabase(): Promise<DatabaseBackend> {
  const database = createNodeDatabase("sqlite::memory:");
  await applyCanonicalRuntimeSchema(database);
  return database;
}

describe("world state service", () => {
  it("drains an admitted world mutation before shutdown", async () => {
    const database = await runtimeDatabase();
    let release!: () => void;
    let markStarted!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    class DelayedRepository extends WorldStateRepository {
      override async setFact(
        key: string,
        value: unknown,
        expectedRevision: number | null = null,
      ): Promise<number | null> {
        markStarted();
        await gate;
        return super.setFact(key, value, expectedRevision);
      }
    }
    const service = new WorldStateService(new DelayedRepository(database), {});
    await service.start();
    const write = service.setFact("story.era", 2);
    await started;

    let drained = false;
    const draining = service.drain().then(() => { drained = true; });
    await Promise.resolve();
    assert.equal(drained, false);
    release();
    await Promise.all([write, draining]);
    assert.equal(drained, true);
    await database.close();
  });

  it("seeds defaults once and survives a restart", async () => {
    const database = await runtimeDatabase();
    const repository = new WorldStateRepository(database);
    const first = new WorldStateService(repository, {
      defaults: { "story.era": 1, "blackroot.pressure": 35 },
    });
    await first.start();
    await first.setFact("blackroot.pressure", 72);

    // A restart must not reset a world that has already moved on.
    const second = new WorldStateService(repository, {
      defaults: { "story.era": 1, "blackroot.pressure": 35 },
    });
    const snapshot = await second.start();
    assert.equal(snapshot.facts["blackroot.pressure"], 72);
    assert.equal(snapshot.facts["story.era"], 1);
    await database.close();
  });

  it("rejects a stale write and retries the mutator against current state", async () => {
    const database = await runtimeDatabase();
    const repository = new WorldStateRepository(database);
    const service = new WorldStateService(repository, {});
    await service.start();
    await service.setFact("blackroot.pressure", 10);

    // Simulate another process committing between this service's read and its write.
    await repository.setFact("blackroot.pressure", 50, 1);

    const result = await service.updateFact<number>(
      "blackroot.pressure",
      (current) => (current ?? 0) + 5,
    );
    assert.equal(result, 55, "the retry must see the other writer's value, not the stale one");
    assert.equal(service.snapshot.facts["blackroot.pressure"], 55);
    await database.close();
  });

  it("gives each appearance of a situation its own award identity", async () => {
    const database = await runtimeDatabase();
    const service = new WorldStateService(new WorldStateRepository(database), {});
    await service.start();

    const first = await service.beginOccurrence({
      situationKey: "greymarch:road-ambush",
      seed: 1234,
      data: { route: "west-road" },
    });
    assert.ok(service.view().hasActive("greymarch:road-ambush"));
    assert.equal(await service.closeOccurrence(first.id), true);
    // A second report of the same resolution must not re-open or re-award it.
    assert.equal(await service.closeOccurrence(first.id), false);
    assert.equal(service.view().hasActive("greymarch:road-ambush"), false);

    const second = await service.beginOccurrence({
      situationKey: "greymarch:road-ambush",
      seed: 5678,
      data: { route: "farm-road" },
    });
    assert.notEqual(
      occurrenceAwardKey(first, "resolution"),
      occurrenceAwardKey(second, "resolution"),
      "a genuinely new occurrence must be claimable again",
    );
    await database.close();
  });

  it("expires an occurrence once its authored window has passed", async () => {
    const database = await runtimeDatabase();
    let now = 1_000;
    const service = new WorldStateService(new WorldStateRepository(database), {
      now: () => now,
    });
    await service.start();
    await service.beginOccurrence({
      situationKey: "greenveil:bloom",
      seed: 7,
      durationMs: 500,
    });

    assert.deepEqual(await service.expireElapsed(), []);
    now = 1_600;
    const expired = await service.expireElapsed();
    assert.equal(expired.length, 1);
    assert.equal(service.view().hasActive("greenveil:bloom"), false);
    await database.close();
  });

  it("publishes a new revision on every change", async () => {
    const database = await runtimeDatabase();
    const service = new WorldStateService(new WorldStateRepository(database), {});
    await service.start();
    const seen: number[] = [];
    const unsubscribe = service.subscribe((snapshot) => seen.push(snapshot.revision));
    await service.setFact("story.era", 2);
    await service.beginOccurrence({ situationKey: "mournvault:resonance", seed: 3 });
    unsubscribe();
    await service.setFact("story.era", 3);

    assert.equal(seen.length, 3, "one immediate snapshot plus one per change");
    assert.ok(seen[2]! > seen[1]! && seen[1]! > seen[0]!);
    await database.close();
  });
});

describe("world state as quest world flags", () => {
  it("exposes facts and active occurrences to authored predicates", () => {
    const view = worldStateView({
      revision: 4,
      facts: { "blackroot.pressure": 73, "greymarch.caravan_due": true },
      occurrences: [
        {
          id: 42,
          situationKey: "greymarch:road-ambush",
          state: "active",
          seed: 99,
          data: { route: "west-road" },
          startedAtMs: 1000,
          endsAtMs: null,
          resolvedAtMs: null,
        },
      ],
    });
    assert.equal(view.number("blackroot.pressure"), 73);
    assert.equal(view.boolean("greymarch.caravan_due"), true);
    assert.equal(view.number("greenveil.unknown", 5), 5);
    assert.equal(view.active("greymarch:road-ambush")?.id, 42);

    const flags = worldContextFlags({
      revision: 4,
      facts: { "blackroot.pressure": 73 },
      occurrences: [
        {
          id: 42,
          situationKey: "greymarch:road-ambush",
          state: "active",
          seed: 99,
          data: { route: "west-road" },
          startedAtMs: 1000,
          endsAtMs: null,
          resolvedAtMs: null,
        },
        {
          id: 41,
          situationKey: "greymarch:road-ambush",
          state: "resolved",
          seed: 12,
          data: {},
          startedAtMs: 0,
          endsAtMs: null,
          resolvedAtMs: 500,
        },
      ],
    });
    assert.equal(flags["blackroot.pressure"], 73);
    const situation = flags[`${WORLD_SITUATION_FLAG_PREFIX}greymarch:road-ambush`] as {
      id: number;
    };
    assert.equal(situation.id, 42, "a resolved occurrence must not shadow the active one");
  });
});
