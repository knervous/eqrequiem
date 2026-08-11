import { ITEMS } from "../../../../content/eltania.js";
import { isHail, mentions } from "../../../quest-dialogue.js";
import type { ZoneQuestRegistry } from "../../../quest-registry.js";
import { isQuestPlayer, onQuest } from "../../../quest-types.js";

export const SENTINEL_IRON_KNOWLEDGE = {
  task: "talios.sentinel_iron_task",
  delivered: "talios.sentinel_iron_delivered",
} as const;

export function registerSentinelIron(quests: ZoneQuestRegistry): void {
  const quest = quests.quest("sentinel-iron", {
    title: "Sentinel's Iron",
    recommendedLevel: [1, 3],
    repeatability: "once",
    journal: "leads",
    tags: ["talios", "crownward", "crafting"],
    revision: 1,
  });

  quest.registerNpc(
    "Captain_Robert_Vance",
    onQuest("say", {}, ({ initiator, npc, message }) => {
      if (!isQuestPlayer(initiator)) return;
      const player = initiator;

      if (isHail(message)) {
        if (player.knowledge.has(SENTINEL_IRON_KNOWLEDGE.delivered)) {
          npc.say(`The armory is well stocked thanks to you, ${player.name}.`);
          return;
        }
        if (player.knowledge.has(SENTINEL_IRON_KNOWLEDGE.task)) {
          if (player.inventory.has(ITEMS.solskarIronIngot.itemId)) {
            npc.say("Excellent work. Hand over the cold iron ingots so our smiths can temper them.");
            return;
          }
          npc.say("Speak with Captain Vael down in Lowharbor to secure the Solskar cold iron.");
          return;
        }
        npc.say(
          `Greetings, ${player.name}. Crownward's armory is low on Solskar cold iron. `
          + "If you are heading to Lowharbor, speak with Captain Vael on the docks.",
        );
        return;
      }

      if (mentions(message, "iron", "lowharbor", "vael", "armory")) {
        if (player.knowledge.learn(SENTINEL_IRON_KNOWLEDGE.task)) {
          npc.say("Tell Vael that the City Watch honors its trade debts. Bring back a bundle of Solskar iron.");
          player.journal.discover("sentinel-iron-lead", {
            kind: "person",
            title: "Sentinel's Iron",
            text: `Captain Vance asked for Solskar cold iron from Captain Vael at the Lowharbor docks.`,
          });
          player.progression.awardBeatOnce("sentinel-iron-start", "hint", { source: "discovery" });
        }
      }
    }),
  );
}
