import { ZoneQuestRegistry } from "../../../quest-registry.js";
import { registerItemQuests } from "./items.js";
import { registerNpcQuests } from "./npcs.js";
import { registerZoneQuests } from "./zone.js";

export function registerZone(): ZoneQuestRegistry {
  const quests = new ZoneQuestRegistry({ id: 2, shortName: "qeynos2" });
  registerNpcQuests(quests);
  registerItemQuests(quests);
  registerZoneQuests(quests);
  return quests;
}
