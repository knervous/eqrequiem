import { WORLD_FACTS } from "../world-facts.js";
import { defineSituation } from "../world-situations.js";
import { isNight } from "../world-clock.js";

/**
 * Talios Lowharbor's situation set: the docks, and what moves through them.
 *
 * The harbour is the demo's other end of the relic thread. What comes out of the
 * Mournvault has to be sold somewhere, and this is where — so `lowharbor.relic_trade`
 * rises as `mournvault.resonance` does, and a player can work the story from either
 * end without either being the "correct" one.
 */

export const LOWHARBOR_SITUATIONS = [
  defineSituation({
    key: "lowharbor:relic-fence",
    title: "Someone is buying what should not be sold",
    discovery: {
      kind: "rumor",
      text: "A name going round the taproom for anyone with an odd thing to sell.",
      near: "the Drowned Lantern",
    },
    canStart: ({ world }) => world.number(WORLD_FACTS.lowharborRelicTrade) >= 45,
    weight: 7,
    cooldown: { minMinutes: 40, maxMinutes: 120 },
    durationMinutes: 90,
    exclusiveGroup: "lowharbor-trade",
    create: ({ rng }) => ({
      front: rng.pick(["chandlery", "salt-warehouse", "net-loft"]),
      // Whether the fence can be turned, bought, or only followed.
      leverage: rng.pick(["debt", "fear", "greed"]),
    }),
  }),

  defineSituation({
    key: "lowharbor:foreign-hull",
    title: "A foreign hull at the deep berth",
    discovery: {
      kind: "sight",
      text: "A ship at the deep berth with rigging nobody here knows how to tie.",
      near: "the deep berth",
    },
    // Solskar traders come when there is trade worth crossing for. This is also the
    // demo's chance to show a people rather than describe them.
    canStart: ({ world }) => world.number(WORLD_FACTS.lowharborRelicTrade) >= 30,
    weight: 5,
    cooldown: { minMinutes: 80, maxMinutes: 220 },
    durationMinutes: 150,
    exclusiveGroup: "lowharbor-trade",
    create: ({ rng }) => ({
      cargo: rng.pick(["timber", "cold-iron", "sealed-crates"]),
      manner: rng.pick(["open", "guarded", "hostile"]),
    }),
  }),

  defineSituation({
    key: "lowharbor:criminal-handoff",
    title: "A handoff on the night tide",
    discovery: {
      kind: "sight",
      text: "Two boats meeting where no boats should be, with no lanterns lit.",
    },
    // Needs both darkness and something worth moving.
    canStart: ({ world, hour }) =>
      isNight(hour) && world.number(WORLD_FACTS.lowharborRelicTrade) >= 55,
    weight: 6,
    cooldown: { minMinutes: 50, maxMinutes: 160 },
    durationMinutes: 45,
    create: ({ rng }) => ({
      berth: rng.pick(["north-quay", "breakwater", "old-slip"]),
      goods: rng.pick(["relics", "prisoners", "ledgers"]),
    }),
  }),
];
