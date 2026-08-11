import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QuestManager } from "../../../quest-manager.js";
import { emptyCharacterSnapshot } from "../../../quest-state.js";
import { questBindingsForSource, npcDiscoveryHint } from "../../../quest-zone-registry.js";
import type { QuestEffect, QuestItemSnapshot } from "../../../quest-types.js";
import { LevelCurve, questExperience } from "../../../quest-progression.js";
import { ZONES } from "../../../../content/eltania.js";
import { registerZone } from "./index.js";
import { BROKEN_SPEAR_ITEM_ID, PATROL_KNOWLEDGE } from "./missing-patrol.js";

const SESSION = 3;
/**
 * Beats are authored as a share of the level they are met at, so the tests assert the
 * same way. A literal here would only re-encode the curve, and would have to be edited
 * every time the curve is tuned.
 */
const beat = (weight: Parameters<typeof questExperience>[2], level = 5): number =>
  questExperience(LevelCurve.default(), level, weight);

const CAMP = { x: -700, y: 2, z: -620 };
const GATE = { x: -312, y: 3, z: 130 };

function shard(options: {
  level?: number;
  inventory?: readonly QuestItemSnapshot[];
} = {}): QuestManager {
  const manager = new QuestManager(ZONES.crownward.id, 0, ZONES.crownward.key, { tickRateHz: 10 });
  manager.replace(registerZone().definitions(), 1);
  manager.hydrate({
    players: [{
      kind: "player",
      sessionId: SESSION,
      name: "Ezaltarem",
      level: options.level ?? 5,
    }],
    npcs: [
      { kind: "npc", name: "Serjeant_Halvane", level: 50, position: GATE },
      { kind: "npc", name: "Watchman_Brey", level: 50, position: { x: 18, y: 2, z: -575 } },
    ],
  });
  manager.attachCharacter(SESSION, emptyCharacterSnapshot({
    characterId: 11,
    name: "Ezaltarem",
    level: options.level ?? 5,
    inventory: options.inventory ?? [],
  }));
  return manager;
}

function speech(effects: readonly QuestEffect[]): string[] {
  return effects
    .filter((effect) => effect.type === "npc_say")
    .map((effect) => (effect as { message: string }).message);
}

function say(manager: QuestManager, npcName: string, message: string): QuestEffect[] {
  return manager.dispatch({
    type: "say",
    tick: 1,
    sessionId: SESSION,
    actorName: "Ezaltarem",
    npcName,
    message,
  });
}

