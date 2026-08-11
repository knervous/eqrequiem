import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ZONES } from "../../content/eltania.js";
import { QuestManager } from "../quest-manager.js";
import { emptyCharacterSnapshot } from "../quest-state.js";
import { worldContextFlags } from "../quest-runtime.js";
import type { QuestEffect } from "../quest-types.js";
import { registerZone } from "../quests/zones/talioscrownward/index.js";
import type { WorldOccurrenceRecord } from "../world-state-types.js";
import { situationRumors, situationRumorsForZone } from "./rumors.js";
import { WORLD_SITUATIONS } from "./index.js";

/**
 * The end of the chain the director starts: a player asks a watchman what is happening
 * and hears about something the world is actually doing right now.
 */

const SESSION = 4;
const GATE = { x: -312, y: 3, z: 130 };

function occurrence(situationKey: string, id: number): WorldOccurrenceRecord {
  return {
    id,
    situationKey,
    state: "active",
    seed: 1,
    data: { route: "west-road" },
    startedAtMs: 0,
    endsAtMs: null,
    resolvedAtMs: null,
  };
}

function shard(active: readonly WorldOccurrenceRecord[]): QuestManager {
  const manager = new QuestManager(
    ZONES.crownward.id,
    0,
    ZONES.crownward.key,
    { tickRateHz: 10 },
  );
  manager.replace(registerZone().definitions(), 1);
  manager.hydrate({
    players: [{ kind: "player", sessionId: SESSION, name: "Ezaltarem", level: 5 }],
    npcs: [{ kind: "npc", name: "Serjeant_Halvane", level: 50, position: GATE }],
  });
  manager.attachCharacter(
    SESSION,
    emptyCharacterSnapshot({ characterId: 21, name: "Ezaltarem", level: 5 }),
  );
  manager.setWorldContext({
    timeOfDay: 12,
    flags: worldContextFlags({ revision: 1, facts: {}, occurrences: active }),
  });
  return manager;
}

function ask(manager: QuestManager): string {
  return manager
    .dispatch({
      type: "say",
      tick: 1,
      sessionId: SESSION,
      actorName: "Ezaltarem",
      npcName: "Serjeant_Halvane",
      message: "what news?",
    })
    .filter((effect: QuestEffect) => effect.type === "npc_say")
    .map((effect) => (effect as { message: string }).message)
    .join(" ");
}

describe("situations reach the player", () => {
  it("tells a player about a situation that is happening right now", () => {
    const ambush = WORLD_SITUATIONS.find((s) => s.key === "greymarch:road-ambush")!;
    const manager = shard([occurrence(ambush.key, 101)]);

    // Ask until the weighted pick lands on it; standing rumors compete for the slot.
    const heard: string[] = [];
    for (let i = 0; i < 12; i++) heard.push(ask(manager));
    assert.ok(
      heard.some((line) => line.includes(ambush.discovery.text)),
      `no source ever mentioned the live situation. Heard:\n${heard.join("\n")}`,
    );
  });

  it("says nothing about a situation that is not happening", () => {
    const manager = shard([]);
    const texts = WORLD_SITUATIONS.map((s) => s.discovery.text);
    const heard: string[] = [];
    for (let i = 0; i < 12; i++) heard.push(ask(manager));
    for (const text of texts) {
      assert.ok(
        !heard.some((line) => line.includes(text)),
        `a situation with no active occurrence was still being talked about: ${text}`,
      );
    }
  });

  it("keys knowledge to the occurrence, so the next one is news again", () => {
    const rumors = situationRumors();
    const rumor = rumors.find((entry) => entry.key === "situation:greymarch:road-ambush")!;
    assert.equal(typeof rumor.knowledge, "function");

    const keyFor = (id: number): string =>
      (rumor.knowledge as (world: never) => string)({
        timeOfDay: null,
        weather: null,
        flags: worldContextFlags({
          revision: 1,
          facts: {},
          occurrences: [occurrence("greymarch:road-ambush", id)],
        }),
      } as never);

    assert.notEqual(
      keyFor(101),
      keyFor(102),
      "a second ambush must be tellable; otherwise recurrence is a one-time announcement",
    );
  });

  it("gives every authored situation a rumor, and only for its own zone", () => {
    assert.equal(situationRumors().length, WORLD_SITUATIONS.length);
    for (const rumor of situationRumorsForZone("greymarch")) {
      assert.match(rumor.key, /^situation:greymarch:/);
    }
    assert.equal(situationRumorsForZone("nowhere").length, 0);
  });
});
