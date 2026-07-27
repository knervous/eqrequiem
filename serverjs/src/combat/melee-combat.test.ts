import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadZoneSimulationKernel } from "../zone/zone-kernel-node.js";
import {
  DEFAULT_MELEE_COMBAT_RULES,
  deriveMaximumHp,
  MeleeCombatSystem,
  resolveMeleeSwing,
  type CombatantStats,
} from "./melee-combat.js";

const ATTACKER: CombatantStats = {
  level: 10,
  strength: 105,
  stamina: 75,
  dexterity: 100,
  agility: 75,
  offense: 50,
  defense: 50,
  armorClass: 0,
  maximumHp: 100,
  weaponDamage: 10,
  attackDelayMs: 2_000,
  haste: 0,
  meleeRange: 3,
};

const DEFENDER: CombatantStats = {
  ...ATTACKER,
  strength: 75,
  dexterity: 75,
  agility: 100,
  armorClass: 100,
  maximumHp: 5,
  weaponDamage: 2,
};

describe("authoritative melee combat", () => {
  it("derives HP and a mitigated hit entirely from configurable rules", () => {
    assert.equal(deriveMaximumHp(10, 75, 20), 160);
    assert.deepEqual(
      resolveMeleeSwing(ATTACKER, DEFENDER, 0, 1_000),
      {
        hit: true,
        hitChancePermille: 700,
        rawDamage: 14,
        damage: 11,
      },
    );
  });

  it("validates targets and applies a deterministic killing swing", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    // The local physics capsule reports its center while NPC content positions
    // are grounded. Vertical anchor differences must not shrink horizontal reach.
    const player = kernel.entities.spawnPC({ id: 1, x: 0, y: 5, z: 0 });
    const npc = kernel.entities.spawnNPC({
      id: 2,
      x: 2,
      y: 0,
      z: 0,
      speed: 1,
    });
    const combat = new MeleeCombatSystem(kernel.entities, 20, {
      ...DEFAULT_MELEE_COMBAT_RULES,
      baseHitChancePermille: 1_000,
      minimumHitChancePermille: 1_000,
      maximumHitChancePermille: 1_000,
      minimumVariancePermille: 1_000,
      maximumVariancePermille: 1_000,
    });
    combat.register(player, ATTACKER);
    combat.register(npc, DEFENDER);

    assert.equal(combat.setAutoAttack(1, 1, true, 10).outcome, "invalid-target");
    assert.equal(combat.setAutoAttack(1, 2, true, 10).outcome, "started");
    assert.deepEqual(combat.tick(10), [{
      tick: 10,
      attackerId: 1,
      targetId: 2,
      outcome: "hit",
      swingSequence: 1,
      damage: 11,
      targetCurrentHp: 0,
      targetMaximumHp: 5,
      killed: true,
    }]);
    assert.equal(npc.currentHp, 0);
    assert.equal(npc.moveSpeed, 0);
    assert.deepEqual(combat.tick(11), []);
  });

  it("uses the expanded horizontal reach without imposing a facing cone", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const player = kernel.entities.spawnPC({ id: 30, x: 0, y: 0, z: 0 });
    const npc = kernel.entities.spawnNPC({
      id: 40,
      x: 5.9,
      y: 0,
      z: 0,
      speed: 0,
    });
    const combat = new MeleeCombatSystem(kernel.entities, 20);
    combat.register(player, ATTACKER);
    combat.register(npc, DEFENDER);

    assert.equal(combat.isWithinMeleeReach(player.id, npc.id), true);
    npc.position.x = 6.1;
    assert.equal(combat.isWithinMeleeReach(player.id, npc.id), false);
  });

  it("retaliates, clears engagement on PC death, and restores full HP", async () => {
    const kernel = await loadZoneSimulationKernel("debug");
    const player = kernel.entities.spawnPC({ id: 10, x: 0, y: 0, z: 0 });
    const npc = kernel.entities.spawnNPC({
      id: 20,
      x: 2,
      y: 0,
      z: 0,
      speed: 1,
    });
    const combat = new MeleeCombatSystem(kernel.entities, 20, {
      ...DEFAULT_MELEE_COMBAT_RULES,
      baseHitChancePermille: 1_000,
      minimumHitChancePermille: 1_000,
      maximumHitChancePermille: 1_000,
      minimumVariancePermille: 1_000,
      maximumVariancePermille: 1_000,
    });
    combat.register(player, { ...DEFENDER, maximumHp: 5 });
    combat.register(npc, { ...ATTACKER, maximumHp: 100 });
    combat.setAutoAttack(player.id, npc.id, true, 50);

    const events = combat.tick(50);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.attackerId, player.id);
    assert.equal(events[1]?.attackerId, npc.id);
    assert.equal(events[1]?.targetId, player.id);
    assert.equal(events[1]?.killed, true);
    assert.equal(player.currentHp, 0);
    assert.equal(npc.aggroTargetId, 0);
    assert.deepEqual(combat.tick(51), []);

    combat.respawn(player.id);
    assert.equal(player.currentHp, player.maximumHp);
  });
});
