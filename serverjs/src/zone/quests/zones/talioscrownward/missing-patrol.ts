import { ITEMS, PLACES } from "../../../../content/eltania.js";
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
 * Three independent ways in (an overheard exchange at the gate, asking Halvane, or
 * simply walking into the camp), several ways out, and nothing that looks like a
 * checklist. All branching is ordinary TypeScript against character knowledge,
 * inventory and level; the only things the engine externalizes are identity, bindings
 * and journal leads.
 *
 * A watch patrol out of Talios Crownward has not come back from the Greymarch. That is
 * the demo's first thread into the Blackroot pressure the world model tracks, and the
 * player is never assigned it.
 */

/** The broken watch spear left at the camp. */
export const BROKEN_SPEAR_ITEM_ID = ITEMS.brokenWatchSpear.itemId;

export const PATROL_KNOWLEDGE = {
  missing: "talios.patrol_missing",
  aqueduct: "talios.wayhouse_route",
  camp: "talios.found_patrol_camp",
  varen: "talios.varen_led_patrol",
  spearOwner: "talios.spear_belonged_to_varen",
} as const;

interface PatrolState {
  readonly heardRumor?: boolean;
  readonly foundCamp?: boolean;
  readonly spearIdentified?: boolean;
  readonly reportedToHalvane?: boolean;
  /** Concrete facts rather than one lossy `completed` bit. */
  readonly resolution?: "reported" | "identified" | "kept-evidence";
}

export function registerMissingPatrol(quests: ZoneQuestRegistry): void {
  const patrol = quests.quest("missing-patrol", {
    title: "The Missing Patrol",
    recommendedLevel: [3, 7],
    repeatability: "once",
    journal: "leads",
    tags: ["talios", "greymarch", "investigation"],
    // Revision 2: renamed from the Qeynos draft. The persisted branch facts kept their
    // shape, so the migration is identity; the knowledge keys moved namespace, which
    // only affects pre-rename development characters.
    revision: 2,
    migrate: (state) => state,
  });

  // The camp exists in the world whether or not anyone told the player about it.
  patrol.defineRegion(
    "greymarch-patrol-camp",
    { kind: "sphere", x: -700, y: 2, z: -620, radius: 45 },
    `an abandoned camp out on ${PLACES.greymarch}`,
  );

  // ---------------------------------------------------------------------------
  // Discovery path A — linger near the gate and overhear the watch.
  // ---------------------------------------------------------------------------
  patrol.npc(
    "Serjeant_Halvane",
    { role: "rumor", visibility: "hidden" },
    onQuest("proximity_enter", { radius: 25, oncePerPlayer: true, onceKey: "gate-bark" }, ({ player, npc }) => {
      if (player.knowledge.has(PATROL_KNOWLEDGE.missing)) return;
      npc.say(
        "mutters to the watchman beside him, \"Still no word from Varen's patrol. "
        + "They should have been back before dawn.\"",
      );
      rememberRumor(player, "overheard");
    }),
  );

  // ---------------------------------------------------------------------------
  // Discovery path B — talk to Halvane. Also the main turn-in.
  // ---------------------------------------------------------------------------
  patrol.registerNpc(
    "Serjeant_Halvane",
    onQuest("say", {}, ({ initiator, npc, message }) => {
      if (!isQuestPlayer(initiator)) return;
      respondAsHalvane(initiator, npc, initiator.quest.state<PatrolState>(), message);
    }),
  );

  // ---------------------------------------------------------------------------
  // Discovery path C — find the camp with no conversation at all.
  // ---------------------------------------------------------------------------
  patrol.region(
    "greymarch-patrol-camp",
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
            "A cold fire, dried blood on the grass and a broken watch spear. "
            + "Tracks lead further out, toward the old wayhouse.",
          place: { kind: "area", regionId: region.key },
        });
        player.knowledge.learn(PATROL_KNOWLEDGE.aqueduct);
        // The evidence is a thing you carry, not a flag: it is what makes the
        // conversations downstream possible, and what you may choose to keep.
        player.inventory.grantOnce("camp-spear", BROKEN_SPEAR_ITEM_ID);
        player.progression.awardBeatOnce("found-camp", "discovery", { source: "discovery" });
      },
    ),
  );

  // ---------------------------------------------------------------------------
  // Alternate interpreter — another watchman can read the spear even if Halvane won't.
  // ---------------------------------------------------------------------------
  patrol.npc(
    "Watchman_Brey",
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
            `${"Watchman Brey"} recognized the spear: it belonged to Varen, `
            + "who led the patrol.",
        });
        player.quest.patch({ spearIdentified: true });
        player.progression.awardBeatOnce("spear-identified", "beat", { source: "quest" });
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
        ? `${"Serjeant Halvane"} is worried about Varen's patrol, overdue from `
          + `${PLACES.greymarch}.`
        : `${"Serjeant Halvane"} asked after a patrol that never returned from `
          + `${PLACES.greymarch}.`,
    place: { kind: "direction", text: `out past the Crownward gate, onto ${PLACES.greymarch}` },
  });
  player.progression.awardBeatOnce("heard-rumor", "hint", { source: "discovery" });
}

