import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QuestManager } from "./quest-manager.js";
import { onQuest } from "./quest-types.js";
import { ZoneQuestRegistry } from "./quest-registry.js";

describe("QuestManager", () => {
  it("binds quests by zone and keeps cycle cursors private to the shard", () => {
    const manager = new QuestManager(2);
    manager.replace([{
      id: "patrol",
      zoneIds: [2],
      handlers: [{
        event: "npc_tick",
        everyTicks: 10,
        actions: [{
          type: "cycle_npc_target",
          npcIndex: 0,
          points: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }],
        }],
      }],
    }], 7);

    assert.deepEqual(manager.dispatch({ type: "npc_tick", tick: 9 }), []);
    assert.deepEqual(manager.dispatch({ type: "npc_tick", tick: 10 }), [
      { type: "set_npc_target", npcIndex: 0, x: 1, y: 2, z: 3 },
    ]);
    assert.deepEqual(manager.dispatch({ type: "npc_tick", tick: 20 }), [
      { type: "set_npc_target", npcIndex: 0, x: 4, y: 5, z: 6 },
    ]);
    assert.deepEqual(manager.status, { revision: 7, questCount: 1 });
  });

  it("registers NPC-specific say handlers and emits actor-aware speech", () => {
    const manager = new QuestManager(2);
    manager.replace([{
      id: "guard-gehnus",
      zoneIds: [2],
      handlers: [onQuest("say", { npcName: "Guard_Gehnus" },
        ({ initiator, npc, receiver, zone, event }) => {
          assert.equal(initiator.kind, "player");
          assert.equal(initiator.name, "Ezaltarem");
          assert.equal(npc, receiver);
          assert.equal(npc.name, "Guard Gehnus");
          assert.equal(npc.level, 10);
          assert.equal(zone.id, 2);
          assert.equal(zone.instanceId, 0);
          assert.equal(zone.tick, 1);
          assert.equal(event.message, "Hail, Guard Gehnus");
          npc.say(`Hello, ${initiator.name}!`);
        },
      )],
    }], 1);

    assert.deepEqual(manager.dispatch({
      type: "say",
      tick: 1,
      sessionId: 9,
      actorName: "Ezaltarem",
      npcName: "Guard Gehnus",
      message: "Hail, Guard Gehnus",
      receiver: { kind: "npc", name: "Guard Gehnus", level: 10 },
    }), [{
      type: "npc_say",
      npcName: "Guard Gehnus",
      message: "Hello, Ezaltarem!",
      sessionId: 9,
    }]);
    assert.deepEqual(manager.dispatch({
      type: "say",
      tick: 2,
      actorName: "Ezaltarem",
      npcName: "Phin_Esrinap",
      message: "Hail",
    }), []);
  });

  it("provides live zone-instance queries and private state to dynamic quests", () => {
    const registry = new ZoneQuestRegistry({ id: 1, shortName: "qeynos" });
    registry.registerNpc("Klieb_Torne", onQuest("say", {}, ({ initiator, npc, zone }) => {
      assert.equal(zone.id, 1);
      assert.equal(zone.instanceId, 4);
      assert.equal(zone.shortName, "qeynos");
      assert.equal(zone.players.length, 1);
      const count = (zone.get<number>("klieb:hails") ?? 0) + 1;
      zone.set("klieb:hails", count);
      zone.npcByName("Fish Ranamer")?.say(`Let ${initiator.name} drink (${count})`);
      npc.moveTo({ x: 7, y: 8, z: 9 });
    }));

    const manager = new QuestManager(1, 4, "qeynos");
    manager.replace([registry.definition()], 1);
    manager.hydrate({
      players: [{ kind: "player", sessionId: 9, name: "Ezaltarem" }],
      npcs: [
        { kind: "npc", name: "Klieb_Torne", npcIndex: 2 },
        { kind: "npc", name: "Fish_Ranamer", npcIndex: 3 },
      ],
    });

    const event = {
      type: "say" as const,
      tick: 1,
      sessionId: 9,
      actorName: "Ezaltarem",
      npcName: "Klieb Torne",
      message: "Hail",
    };
    assert.deepEqual(manager.dispatch(event), [
      {
        type: "npc_say",
        npcName: "Fish_Ranamer",
        message: "Let Ezaltarem drink (1)",
        sessionId: 9,
      },
      { type: "set_npc_target", npcIndex: 2, x: 7, y: 8, z: 9 },
    ]);
    assert.equal(manager.dispatch({ ...event, tick: 2 })[0]?.type, "npc_say");
    assert.equal((manager.dispatch({ ...event, tick: 3 })[0] as { message: string }).message,
      "Let Ezaltarem drink (3)");
  });

  it("runs zone-global handlers first and honors Go-style stop propagation", () => {
    const calls: string[] = [];
    const registry = new ZoneQuestRegistry({ id: 2, shortName: "qeynos2" });
    registry.registerNpc("Guard_Gehnus", onQuest("say", {}, () => { calls.push("npc"); }));
    registry.registerZone(onQuest("say", {}, () => {
      calls.push("zone");
      return true;
    }));
    const manager = new QuestManager(2, 0, "qeynos2");
    manager.replace([registry.definition()], 1);
    manager.dispatch({
      type: "say",
      tick: 1,
      sessionId: 1,
      actorName: "Player",
      npcName: "Guard Gehnus",
      message: "Hail",
    });
    assert.deepEqual(calls, ["zone"]);
  });

  it("routes named custom events through the same zone instance registry", () => {
    const registry = new ZoneQuestRegistry({ id: 2, shortName: "qeynos2" });
    registry.registerNpc("Guard_Gehnus", onQuest("say", {}, ({ zone }) => {
      zone.emitCustom("guards:alert", { message: "Intruder" });
    }));
    registry.registerCustom("guards:alert", onQuest("custom", {}, ({ data, zone }) => {
      const alert = data as { message: string };
      zone.npcByName("Guard Hewet")?.say(alert.message);
    }));
    const manager = new QuestManager(2, 5, "qeynos2");
    manager.replace([registry.definition()], 1);
    manager.hydrate({ npcs: [{ kind: "npc", name: "Guard_Hewet", npcIndex: 4 }] });

    assert.deepEqual(manager.dispatch({
      type: "say",
      tick: 7,
      sessionId: 3,
      actorName: "Ezaltarem",
      npcName: "Guard Gehnus",
      message: "Hail",
    }), [{
      type: "npc_say",
      npcName: "Guard_Hewet",
      message: "Intruder",
      sessionId: 3,
    }]);
  });
});
