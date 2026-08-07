import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QuestManager } from "./quest-manager.js";
import { emptyCharacterSnapshot } from "./quest-state.js";
import { ZoneQuestRegistry } from "./quest-registry.js";
import { isQuestPlayer, onQuest, type QuestEffect } from "./quest-types.js";

const SESSION = 7;
const CHARACTER = 42;

function shard(build: (registry: ZoneQuestRegistry) => void): QuestManager {
  const registry = new ZoneQuestRegistry({ id: 2, shortName: "qeynos2" });
  build(registry);
  const manager = new QuestManager(2, 0, "qeynos2", { tickRateHz: 10 });
  manager.replace(registry.definitions(), 1);
  manager.hydrate({
    players: [{ kind: "player", sessionId: SESSION, name: "Ezaltarem", level: 5 }],
  });
  manager.attachCharacter(SESSION, emptyCharacterSnapshot({
    characterId: CHARACTER,
    name: "Ezaltarem",
    level: 5,
  }));
  return manager;
}

function hail(manager: QuestManager, npcName: string, message = "Hail"): QuestEffect[] {
  return manager.dispatch({
    type: "say",
    tick: 1,
    sessionId: SESSION,
    actorName: "Ezaltarem",
    npcName,
    message,
  });
}

describe("persistent character quest state", () => {
  it("makes knowledge, leads and one-time awards idempotent", () => {
    const manager = shard((registry) => {
      registry.quest("rumors").registerNpc(
        "Guard_Gehnus",
        onQuest("say", {}, ({ initiator }) => {
          if (!isQuestPlayer(initiator)) return;
          const player = initiator;
          player.knowledge.learn("qeynos2.patrol_missing");
          player.journal.discover("heard-rumor", { kind: "rumor", text: "A patrol is late." });
          player.progression.awardXpOnce("heard-rumor", 25);
        }),
      );
    });

    const first = hail(manager, "Guard_Gehnus");
    assert.deepEqual(first.map((effect) => effect.type), [
      "knowledge_learn",
      "journal_discover",
      "award_xp",
    ]);

    // Re-hailing must not re-learn, re-discover or re-pay.
    assert.deepEqual(hail(manager, "Guard_Gehnus"), []);
    assert.equal(manager.journalFor(SESSION).length, 1);
    assert.equal(manager.character(SESSION)?.experience, 25);
  });

  it("drains one persistence batch per changed row and then goes quiet", () => {
    const manager = shard((registry) => {
      registry.quest("rumors").registerNpc(
        "Guard_Gehnus",
        onQuest("say", {}, ({ initiator }) => {
          if (!isQuestPlayer(initiator)) return;
          initiator.quest.patch({ heardRumor: true });
          initiator.knowledge.learn("qeynos2.patrol_missing");
        }),
      );
    });

    hail(manager, "Guard_Gehnus");
    const batches = manager.drainPersistence();
    assert.equal(batches.length, 1);
    assert.equal(batches[0]?.characterId, CHARACTER);
    assert.deepEqual(batches[0]?.quests, [{
      questKey: "qeynos2:rumors",
      revision: 1,
      state: { heardRumor: true },
    }]);
    assert.deepEqual(batches[0]?.knowledgeLearned, [
      { key: "qeynos2.patrol_missing", data: {} },
    ]);
    assert.deepEqual(manager.drainPersistence(), []);
  });

  it("migrates persisted state before a handler can observe it", () => {
    const registry = new ZoneQuestRegistry({ id: 2, shortName: "qeynos2" });
    const seen: unknown[] = [];
    registry
      .quest("missing-patrol", {
        revision: 3,
        migrate: (state, fromRevision) => {
          if (fromRevision < 3) {
            return { resolution: state.completed === true ? "reported" : null };
          }
          return state;
        },
      })
      .registerNpc("Guard_Gehnus", onQuest("say", {}, ({ initiator }) => {
        if (!isQuestPlayer(initiator)) return;
        seen.push(initiator.quest.state());
      }));
    const manager = new QuestManager(2, 0, "qeynos2");
    manager.replace(registry.definitions(), 1);
    manager.attachCharacter(SESSION, emptyCharacterSnapshot({
      characterId: CHARACTER,
      quests: {
        "qeynos2:missing-patrol": { revision: 1, state: { completed: true } },
      },
    }));

    hail(manager, "Guard_Gehnus");
    assert.deepEqual(seen, [{ resolution: "reported" }]);
  });

  it("keeps `oncePerPlayer` handlers claimed across repeat events", () => {
    let fired = 0;
    const manager = shard((registry) => {
      registry.quest("camp").registerRegion(
        "north-patrol-camp",
        onQuest("region_enter", { oncePerPlayer: true }, () => { fired += 1; }),
      );
      registry.quest("camp").defineRegion("north-patrol-camp", {
        kind: "sphere", x: 0, y: 0, z: 0, radius: 10,
      });
    });

    manager.updatePlayerPosition(SESSION, { x: 0, y: 0, z: 0 }, 1);
    manager.updatePlayerPosition(SESSION, { x: 100, y: 0, z: 0 }, 2);
    manager.updatePlayerPosition(SESSION, { x: 0, y: 0, z: 0 }, 3);
    assert.equal(fired, 1);
  });
});

