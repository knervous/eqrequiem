import type { ZoneQuestRegistry } from "../../../quest-registry.js";
import { PATROL_KNOWLEDGE } from "./missing-patrol.js";

/**
 * What Qeynos Hills is currently talking about.
 *
 * A player with no idea what to do can walk up to a gate guard or a keeper and ask what
 * is happening — the same thing they would do in the fiction. Each rumor is true because
 * of a world condition and goes quiet when that condition does, so this never becomes a
 * rotating list of chores.
 */
export function registerRumors(quests: ZoneQuestRegistry): void {
  quests.rumors.define(
    {
      key: "qeynos2.missing-patrol",
      text: "A patrol went out the north gate two nights ago and no one has seen it since.",
      tier: "local",
      weight: 9,
      // Hearing it in a tavern is the same fact Gehnus is worried about.
      knowledge: PATROL_KNOWLEDGE.missing,
      experience: 15,
      lead: {
        questKey: "qeynos2:missing-patrol",
        leadKey: "heard-rumor",
        kind: "rumor",
        title: "The Missing Patrol",
        text: "People are saying a Qeynos patrol never came back from the north road.",
        place: { kind: "direction", text: "north of the Qeynos gate" },
      },
      // Once the character knows what actually happened out there, it stops being news.
      expiresWhen: (world) => world.flags["qeynos2.patrol_resolved"] === true,
      variants: {
        Guard_Hezlan:
          "Between us: Varen's patrol is late off the north road, and Gehnus is not sleeping.",
      },
    },
    {
      key: "qeynos2.gnoll-pressure",
      text: "The gnolls out by the hills have been bolder since the moons turned.",
      tier: "local",
      weight: 6,
    },
    {
      key: "qeynos2.klicnik-swarm",
      text: "Something has the klicniks stirred up in the far tunnels. Farmers won't go near.",
      tier: "regional",
      weight: 4,
    },
    {
      key: "qeynos2.night-aqueduct",
      text: "The old aqueduct is used after sunset by people who would rather not be seen.",
      tier: "local",
      weight: 5,
      // Only worth mentioning when it is actually night.
      when: (world) => world.timeOfDay === null
        || world.timeOfDay >= 19
        || world.timeOfDay <= 5,
      lead: {
        questKey: "qeynos2:missing-patrol",
        leadKey: "aqueduct-rumor",
        kind: "place",
        text: "The old aqueduct sees traffic after dark that nobody wants witnessed.",
        place: { kind: "landmark", landmarkId: "old-aqueduct" },
      },
    },
  );

  // Socially obvious places to ask. Guards know the road; the gate captain hears more.
  quests.rumorSource("Guard_Gehnus", {
    tiers: ["local"],
    quiet: "The road has been quiet enough. Long may it stay that way.",
  });
  quests.rumorSource("Guard_Hezlan", {
    tiers: ["local", "regional"],
    quiet: "If I hear anything worth your time, I will say so.",
  });
}
