import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tauntPlan } from "../combat/threat.js";

import {
  MeleeCombatSystem,
  type CombatantStats,
} from "../combat/melee-combat.js";
import { loadZoneSimulationKernel } from "../zone/zone-kernel-node.js";
import {
  DEFAULT_NPC_ENGAGEMENT_RULES,
  NpcEngagementSystem,
} from "./npc-engagement.js";

const STATS: CombatantStats = {
  level: 1,
  strength: 75,
  stamina: 75,
  dexterity: 75,
  agility: 75,
  offense: 5,
  defense: 5,
  armorClass: 0,
  maximumHp: 100,
  weaponDamage: 2,
  attackDelayMs: 2_000,
  haste: 0,
  meleeRange: 2,
};

describe("NPC engagement and pursuit", () => {
  it("selects top hate deterministically and applies paths on a later phase", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const npc = kernel.entities.spawnNPC({
      id: 100,
      x: 0,
      y: 0,
      z: 0,
      speed: 4,
    });
    const first = kernel.entities.spawnPC({ id: 10, x: 20, y: 0, z: 0 });
    const second = kernel.entities.spawnPC({ id: 20, x: 30, y: 0, z: 0 });
    const combat = new MeleeCombatSystem(kernel.entities, 20);
    for (const entity of [npc, first, second]) combat.register(entity, STATS);
    const engagement = new NpcEngagementSystem(
      kernel.entities,
      combat,
      {
        ...DEFAULT_NPC_ENGAGEMENT_RULES,
        repathIntervalTicks: 5,
      },
    );
    engagement.registerNpc(npc);

    assert.equal(combat.setAutoAttack(first.id, npc.id, true, 1)?.outcome, "started");
    assert.deepEqual(engagement.tick(1), []);
    assert.equal(engagement.isEngaged(npc.id), false);
    engagement.noteDamage(npc.id, first.id, 1, 1);
    engagement.noteDamage(npc.id, second.id, 8, 1);
    const [request] = engagement.tick(2);
    assert.ok(request);
    assert.equal(request.targetId, second.id);
    assert.equal(npc.aggroTargetId, second.id);
    assert.equal(engagement.diagnostic(npc.id, 2)?.hateList[0]?.entityId, second.id);

    assert.equal(
      engagement.acceptPath(
        request.requestId,
        request.npcId,
        request.targetId,
        [
          { x: 0, y: 0, z: 0 },
          { x: 5, y: 0, z: 4 },
          { x: 30, y: 0, z: 0 },
        ],
      ),
      true,
    );
    assert.deepEqual(engagement.tick(3), []);
    assert.equal(npc.target.x, 5);
    assert.equal(npc.target.z, 4);
    assert.equal(
      engagement.diagnostic(npc.id, 3)?.navigation.status,
      "following-path",
    );
  });

  it("falls through the hate list and fully clears aggro", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const npc = kernel.entities.spawnNPC({
      id: 200,
      x: 0,
      y: 0,
      z: 0,
      speed: 2,
    });
    const lowerId = kernel.entities.spawnPC({ id: 30, x: 20, y: 0, z: 0 });
    const higherId = kernel.entities.spawnPC({ id: 40, x: 20, y: 0, z: 0 });
    const combat = new MeleeCombatSystem(kernel.entities, 20);
    for (const entity of [npc, lowerId, higherId]) combat.register(entity, STATS);
    const engagement = new NpcEngagementSystem(kernel.entities, combat);
    engagement.registerNpc(npc);

    engagement.addHate(npc.id, higherId.id, 5, 0, 1);
    engagement.addHate(npc.id, lowerId.id, 5, 0, 1);
    engagement.tick(2);
    assert.equal(npc.aggroTargetId, lowerId.id);

    engagement.clearEntity(lowerId.id);
    engagement.tick(3);
    assert.equal(npc.aggroTargetId, higherId.id);

    engagement.clearEntity(higherId.id);
    assert.equal(engagement.isEngaged(npc.id), false);
    assert.equal(npc.aggroTargetId, 0);
  });

  it("lets a taunt pull an enemy off whoever out-damaged the tank", async () => {
    // The whole point of Taunt: a Warrior who is behind on threat can still take the
    // enemy, and the enemy goes back to the list when the window closes.
    const kernel = await loadZoneSimulationKernel("debug");
    const npc = kernel.entities.spawnNPC({ id: 200, x: 0, y: 0, z: 0, speed: 4 });
    const warrior = kernel.entities.spawnPC({ id: 11, x: 5, y: 0, z: 0 });
    const wizard = kernel.entities.spawnPC({ id: 22, x: 6, y: 0, z: 0 });
    const combat = new MeleeCombatSystem(kernel.entities, 20);
    for (const entity of [npc, warrior, wizard]) combat.register(entity, STATS);
    const engagement = new NpcEngagementSystem(kernel.entities, combat);
    engagement.registerNpc(npc);

    let now = 0;
    engagement.setClock(() => now);

    // The wizard is comfortably ahead on threat.
    engagement.noteDamage(npc.id, warrior.id, 10, 1);
    engagement.noteDamage(npc.id, wizard.id, 400, 1);
    assert.equal(engagement.leader(npc.id)?.entityId, wizard.id);

    // The Warrior taunts: placed above the leader, and attention forced for 3s.
    const plan = tauntPlan(engagement, npc.id, warrior.id, 3_000);
    engagement.applyThreat(plan, 2, now);
    engagement.tick(2);
    assert.equal(
      npc.aggroTargetId,
      warrior.id,
      "the taunt must actually take the enemy",
    );
    assert.equal(
      engagement.leader(npc.id, warrior.id)?.entityId,
      wizard.id,
      "the wizard is still on the list, just no longer led",
    );

    // Hate placed the Warrior on top, so they keep it after the window closes.
    now = 4_000;
    engagement.tick(3);
    assert.equal(engagement.leader(npc.id)?.entityId, warrior.id);
  });
});
