import { PLACES } from "../../../../content/eltania.js";
import type { ZoneQuestRegistry } from "../../../quest-registry.js";
import { WORLD_FACTS } from "../../../world-facts.js";
import { situationRumorsForZone } from "../../../situations/rumors.js";
import { PATROL_KNOWLEDGE } from "./missing-patrol.js";

/**
 * What Talios Crownward is currently talking about.
 *
 * A player with no idea what to do can walk up to a watchman and ask what is happening
 * — the same thing they would do in the fiction. Each rumor is true because of a world
 * condition and goes quiet when that condition does, so this never becomes a rotating
 * list of chores. The conditions read the same global facts the situation director
 * decides on, which is what keeps talk and events describing one world.
 */
export function registerRumors(quests: ZoneQuestRegistry): void {
  quests.rumors.define(
    {
      key: "talios.missing-patrol",
      text: `A patrol went out onto ${PLACES.greymarch} two nights ago and no one has seen it since.`,
      tier: "local",
      weight: 9,
      // Hearing it in a tavern is the same fact Halvane is worried about.
      knowledge: PATROL_KNOWLEDGE.missing,
      experience: "hint",
      lead: {
        questKey: "talioscrownward:missing-patrol",
        leadKey: "heard-rumor",
        kind: "rumor",
        title: "The Missing Patrol",
        text: `People are saying a watch patrol never came back from ${PLACES.greymarch}.`,
        place: { kind: "direction", text: "out past the Crownward gate" },
      },
      // Once the character knows what actually happened out there, it stops being news.
      expiresWhen: (world) => world.flags["talios.patrol_resolved"] === true,
      variants: {
        ["Watchman_Brey"]:
          `Between us: Varen's patrol is late off ${PLACES.greymarch}, and `
          + `${"Serjeant Halvane"} is not sleeping.`,
      },
    },
    {
      key: "talios.blackroot-pressure",
      text: "The bandits out of the warrens have been bolder since the moons turned.",
      tier: "local",
      weight: 6,
      // True only while the world actually says the warrens are pushing. A rumor that
      // is always available is set dressing; one that comes and goes is information.
      when: (world) => Number(world.flags[WORLD_FACTS.blackrootPressure] ?? 0) >= 45,
    },
    {
      key: "talios.caravan-due",
      text: "A cart train is expected off the road any day now, and it is carrying more than grain.",
      tier: "regional",
      weight: 4,
      when: (world) => world.flags[WORLD_FACTS.greymarchCaravanDue] === true,
    },
    {
      key: "talios.night-wayhouse",
      text: "The old wayhouse is used after sunset by people who would rather not be seen.",
      tier: "local",
      weight: 5,
      // Only worth mentioning when it is actually night, on the server's clock — which
      // the client sky is now in phase with, so the player is not told "after sunset"
      // while looking at midday.
      when: (world) => world.timeOfDay === null
        || world.timeOfDay >= 19
        || world.timeOfDay <= 5,
      lead: {
        questKey: "talioscrownward:missing-patrol",
        leadKey: "wayhouse-rumor",
        kind: "place",
        text: "The old wayhouse sees traffic after dark that nobody wants witnessed.",
        place: { kind: "landmark", landmarkId: "old-wayhouse" },
      },
    },
  );

  // What the world is *currently* doing, alongside the standing rumors above. These are
  // generated from the authored situation set rather than written out again here, so a
  // situation cannot exist without being findable and cannot be findable when it is not
  // happening. The gate watch carries the road; the deeper places travel as regional talk.
  quests.rumors.define(
    ...situationRumorsForZone("greymarch"),
    ...situationRumorsForZone("blackroot"),
    ...situationRumorsForZone("mournvault"),
  );

  // Socially obvious places to ask. The gate watch knows the road; the serjeant hears more.
  quests.rumorSource("Serjeant_Halvane", {
    tiers: ["local"],
    quiet: "The road has been quiet enough. Long may it stay that way.",
  });
  quests.rumorSource("Watchman_Brey", {
    tiers: ["local", "regional"],
    quiet: "If I hear anything worth your time, I will say so.",
  });
}