describe("expanded event surface", () => {
  it("raises authored region enter/leave from the position stream", () => {
    const events: string[] = [];
    const manager = shard((registry) => {
      const scope = registry.quest("camp");
      scope.defineRegion("north-patrol-camp", {
        kind: "sphere", x: -700, y: 2, z: -620, radius: 45,
      });
      scope.registerRegion(
        "north-patrol-camp",
        onQuest("region_enter", {}, ({ region }) => { events.push(`enter:${region.key}`); }),
        onQuest("region_leave", {}, ({ region }) => { events.push(`leave:${region.key}`); }),
      );
    });

    manager.updatePlayerPosition(SESSION, { x: -700, y: 2, z: -620 }, 1);
    manager.updatePlayerPosition(SESSION, { x: -690, y: 2, z: -600 }, 2);
    manager.updatePlayerPosition(SESSION, { x: 0, y: 2, z: 0 }, 3);
    assert.deepEqual(events, ["enter:north-patrol-camp", "leave:north-patrol-camp"]);
  });

  it("raises proximity only for the radius that was registered", () => {
    const distances: number[] = [];
    const manager = shard((registry) => {
      registry.quest("gate").registerNpc(
        "Guard_Gehnus",
        onQuest("proximity_enter", { radius: 25 }, ({ distance }) => {
          distances.push(Math.round(distance));
        }),
      );
    });
    manager.hydrate({
      npcs: [{ kind: "npc", name: "Guard_Gehnus", position: { x: 0, y: 0, z: 0 } }],
    });

    manager.updatePlayerPosition(SESSION, { x: 40, y: 0, z: 0 }, 1);
    assert.deepEqual(distances, []);
    manager.updatePlayerPosition(SESSION, { x: 10, y: 0, z: 0 }, 2);
    manager.updatePlayerPosition(SESSION, { x: 8, y: 0, z: 0 }, 3);
    assert.deepEqual(distances, [10]);
  });

  it("credits an npc_death to the participants the zone supplied", () => {
    const credited: string[] = [];
    const manager = shard((registry) => {
      registry.quest("gnolls").registerZone(
        onQuest("npc_death", {}, ({ npc, credit }) => {
          for (const player of credit) {
            player.knowledge.learn(`killed.${npc.name}`);
            credited.push(player.name);
          }
        }),
      );
    });

    manager.dispatchNpcDeath({
      tick: 4,
      npc: { kind: "npc", name: "a_gnoll_pup", level: 2 },
      creditSessionIds: [SESSION],
    });
    assert.deepEqual(credited, ["Ezaltarem"]);
    assert.equal(manager.character(SESSION)?.knows("killed.a_gnoll_pup"), true);
  });

  it("fires named timers on the tick they come due, once", () => {
    const fired: string[] = [];
    const manager = shard((registry) => {
      const scope = registry.quest("ritual");
      scope.registerNpc("Guard_Gehnus", onQuest("say", {}, ({ initiator }) => {
        if (!isQuestPlayer(initiator)) return;
        initiator.quest.timer("meet-at-midnight", 500);
      }));
      scope.registerZone(
        onQuest("timer", { timerName: "meet-at-midnight" }, ({ name, player }) => {
          fired.push(`${name}:${player?.name ?? "zone"}`);
        }),
      );
    });

    hail(manager, "Guard_Gehnus");
    assert.deepEqual(manager.advanceTimers(2), []);
    manager.advanceTimers(10);
    manager.advanceTimers(20);
    assert.deepEqual(fired, ["meet-at-midnight:Ezaltarem"]);
  });

  it("reports whether a hand-in was consumed", () => {
    const manager = shard((registry) => {
      registry.quest("turnin").registerNpc(
        "Guard_Gehnus",
        onQuest("item_turn_in", {}, ({ items, consume, npc }) => {
          if (items.some((item) => item.id === 7009)) {
            npc.say("That is Varen's spear.");
            consume();
          }
        }),
      );
    });

    const effects = manager.dispatchTurnIn({
      tick: 5,
      sessionId: SESSION,
      npcName: "Guard_Gehnus",
      items: [{ id: 7009, name: "Rusty Spear", quantity: 1 }],
    });
    const result = effects.find((effect) => effect.type === "item_turn_in_result");
    assert.equal(result?.type === "item_turn_in_result" && result.consumed, true);
  });
});
