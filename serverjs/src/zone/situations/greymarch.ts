import { WORLD_FACTS } from "../world-facts.js";
import { defineSituation } from "../world-situations.js";
import { isNight } from "../world-clock.js";

/**
 * The Greymarch's situation set: the road between Talios and everything east of it.
 *
 * These exist so the road has a mood that changes without a schedule. Each one has a
 * reason in world state to be happening — pressure from the warrens, a caravan that is
 * actually due — so a player who learns the world can anticipate them without ever
 * being able to read a timer off the UI.
 */

export const GREYMARCH_SITUATIONS = [
  defineSituation({
    key: "greymarch:road-ambush",
    title: "Ambush on the road",
    discovery: {
      kind: "sight",
      text: "Carts stopped wrong on the road, and nobody standing near them.",
      near: "the west road",
    },
    // Bandits do not raid the road because a clock fired; they raid it when the
    // warrens are pushing and there is something worth taking.
    canStart: ({ world }) =>
      world.number(WORLD_FACTS.blackrootPressure) >= 60
      && world.boolean(WORLD_FACTS.greymarchCaravanDue),
    weight: 8,
    cooldown: { minMinutes: 25, maxMinutes: 70 },
    durationMinutes: 45,
    exclusiveGroup: "greymarch-road",
    create: ({ rng }) => ({
      route: rng.pick(["west-road", "farm-road", "north-track"]),
      leaderVariant: rng.int(1, 3),
    }),
  }),

  defineSituation({
    key: "greymarch:overdue-patrol",
    title: "A patrol has not reported in",
    discovery: {
      kind: "rumor",
      text: "The gate watch is short a patrol and counting the hours.",
      near: "the Crownward gate",
    },
    canStart: ({ world }) => world.number(WORLD_FACTS.blackrootPressure) >= 45,
    weight: 6,
    cooldown: { minMinutes: 40, maxMinutes: 120 },
    durationMinutes: 90,
    exclusiveGroup: "greymarch-road",
    create: ({ rng }) => ({
      lastSeen: rng.pick(["old-wall", "burial-mounds", "east-farms"]),
      // Which of three discovery paths the strongest evidence favours. The other two
      // still work; this only decides where the trail is most legible.
      evidence: rng.pick(["tracks", "dropped-gear", "witness"]),
    }),
  }),

  defineSituation({
    key: "greymarch:wounded-traveler",
    title: "Someone did not make it home",
    discovery: {
      kind: "sound",
      text: "Someone calling out, off the road and not far.",
    },
    // A consequence, not an event: people only turn up hurt on this road once it has
    // actually become dangerous.
    canStart: ({ world }) => world.number(WORLD_FACTS.blackrootPressure) >= 50,
    weight: 7,
    cooldown: { minMinutes: 20, maxMinutes: 55 },
    durationMinutes: 25,
    create: ({ rng }) => ({
      // What happened to them decides what helping them teaches you.
      cause: rng.pick(["ambush", "predator", "fall"]),
      carrying: rng.pick(["nothing", "ledger-page", "warren-token"]),
    }),
  }),

  defineSituation({
    key: "greymarch:roaming-predator",
    title: "Something large is hunting the march",
    discovery: {
      kind: "trace",
      text: "Kills left half-eaten, and tracks too deep for a wolf.",
    },
    // Wildlife pushes into the march when the Greenveil is restless enough to move it.
    canStart: ({ world }) =>
      world.text(WORLD_FACTS.greenveilDisturbance) === "restless",
    weight: 5,
    cooldown: { minMinutes: 50, maxMinutes: 150 },
    durationMinutes: 70,
    create: ({ rng }) => ({
      quarry: rng.pick(["old-boar", "hill-lion", "scarred-wolf"]),
      range: rng.pick(["north-track", "burial-mounds", "east-farms"]),
    }),
  }),

  defineSituation({
    key: "greymarch:night-relic-smugglers",
    title: "Something is moving off the road after dark",
    discovery: {
      kind: "sight",
      text: "Shuttered lanterns moving off the road, well after dark.",
    },
    // Deliberately gated on the server's world hour, not the client's sky.
    canStart: ({ world, hour }) =>
      isNight(hour) && world.number(WORLD_FACTS.mournvaultResonance) >= 0.25,
    weight: 4,
    cooldown: { minMinutes: 60, maxMinutes: 180 },
    durationMinutes: 60,
    create: ({ rng }) => ({
      handoff: rng.pick(["mound-hollow", "ruined-mile-marker", "ford"]),
      buyer: rng.pick(["lowharbor-fence", "outsider"]),
    }),
  }),
];
