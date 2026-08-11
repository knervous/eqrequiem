import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEMO_TARGET_LOAD,
  loadQuestZone,
  walkPosition,
} from "./quest-load.js";

/**
 * Load tests for the quest engine.
 *
 * These assert *shape*, not wall-clock speed. A timing budget on a shared CI box is a
 * flaky test, but a complexity claim is not: "cost per position update must not grow
 * with the number of players" either holds or it does not, and it is exactly the kind of
 * regression that unit tests miss and a live shard discovers under load.
 *
 * The defect these were written against: `QuestWorld` eagerly built a facade for every
 * NPC and every connected player in its constructor, and it is constructed once per
 * matched handler per event. Because event volume also rises with population, position
 * handling scaled as the square of the player count — 10 µs per update at 10 players and
 * 631 µs at 200, i.e. a zone that could not sustain 200 players at 10 Hz. The facades are
 * lazy now; these tests are what keeps them that way.
 *
 * `npm run load:quests` prints the underlying numbers.
 */

/** Median of repeated samples: one slow sample on a loaded machine proves nothing. */
function medianMicros(samples: number, operations: number, run: () => void): number {
  const timings: number[] = [];
  run();
  for (let sample = 0; sample < samples; sample++) {
    const started = performance.now();
    run();
    timings.push(((performance.now() - started) * 1000) / operations);
  }
  timings.sort((left, right) => left - right);
  return timings[Math.floor(timings.length / 2)]!;
}

function positionCostMicros(players: number, ticks = 40): number {
  const { manager, sessionIds } = loadQuestZone(DEMO_TARGET_LOAD, players);
  return medianMicros(5, players * ticks, () => {
    for (let step = 0; step < ticks; step++) {
      for (const sessionId of sessionIds) {
        manager.updatePlayerPosition(sessionId, walkPosition(sessionId, step), step);
      }
    }
  });
}

describe("quest engine load", () => {
  it("keeps per-update cost flat as the zone fills", () => {
    // The regression that matters. Twenty times the players must not cost each of them
    // meaningfully more; if it does, the engine is doing per-population work per event.
    const few = positionCostMicros(10);
    const many = positionCostMicros(200);

    assert.ok(
      many < few * 4,
      `position updates scaled with population: ${few.toFixed(1)} µs/update at 10 players `
      + `but ${many.toFixed(1)} µs/update at 200. Something in the dispatch path is doing `
      + "work proportional to the number of connected players.",
    );
  });

  it("does not build player facades for handlers that never ask for them", () => {
    // The direct statement of the fix, and it only means anything if a handler actually
    // *matches*: a miss never constructs a `QuestWorld` at all, so dispatching to an NPC
    // no quest cares about would pass whether or not the facades are lazy.
    // `Watchman_0` is the name `buildQuestLoad` gives its first `say` handler.
    const solo = loadQuestZone(DEMO_TARGET_LOAD, 1);
    const crowd = loadQuestZone(DEMO_TARGET_LOAD, 300);
    const events = 4_000;

    const cost = (zone: ReturnType<typeof loadQuestZone>) =>
      medianMicros(5, events, () => {
        for (let i = 0; i < events; i++) {
          zone.manager.dispatch({
            type: "say",
            tick: i,
            sessionId: 1,
            npcName: "Watchman_0",
            message: "hail",
          } as never);
        }
      });

    const soloCost = cost(solo);
    const crowdCost = cost(crowd);
    assert.ok(
      crowdCost < soloCost * 3,
      `one matched 'say' cost ${soloCost.toFixed(2)} µs alone and ${crowdCost.toFixed(2)} µs `
      + "with 300 players connected. A handler that never reads world.players must not pay "
      + "for them.",
    );
  });

  it("dispatches at a rate a full shard can actually consume", () => {
    // A floor rather than a target: 200 players at 10 Hz is 2,000 position updates a
    // second, and each fans out into region and proximity work. Anything near that
    // number means the engine is the bottleneck rather than the simulation.
    const cost = positionCostMicros(200);
    const updatesPerSecond = 1_000_000 / cost;
    assert.ok(
      updatesPerSecond > 20_000,
      `position updates sustain only ${Math.round(updatesPerSecond)}/s; a 200-player `
      + "shard needs 2,000/s with headroom for everything else in the tick",
    );
  });

  it("stays linear in content volume, not worse", () => {
    // `dispatch` walks every handler of every quest. That is O(content) by construction
    // and acceptable; what would not be acceptable is worse than linear as content grows
    // toward the eight-to-twelve situations per zone the demo is aiming at.
    const measure = (quests: number) => {
      const zone = loadQuestZone({ ...DEMO_TARGET_LOAD, quests }, 1);
      const events = 4_000;
      return medianMicros(5, events, () => {
        for (let i = 0; i < events; i++) {
          zone.manager.dispatch({
            type: "say",
            tick: i,
            sessionId: 1,
            npcName: zone.npcNames[i % zone.npcNames.length]!,
            message: "hail",
          } as never);
        }
      });
    };

    const small = measure(15);
    const large = measure(240);
    // Sixteen times the content, so linear is ~16x. Allow generous headroom for constant
    // factors and a noisy machine, but fail on a quadratic blow-up.
    assert.ok(
      large < small * 40,
      `content scaling is worse than linear: ${small.toFixed(2)} µs at 15 quests and `
      + `${large.toFixed(2)} µs at 240 (16x the content). Handler matching may need an `
      + "index by event type.",
    );
  });

  it("checks a large pending timer set without walking it repeatedly", () => {
    const { manager } = loadQuestZone(DEMO_TARGET_LOAD, 20);
    const ticks = 20_000;
    const cost = medianMicros(5, ticks, () => {
      for (let tick = 0; tick < ticks; tick++) manager.advanceTimers(tick, 0);
    });
    assert.ok(
      cost < 5,
      `advanceTimers cost ${cost.toFixed(3)} µs per tick with nothing due; the common `
      + "case must be close to free",
    );
  });
});