function respondAsHalvane(
  player: QuestPlayer,
  npc: QuestNpc,
  state: PatrolState,
  message: string,
): void {
  if (isHail(message)) {
    if (state.reportedToHalvane) {
      npc.say(`Varen owes you a drink, ${player.name}. So do I.`);
      return;
    }
    if (player.knowledge.has(PATROL_KNOWLEDGE.camp)) {
      npc.say(
        `You have the look of the ${say("greymarch road")} about you. What did you find?`,
      );
      return;
    }
    npc.say(
      `Well met, ${player.name}. I would talk longer, but a patrol of ours is late off `
      + `the ${say("greymarch road")}.`,
    );
    return;
  }

  // Carrying the evidence changes the conversation regardless of what was asked.
  if (
    player.inventory.has(BROKEN_SPEAR_ITEM_ID)
    && mentions(message, "spear", "patrol", "varen", "camp")
  ) {
    if (!state.reportedToHalvane) {
      npc.say(
        "That is Varen's spear. Good — broken and dropped means he ran, and running "
        + "means he lives. I will send riders to the wayhouse at once.",
      );
      player.quest.patch({ reportedToHalvane: true, resolution: "reported" });
      player.journal.resolve("found-camp", {
        text:
          `I brought the broken spear to ${"Serjeant Halvane"}; riders have gone `
          + "to the old wayhouse.",
      });
      player.journal.discover("guard-reported", {
        kind: "resolved",
        text:
          "The watch knows where its patrol went. Whatever happened at the wayhouse is "
          + "still open.",
      });
      player.progression.awardBeatOnce("guard-reported", "resolution", { source: "quest" });
      player.journal.archive();
      return;
    }
    npc.say("Keep the spear. Varen will want to hear how you came by it.");
    return;
  }

  if (mentions(message, "greymarch road", "greymarch", "patrol", "varen", "wayhouse")) {
    if ((player.level ?? 1) < 3) {
      npc.say(
        `${PLACES.greymarch} is no place for you yet. Cut your teeth closer to the gate first.`,
      );
      return;
    }
    if (!player.knowledge.has(PATROL_KNOWLEDGE.missing)) {
      rememberRumor(player, "asked");
    }
    if (player.knowledge.learn(PATROL_KNOWLEDGE.aqueduct)) {
      npc.say(
        "Varen took them out past the gate. He favors the old wayhouse — says the "
        + "shade keeps his men honest.",
      );
      player.journal.discover("wayhouse-lead", {
        kind: "place",
        text: `Varen's patrol was headed for the old wayhouse, out on ${PLACES.greymarch}.`,
        place: { kind: "landmark", landmarkId: "old-wayhouse" },
      });
      return;
    }
    npc.say("Out past the gate, toward the old wayhouse. That is all I know.");
  }
}
