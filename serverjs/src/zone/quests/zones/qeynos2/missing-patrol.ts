import { isHail, mentions, say } from "../../../quest-dialogue.js";
import type { ZoneQuestRegistry } from "../../../quest-registry.js";
import {
  isQuestPlayer,
  onQuest,
  type QuestNpc,
  type QuestPlayer,
} from "../../../quest-types.js";

/**
 * The Missing Patrol — the vertical slice for the found-not-assigned model.
 *
 * Three independent ways in (an overheard exchange at the gate, asking Gehnus, or simply
 * walking into the camp), several ways out, and nothing that looks like a checklist. All
 * branching is ordinary TypeScript against character knowledge, inventory and level; the
 * only things the engine externalizes are identity, bindings and journal leads.
 */

/** The broken Qeynos spear left at the camp. */
export const BROKEN_SPEAR_ITEM_ID = 7009;

export const PATROL_KNOWLEDGE = {
  missing: "qeynos2.patrol_missing",
  aqueduct: "qeynos2.aqueduct_route",
  camp: "qeynos2.found_patrol_camp",
  varen: "qeynos2.varen_led_patrol",
  spearOwner: "qeynos2.spear_belonged_to_varen",
} as const;

interface PatrolState {
  readonly heardRumor?: boolean;
  readonly foundCamp?: boolean;
  readonly spearIdentified?: boolean;
  readonly reportedToGehnus?: boolean;
  /** Concrete facts rather than one lossy `completed` bit. */
  readonly resolution?: "reported" | "identified" | "kept-evidence";
}

