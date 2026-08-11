import { ZONES } from "../../../../content/eltania.js";
import { ZoneQuestRegistry } from "../../../quest-registry.js";
import { registerItemQuests } from "./items.js";
import { registerMissingPatrol } from "./missing-patrol.js";
import { registerNpcQuests } from "./npcs.js";
import { registerRumors } from "./rumors.js";
import { registerSentinelIron } from "./sentinel-iron.js";
import { registerZoneQuests } from "./zone.js";

export function registerZone(): ZoneQuestRegistry {
  const quests = new ZoneQuestRegistry({
    id: ZONES.crownward.id,
    shortName: ZONES.crownward.key,
    contentKey: ZONES.crownward.key,
  });
  registerNpcQuests(quests);
  registerItemQuests(quests);
  registerZoneQuests(quests);
  registerMissingPatrol(quests);
  registerSentinelIron(quests);
  registerRumors(quests);
  return quests;
}

