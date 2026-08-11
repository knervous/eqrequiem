import { WORLD_FACTS } from "../world-facts.js";
import { defineSituation } from "../world-situations.js";

/**
 * The Greenveil's situation set: the forest, and Alderhollow inside it.
 *
 * The Greenveil is the one place in the demo where the returning magic is visible as
 * something other than a threat, so its situations are keyed off `greenveil.disturbance`
 * rather than off danger. The forest being "restless" is what a ranger notices first and
 * what pushes predators onto the Greymarch — the two zones share one cause.
 */

export const GREENVEIL_SITUATIONS = [
  defineSituation({
    key: "greenveil:wildlife-disturbance",
    title: "The wood has stopped behaving",
    discovery: {
      kind: "sight",
      text: "Herds moving the wrong way, and birds off the canopy entirely.",
    },
    canStart: ({ world }) =>
      world.text(WORLD_FACTS.greenveilDisturbance) === "restless",
    weight: 7,
    cooldown: { minMinutes: 30, maxMinutes: 90 },
    durationMinutes: 60,
    exclusiveGroup: "greenveil-wood",
    create: ({ rng }) => ({
      quarter: rng.pick(["deep-hollow", "old-burn", "streamhead"]),
      // Whether the cause reads as natural or as something the druids should hear about.
      reading: rng.pick(["migration", "predator", "unnatural"]),
    }),
  }),

  defineSituation({
    key: "greenveil:magical-bloom",
    title: "Something has bloomed that should not have",
    discovery: {
      kind: "sight",
      text: "A stand of flowers open in the wrong season, and faintly lit.",
    },
    // The clearest good news in the demo: magic returning where it can be seen rather
    // than only where it can hurt you.
    canStart: ({ world }) =>
      world.text(WORLD_FACTS.greenveilDisturbance) === "bloom"
      && world.number(WORLD_FACTS.mournvaultResonance) >= 0.2,
    weight: 5,
    cooldown: { minMinutes: 90, maxMinutes: 240 },
    durationMinutes: 120,
    exclusiveGroup: "greenveil-wood",
    create: ({ rng }) => ({
      growth: rng.pick(["nightshade", "silverleaf", "emberfern"]),
      // A druid, a wizard and a ranger should each be able to read this differently.
      resonance: rng.pick(["primal", "arcane", "hollow"]),
    }),
  }),

  defineSituation({
    key: "greenveil:missing-guide",
    title: "A guide has not come back",
    discovery: {
      kind: "rumor",
      text: "Alderhollow is quietly asking whether anyone has seen one of their own.",
      near: "Alderhollow",
    },
    // People go missing in the wood when the wood is already behaving badly. Stated as
    // an allow-list rather than `!== "calm"`: a negative test passes against an unset
    // fact, so the situation would run in a world that had never said anything.
    canStart: ({ world }) =>
      ["restless", "bloom"].includes(world.text(WORLD_FACTS.greenveilDisturbance)),
    weight: 6,
    cooldown: { minMinutes: 60, maxMinutes: 180 },
    durationMinutes: 100,
    create: ({ rng }) => ({
      lastSeen: rng.pick(["streamhead", "old-burn", "veil-road"]),
      trail: rng.pick(["broken-brush", "cold-camp", "cut-mark"]),
    }),
  }),
];
