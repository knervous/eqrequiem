import { ZONES } from "../../../../content/eltania.js";
import { ZoneQuestRegistry } from "../../../quest-registry.js";
import { registerItemQuests } from "./items.js";
import { registerNpcQuests } from "./npcs.js";
import { registerZoneQuests } from "./zone.js";

export function registerZone(): ZoneQuestRegistry {
  const quests = new ZoneQuestRegistry({
    id: ZONES.lowharbor.id,
    shortName: ZONES.lowharbor.key,
    contentKey: ZONES.lowharbor.key,
  });
  registerNpcQuests(quests);
  registerItemQuests(quests);
  registerZoneQuests(quests);
  return quests;
}
