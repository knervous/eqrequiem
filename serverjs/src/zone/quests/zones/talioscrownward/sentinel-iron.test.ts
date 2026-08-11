import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QuestManager } from "../../../quest-manager.js";
import { emptyCharacterSnapshot } from "../../../quest-state.js";
import { ZONES } from "../../../../content/eltania.js";
import { registerZone } from "./index.js";
import { SENTINEL_IRON_KNOWLEDGE } from "./sentinel-iron.js";

const SESSION = 10;

function shard(): QuestManager {
  const manager = new QuestManager(ZONES.crownward.id, 0, ZONES.crownward.key, { tickRateHz: 10 });
  manager.replace(registerZone().definitions(), 1);
  manager.hydrate({
    players: [{
      kind: "player",
      sessionId: SESSION,
      name: "Aethel",
      level: 2,
    }],
    npcs: [
      { kind: "npc", name: "Captain_Robert_Vance", level: 50, position: { x: 0, y: 0, z: 0 } },
    ],
  });
  manager.attachCharacter(SESSION, emptyCharacterSnapshot({
    characterId: 101,
    name: "Aethel",
    level: 2,
    inventory: [],
  }));
  return manager;
}

function say(manager: QuestManager, npcName: string, message: string) {
  return manager.dispatch({
    type: "say",
    tick: 1,
    sessionId: SESSION,
    actorName: "Aethel",
    npcName,
    message,
  });
}

function speech(effects: readonly any[]): string[] {
  return effects
    .filter((effect) => effect.type === "npc_say")
    .map((effect) => effect.message);
}

describe("Sentinel's Iron Quest", () => {
  it("assigns the Sentinel's Iron task when discussing iron with Captain Vance", () => {
    const manager = shard();
    const effects1 = say(manager, "Captain_Robert_Vance", "Hail");
    assert.match(speech(effects1).join(" "), /low on Solskar cold iron/);

    const effects2 = say(manager, "Captain_Robert_Vance", "I can fetch the iron from Vael");
    assert.match(speech(effects2).join(" "), /Bring back a bundle of Solskar iron/);

    const character = manager.character(SESSION);
    assert.equal(character?.knows(SENTINEL_IRON_KNOWLEDGE.task), true);
  });
});
