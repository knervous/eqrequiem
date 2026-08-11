import { WORLD_FACTS } from "../world-facts.js";
import { defineSituation } from "../world-situations.js";
import { isNight } from "../world-clock.js";

/**
 * Blackroot Hold and the Mournvault: the two places the demo's story actually ends up.
 *
 * These are grouped because they are one thread seen from two ends — the warrens are
 * digging things up, and the crypt is where those things came from. Both are keyed off
 * `mournvault.resonance`, which is the demo's single dial for "how much is the old magic
 * waking", so advancing the story advances both at once.
 */

export const DEEPS_SITUATIONS = [
  defineSituation({
    key: "blackroot:relic-shipment",
    title: "A shipment is being made ready",
    discovery: {
      kind: "trace",
      text: "Fresh crates in a place that has no business storing anything.",
    },
    canStart: ({ world }) =>
      world.number(WORLD_FACTS.blackrootPressure) >= 55
      && world.number(WORLD_FACTS.lowharborRelicTrade) >= 35,
    weight: 6,
    cooldown: { minMinutes: 60, maxMinutes: 180 },
    durationMinutes: 120,
    exclusiveGroup: "blackroot-hold",
    create: ({ rng }) => ({
      staging: rng.pick(["excavation", "prisoner-pens", "king-approach"]),
      // Whether there are people in the shipment as well as objects. This is the
      // branch that gives the dungeon a non-combat resolution worth finding.
      prisoners: rng.chance(0.5),
      escort: rng.pick(["lieutenant", "hired-blades", "none"]),
    }),
  }),

  defineSituation({
    key: "mournvault:grave-robbers",
    title: "Someone got here first",
    discovery: {
      kind: "sight",
      text: "Rope, chalk marks and a lamp still warm, in a place nobody should be.",
    },
    // Robbers only bother once the crypt has started giving things up.
    canStart: ({ world }) => world.number(WORLD_FACTS.mournvaultResonance) >= 0.3,
    weight: 6,
    cooldown: { minMinutes: 45, maxMinutes: 140 },
    durationMinutes: 90,
    exclusiveGroup: "mournvault-descent",
    create: ({ rng }) => ({
      crew: rng.pick(["harbour-hired", "warren-sent", "independent"]),
      progress: rng.pick(["surveying", "digging", "leaving"]),
    }),
  }),

  defineSituation({
    key: "mournvault:hollow-resonance",
    title: "The vault is answering something",
    discovery: {
      kind: "sound",
      text: "A note under the floor that does not stop when you do.",
    },
    // The demo's ending note, and the one situation that is genuinely rare: it needs
    // the resonance high and the world dark.
    canStart: ({ world, hour }) =>
      isNight(hour)
      && world.number(WORLD_FACTS.mournvaultResonance) >= 0.5
      && world.number(WORLD_FACTS.storyEra) >= 1,
    weight: 3,
    cooldown: { minMinutes: 120, maxMinutes: 360 },
    durationMinutes: 60,
    exclusiveGroup: "mournvault-descent",
    create: ({ rng }) => ({
      depth: rng.pick(["first-descent", "sealed-stair"]),
      sign: rng.pick(["hollow-star", "broken-concordance", "named-dead"]),
    }),
  }),
];