export function registerMissingPatrol(quests: ZoneQuestRegistry): void {
  const patrol = quests.quest("missing-patrol", {
    title: "The Missing Patrol",
    recommendedLevel: [3, 7],
    repeatability: "once",
    journal: "leads",
    tags: ["qeynos", "investigation"],
    revision: 1,
    migrate: (state) => state,
  });

  // The camp exists in the world whether or not anyone told the player about it.
  patrol.defineRegion(
    "north-patrol-camp",
    { kind: "sphere", x: -700, y: 2, z: -620, radius: 45 },
    "an abandoned camp north of the gate",
  );

  // ---------------------------------------------------------------------------
  // Discovery path A — linger near the gate and overhear the guards.
  // ---------------------------------------------------------------------------
  patrol.npc(
    "Guard_Gehnus",
    { role: "rumor", visibility: "hidden" },
    onQuest("proximity_enter", { radius: 25, oncePerPlayer: true, onceKey: "gate-bark" }, ({ player, npc }) => {
      if (player.knowledge.has(PATROL_KNOWLEDGE.missing)) return;
      npc.say(
        "mutters to the guard beside him, \"Still no word from Varen's patrol. "
        + "They should have been back before dawn.\"",
      );
      rememberRumor(player, "overheard");
    }),
  );

  // ---------------------------------------------------------------------------
  // Discovery path B — talk to Gehnus. Also the main turn-in.
  // ---------------------------------------------------------------------------
  patrol.registerNpc(
    "Guard_Gehnus",
    onQuest("say", {}, ({ initiator, npc, message }) => {
      if (!isQuestPlayer(initiator)) return;
      respondAsGehnus(initiator, npc, initiator.quest.state<PatrolState>(), message);
    }),
  );

  // ---------------------------------------------------------------------------
  // Discovery path C — find the camp with no conversation at all.
  // ---------------------------------------------------------------------------
  patrol.region(
    "north-patrol-camp",
    { role: "discovery", visibility: "hidden" },
    onQuest(
      "region_enter",
      { oncePerPlayer: true, onceKey: "found-camp" },
      ({ player, region }) => {
        player.quest.patch({ foundCamp: true });
        player.knowledge.learn(PATROL_KNOWLEDGE.camp);
        player.journal.discover("found-camp", {
          kind: "observation",
          title: "The Missing Patrol",
          text:
            "A cold fire, dried blood on the grass and a broken Qeynos spear. "
            + "Tracks lead further north, toward the old aqueduct.",
          place: { kind: "area", regionId: region.key },
        });
        player.knowledge.learn(PATROL_KNOWLEDGE.aqueduct);
        // The evidence is a thing you carry, not a flag: it is what makes the
        // conversations downstream possible, and what you may choose to keep.
        player.inventory.grantOnce("camp-spear", BROKEN_SPEAR_ITEM_ID);
        player.progression.awardXpOnce("found-camp", 120, { source: "discovery" });
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // Alternate interpreter — another guard can read the spear even if Gehnus won't.
  // ---------------------------------------------------------------------------
  patrol.npc(
    "Guard_Hezlan",
    {
      role: "witness",
      visibility: "contextual",
      requiresKnowledge: [PATROL_KNOWLEDGE.camp],
    },
    onQuest("say", {}, ({ initiator, npc, message }) => {
      if (!isQuestPlayer(initiator)) return;
      const player = initiator;
      if (isHail(message)) {
        npc.say(
          player.knowledge.has(PATROL_KNOWLEDGE.camp)
            ? `You have the look of someone who found something out there, ${player.name}.`
            : "Keep to the road and you will keep your teeth.",
        );
        return;
      }
      if (!mentions(message, "spear", "patrol", "varen")) return;
      if (!player.inventory.has(BROKEN_SPEAR_ITEM_ID)) {
        npc.say("Bring me the thing itself and I will tell you who carried it.");
        return;
      }
      if (player.knowledge.learn(PATROL_KNOWLEDGE.spearOwner)) {
        npc.say(
          "That notch on the haft is Varen's own mark. He was alive enough to drop it, "
          + "which is more than I feared.",
        );
        player.journal.discover("spear-identified", {
          kind: "person",
          text:
            "Guard Hezlan recognized the spear: it belonged to Varen, who led the patrol.",
        });
        player.quest.patch({ spearIdentified: true });
        player.progression.awardXpOnce("spear-identified", 90, { source: "quest" });
      }
    }),
  );
}

function rememberRumor(player: QuestPlayer, source: "overheard" | "asked"): void {
  player.knowledge.learn(PATROL_KNOWLEDGE.missing);
  player.knowledge.learn(PATROL_KNOWLEDGE.varen);
  player.quest.patch({ heardRumor: true });
  player.journal.discover("heard-rumor", {
    kind: "rumor",
    title: "The Missing Patrol",
    text:
      source === "overheard"
        ? "Guard Gehnus is worried about Varen's patrol, overdue from the north road."
        : "Guard Gehnus asked after a patrol that never returned from the north road.",
    place: { kind: "direction", text: "north of the Qeynos gate" },
  });
  player.progression.awardXpOnce("heard-rumor", 25, { source: "discovery" });
}

function respondAsGehnus(
  player: QuestPlayer,
  npc: QuestNpc,
  state: PatrolState,
  message: string,
): void {
  if (isHail(message)) {
    if (state.reportedToGehnus) {
      npc.say(`Varen owes you a drink, ${player.name}. So do I.`);
      return;
    }
    if (player.knowledge.has(PATROL_KNOWLEDGE.camp)) {
      npc.say(
        `You have the look of the ${say("north road")} about you. What did you find?`,
      );
      return;
    }
    npc.say(
      `Well met, ${player.name}. I would talk longer, but a patrol of ours is late off `
      + `the ${say("north road")}.`,
    );
    return;
  }

  // Carrying the evidence changes the conversation regardless of what was asked.
  if (
    player.inventory.has(BROKEN_SPEAR_ITEM_ID)
    && mentions(message, "spear", "patrol", "varen", "camp")
  ) {
    if (!state.reportedToGehnus) {
      npc.say(
        "That is Varen's spear. Good — broken and dropped means he ran, and running "
        + "means he lives. I will send riders to the aqueduct at once.",
      );
      player.quest.patch({ reportedToGehnus: true, resolution: "reported" });
      player.journal.resolve("found-camp", {
        text: "I brought the broken spear to Guard Gehnus; riders have gone to the aqueduct.",
      });
      player.journal.discover("guard-reported", {
        kind: "resolved",
        text: "Gehnus knows where his patrol went. Whatever happened at the aqueduct is still open.",
      });
      player.progression.awardXpOnce("guard-reported", 250, { source: "quest" });
      player.journal.archive();
      return;
    }
    npc.say("Keep the spear. Varen will want to hear how you came by it.");
    return;
  }

  if (mentions(message, "north road", "patrol", "varen", "aqueduct")) {
    if ((player.level ?? 1) < 3) {
      npc.say(
        "The north road is no place for you yet. Cut your teeth closer to the gate first.",
      );
      return;
    }
    if (!player.knowledge.has(PATROL_KNOWLEDGE.missing)) {
      rememberRumor(player, "asked");
    }
    if (player.knowledge.learn(PATROL_KNOWLEDGE.aqueduct)) {
      npc.say(
        "Varen took them north past the gate. He favors the old aqueduct — says the "
        + "shade keeps his men honest.",
      );
      player.journal.discover("aqueduct-lead", {
        kind: "place",
        text: "Varen's patrol was headed for the old aqueduct, north of the gate.",
        place: { kind: "landmark", landmarkId: "old-aqueduct" },
      });
      return;
    }
    npc.say("North, past the gate, toward the old aqueduct. That is all I know.");
  }
}
