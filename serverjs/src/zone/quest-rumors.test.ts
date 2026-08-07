import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QuestManager } from "./quest-manager.js";
import { emptyCharacterSnapshot } from "./quest-state.js";
import { ZoneQuestRegistry } from "./quest-registry.js";
import type { QuestEffect } from "./quest-types.js";

const SESSION = 5;

function shard(options: {
  characterId?: number;
  timeOfDay?: number | null;
  flags?: Record<string, unknown>;
} = {}): QuestManager {
  const registry = new ZoneQuestRegistry({ id: 2, shortName: "qeynos2" });
  registry.rumors.define(
    {
      key: "patrol",
      text: "A patrol never came back from the north road.",
      weight: 9,
      experience: 15,
      lead: { leadKey: "heard-rumor", questKey: "qeynos2:missing-patrol" },
      expiresWhen: (world) => world.flags["patrol_resolved"] === true,
    },
    {
      key: "gnolls",
      text: "The gnolls have been bolder lately.",
      weight: 6,
    },
    {
      key: "aqueduct",
      text: "The aqueduct sees traffic after dark.",
      weight: 5,
      when: (world) => world.timeOfDay === null || world.timeOfDay >= 19,
    },
  );
  registry.rumorSource("Guard_Gehnus", { quiet: "The road has been quiet." });

  const manager = new QuestManager(2, 0, "qeynos2");
  manager.replace(registry.definitions(), 1);
  manager.hydrate({
    players: [{ kind: "player", sessionId: SESSION, name: "Ezaltarem", level: 5 }],
  });
  manager.attachCharacter(SESSION, emptyCharacterSnapshot({
    characterId: options.characterId ?? 11,
    name: "Ezaltarem",
    level: 5,
  }));
  manager.setWorldContext({
    timeOfDay: options.timeOfDay ?? 12,
    ...(options.flags ? { flags: options.flags } : {}),
  });
  return manager;
}

function ask(manager: QuestManager, message: string): QuestEffect[] {
  return manager.dispatch({
    type: "say",
    tick: 1,
    sessionId: SESSION,
    actorName: "Ezaltarem",
    npcName: "Guard_Gehnus",
    message,
  });
}

function spoken(effects: readonly QuestEffect[]): string {
  return effects
    .filter((effect) => effect.type === "npc_say")
    .map((effect) => (effect as { message: string }).message)
    .join(" ");
}

describe("rumor network", () => {
  it("answers a request for news but never a hail", () => {
    const manager = shard();
    assert.equal(spoken(ask(manager, "Hail, Guard Gehnus")), "");
    assert.notEqual(spoken(ask(manager, "any news?")), "");
  });

  it("understands the ordinary ways of asking", () => {
    for (const question of [
      "news",
      "What news?",
      "have you heard anything",
      "what's the talk around here",
      "any rumors?",
    ]) {
      const manager = shard();
      assert.notEqual(
        spoken(ask(manager, question)),
        "",
        `"${question}" should read as asking what is happening`,
      );
    }
  });

  it("never repeats itself, then admits it has nothing left", () => {
    const manager = shard({ timeOfDay: 22 });
    const heard = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt++) {
      const line = spoken(ask(manager, "what news"));
      assert.equal(heard.has(line), false, `repeated a rumor: ${line}`);
      heard.add(line);
    }
    assert.equal(heard.size, 3);
    assert.equal(spoken(ask(manager, "what news")), "The road has been quiet.");
  });

  it("only circulates rumors the world currently makes true", () => {
    const daytime = shard({ timeOfDay: 12 });
    const lines: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      lines.push(spoken(ask(daytime, "what news")));
    }
    assert.equal(
      lines.some((line) => line.includes("after dark")),
      false,
      "the aqueduct rumor should not circulate in daylight",
    );

    const resolved = shard({ flags: { patrol_resolved: true } });
    const settled: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      settled.push(spoken(ask(resolved, "what news")));
    }
    assert.equal(
      settled.some((line) => line.includes("north road")),
      false,
      "a resolved situation should stop being news",
    );
  });

  it("records the fact, the lead and a one-time discovery award", () => {
    const manager = shard();
    const effects = ask(manager, "what news");

    assert.equal(manager.character(SESSION)?.knows("rumor:patrol"), true);
    assert.deepEqual(
      manager.journalFor(SESSION).map((entry) => [entry.questKey, entry.leadKey]),
      [["qeynos2:missing-patrol", "heard-rumor"]],
    );
    const award = effects.find((effect) => effect.type === "award_xp");
    assert.equal(award?.type === "award_xp" && award.amount, 15);
  });

  it("is deterministic per character but varies between them", () => {
    const first = spoken(ask(shard({ characterId: 11, timeOfDay: 22 }), "what news"));
    assert.equal(spoken(ask(shard({ characterId: 11, timeOfDay: 22 }), "what news")), first);

    const others = [12, 13, 14, 15, 16, 17].map((characterId) =>
      spoken(ask(shard({ characterId, timeOfDay: 22 }), "what news")));
    assert.ok(
      others.some((line) => line !== first),
      "different characters should not all open with the same rumor",
    );
  });
});
