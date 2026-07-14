import { onQuest } from "../../../quest-types.js";
import type { ZoneQuestRegistry } from "../../../quest-registry.js";

export function registerNpcQuests(quests: ZoneQuestRegistry): void {
  quests.registerNpc(
    "Guard_Gehnus",
    onQuest("say", {}, ({ initiator, npc, zone }) => {
      // The live zone instance is always available for dynamic branching/lookups.
      const greetingCount = (zone.get<number>("guard_gehnus:greetings") ?? 0) + 1;
      zone.set("guard_gehnus:greetings", greetingCount);
      npc.say(`Hello, ${initiator.name}! How can I assist you today? count ${greetingCount}`);
      return initiator.kind === "npc";
    }),
  );
}