describe("The Missing Patrol", () => {
  it("can be discovered by lingering near the gate, with no conversation", () => {
    const manager = shard();
    const effects = manager.updatePlayerPosition(SESSION, {
      x: GATE.x + 10, y: GATE.y, z: GATE.z,
    }, 1);

    assert.match(speech(effects).join(" "), /Varen's patrol/);
    const character = manager.character(SESSION);
    assert.equal(character?.knows(PATROL_KNOWLEDGE.missing), true);
    assert.deepEqual(
      manager.journalFor(SESSION).map((entry) => entry.leadKey),
      ["heard-rumor"],
    );
    // Walking away and back must not re-pay the discovery.
    manager.updatePlayerPosition(SESSION, { x: 0, y: 0, z: 0 }, 2);
    manager.updatePlayerPosition(SESSION, { x: GATE.x + 10, y: GATE.y, z: GATE.z }, 3);
    assert.equal(character?.experience, beat("hint"));
  });

  it("can be discovered by asking Halvane, in whatever words the player chose", () => {
    for (const question of [
      "patrol",
      "What about the missing patrol?",
      "tell me about the greymarch road",
      "Who is Varen?",
    ]) {
      const manager = shard();
      say(manager, "Serjeant_Halvane", question);
      assert.equal(
        manager.character(SESSION)?.knows(PATROL_KNOWLEDGE.missing),
        true,
        `"${question}" should be understood as asking about the patrol`,
      );
    }
  });

  it("can be discovered by walking into the camp without meeting anyone", () => {
    const manager = shard();
    const effects = manager.updatePlayerPosition(SESSION, CAMP, 1);

    const character = manager.character(SESSION);
    assert.equal(character?.knows(PATROL_KNOWLEDGE.camp), true);
    assert.equal(character?.knows(PATROL_KNOWLEDGE.aqueduct), true);
    assert.equal(character?.experience, beat("discovery"));
    const lead = manager.journalFor(SESSION).find((entry) => entry.leadKey === "found-camp");
    assert.equal(lead?.kind, "observation");
    assert.deepEqual(lead?.place, { kind: "area", regionId: "greymarch-patrol-camp" });
    assert.ok(effects.some((effect) => effect.type === "award_xp"));
    // Finding the camp puts the evidence in your hands, so the branches that need it
    // are reachable by playing rather than only by test fixture.
    const grant = effects.find((effect) => effect.type === "grant_item");
    assert.equal(grant?.type === "grant_item" && grant.itemId, BROKEN_SPEAR_ITEM_ID);
    assert.equal(character?.inventory.some((item) => item.id === BROKEN_SPEAR_ITEM_ID), true);

    // Re-entering the camp must not mint a second spear.
    manager.updatePlayerPosition(SESSION, { x: 0, y: 0, z: 0 }, 2);
    const again = manager.updatePlayerPosition(SESSION, CAMP, 3);
    assert.equal(again.some((effect) => effect.type === "grant_item"), false);
  });

  it("gates the Greymarch on level without hiding the quest", () => {
    const manager = shard({ level: 2 });
    const effects = say(manager, "Serjeant_Halvane", "greymarch road");

    assert.match(speech(effects).join(" "), /no place for you yet/);
    assert.equal(manager.character(SESSION)?.knows(PATROL_KNOWLEDGE.aqueduct), false);
  });

  it("offers only phrases the NPC actually said as clickable responses", () => {
    const manager = shard();
    const greeting = speech(say(manager, "Serjeant_Halvane", "Hail, Serjeant Halvane")).join(" ");

    const links = [...greeting.matchAll(/\{\{(.*?)\}\}/g)].map(([, token]) =>
      JSON.parse(Buffer.from(token!, "base64").toString("utf8")) as { data: string });
    assert.deepEqual(links.map((link) => link.data), ["greymarch road"]);
  });

  it("resolves through Halvane when the player carries the evidence back", () => {
    const manager = shard();
    // No fixture: walking into the camp is what put the spear in the pack.
    manager.updatePlayerPosition(SESSION, CAMP, 1);
    const effects = say(manager, "Serjeant_Halvane", "I found your patrol's spear");

    assert.match(speech(effects).join(" "), /riders to the wayhouse/);
    const journal = manager.journalFor(SESSION);
    assert.equal(journal.find((entry) => entry.leadKey === "found-camp")?.status, "resolved");
    assert.equal(journal.find((entry) => entry.leadKey === "guard-reported")?.kind, "resolved");
    assert.ok(journal.every((entry) => entry.archived));
    assert.equal(
      manager.character(SESSION)?.experience,
      beat("discovery") + beat("resolution"),
    );
  });

  it("supports a second interpreter for the same evidence", () => {
    const manager = shard({
      inventory: [{ id: BROKEN_SPEAR_ITEM_ID, name: "Rusty Spear", quantity: 1 }],
    });
    const effects = say(manager, "Watchman_Brey", "Whose spear is this?");

    assert.match(speech(effects).join(" "), /Varen's own mark/);
    assert.equal(manager.character(SESSION)?.knows(PATROL_KNOWLEDGE.spearOwner), true);
    assert.equal(manager.character(SESSION)?.experience, beat("beat"));
  });

  it("refuses to identify a spear the player is not carrying", () => {
    const manager = shard();
    const effects = say(manager, "Watchman_Brey", "Whose spear is this?");

    assert.match(speech(effects).join(" "), /Bring me the thing itself/);
    assert.equal(manager.character(SESSION)?.knows(PATROL_KNOWLEDGE.spearOwner), false);
  });
});

describe("generated discoverability index", () => {
  it("derives bindings from authored code rather than a maintained table", () => {
    const bindings = questBindingsForSource("npc", "Serjeant_Halvane".replaceAll("_", " "), ZONES.crownward.key);
    assert.deepEqual(bindings.map((binding) => [binding.questKey, binding.role]), [
      // He carries the zone's rumors and owns a role in the patrol thread.
      [`zone:${ZONES.crownward.key}`, "rumor"],
      [`${ZONES.crownward.key}:missing-patrol`, "rumor"],
    ]);
    assert.deepEqual(
      bindings.find((binding) => binding.questKey === `${ZONES.crownward.key}:missing-patrol`)
        ?.recommendedLevel,
      [3, 7],
    );
  });

  it("marks an NPC only once the character has the connecting knowledge", () => {
    assert.equal(npcDiscoveryHint("Watchman_Brey", ZONES.crownward.key), "none");
    assert.equal(
      npcDiscoveryHint("Watchman_Brey", ZONES.crownward.key, new Set([PATROL_KNOWLEDGE.camp])),
      "contextual",
    );
    // Owning quest content is never on its own a reason to mark an NPC.
    assert.equal(npcDiscoveryHint("Serjeant_Halvane", ZONES.crownward.key), "none");
  });
});
