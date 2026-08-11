import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StatusDefinition } from "./ability-types.js";
import {
  controlDuration,
  resolvePhysicalAttack,
  resolveSpell,
  type PhysicalAttack,
} from "./resolution.js";
import { interrupt, StatusSet, UNIMPAIRED } from "./status.js";
import {
  DEFAULT_THREAT_RULES,
  ForcedAttention,
  damageThreat,
  healingThreat,
  reducedAttention,
  tauntPlan,
  type HateView,
} from "./threat.js";
import { predictedActionId, isPredictedActionId, shouldBufferInput } from "./combat-events.js";

/** A deterministic roll sequence, so a fight replays exactly. */
function rolls(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] ?? 0.5;
}

const evenFight: PhysicalAttack = {
  attackerLevel: 10,
  defenderLevel: 10,
  accuracySkill: 100,
  baseDamage: 40,
  defenderArmor: 200,
};

describe("physical resolution", () => {
  it("does not turn level-appropriate combat into a miss streak", () => {
    // A player who cannot affect an even-level enemy is waiting, not deciding.
    let hits = 0;
    for (let i = 0; i < 100; i++) {
      const roll = rolls(0.99, 0.99, i / 100, 0.99, 0.99);
      if (resolvePhysicalAttack(evenFight, roll).outcome !== "miss") hits += 1;
    }
    assert.ok(hits >= 85, `only ${hits}/100 landed against an even-level target`);
  });

  it("keeps a red-con enemy frightening", () => {
    const fromRed = resolvePhysicalAttack(
      { ...evenFight, attackerLevel: 18, defenderLevel: 10 },
      rolls(0.99, 0.99, 0.1, 0.99, 0.99),
    );
    const even = resolvePhysicalAttack(evenFight, rolls(0.99, 0.99, 0.1, 0.99, 0.99));
    assert.ok(fromRed.damage > even.damage * 1.2, "a level gap must still hurt");
  });

  it("resolves avoidance before the attacker's hit roll", () => {
    // Dodging is the defender doing something, not the attacker failing.
    const dodged = resolvePhysicalAttack(
      { ...evenFight, dodgeChance: 1 },
      rolls(0.0),
    );
    assert.equal(dodged.outcome, "dodge");
    assert.equal(dodged.damage, 0);
  });

  it("makes block mitigate rather than negate", () => {
    const blocked = resolvePhysicalAttack(
      { ...evenFight, blockChance: 1, blockMitigation: 0.5 },
      rolls(0.99, 0.99, 0.1, 0.0),
    );
    assert.equal(blocked.outcome, "block");
    assert.ok(blocked.damage > 0, "a block is mitigation, not immunity");
  });

  it("never deals less than a point on a landed hit", () => {
    const result = resolvePhysicalAttack(
      { ...evenFight, baseDamage: 1, defenderArmor: 100_000 },
      rolls(0.99, 0.99, 0.1, 0.99, 0.99),
    );
    assert.ok(result.damage >= 1);
  });
});

describe("spell resolution", () => {
  it("reduces rather than erases an ordinary resist", () => {
    const result = resolveSpell(
      { casterLevel: 10, targetLevel: 10, school: "fire", baseAmount: 100, targetResist: 100 },
      rolls(0.5),
    );
    assert.equal(result.outcome, "partial");
    assert.ok(result.amount > 0 && result.amount < 100);
  });

  it("fully resists only on a genuine mismatch", () => {
    const mismatch = resolveSpell(
      { casterLevel: 5, targetLevel: 25, school: "fire", baseAmount: 100, targetResist: 900 },
      rolls(0.99),
    );
    assert.equal(mismatch.outcome, "resisted");
    assert.equal(mismatch.amount, 0);
  });

  it("lets penetration cancel resistance", () => {
    const result = resolveSpell(
      {
        casterLevel: 10, targetLevel: 10, school: "fire",
        baseAmount: 100, targetResist: 200, penetration: 200,
      },
      rolls(0.5),
    );
    assert.equal(result.outcome, "hit");
    assert.equal(result.amount, 100);
  });

  it("shortens control instead of granting immunity", () => {
    const partial = controlDuration(10_000, 0.5);
    assert.equal(partial, 5_000);
    // A boss reduces further, but is not blanket-immune.
    const boss = controlDuration(10_000, 1, 0.8);
    assert.equal(boss, 2_000);
    assert.ok(boss > 0);
  });
});

const rooted: StatusDefinition = {
  id: "wizard.root_sigil", name: "Root Sigil", durationMs: 8_000,
  stacking: "refresh", control: "root", breaksOnDamage: true,
};
const snared: StatusDefinition = {
  id: "ranger.snare", name: "Snaring Thorn", durationMs: 10_000,
  stacking: "refresh", control: "snare",
};
const stunned: StatusDefinition = {
  id: "common.staggered", name: "Staggered", durationMs: 2_000,
  stacking: "refresh", control: "stun",
};
const dot: StatusDefinition = {
  id: "druid.thornrot", name: "Thornrot", durationMs: 12_000,
  stacking: "independent_by_caster",
  tick: { everyMs: 1_000, amount: { formula: "spell.dot_tick" } },
};

describe("statuses and control", () => {
  it("derives what an actor may do from whatever control is present", () => {
    const statuses = new StatusSet();
    assert.deepEqual(statuses.controlState(), UNIMPAIRED);

    statuses.apply(snared, { nowMs: 0, sourceEntityId: 1 });
    assert.equal(statuses.controlState().movementMultiplier < 1, true);
    assert.equal(statuses.controlState().canMove, true);

    statuses.apply(rooted, { nowMs: 0, sourceEntityId: 1 });
    assert.equal(statuses.controlState().canMove, false);
    assert.equal(statuses.controlState().canAct, true, "root stops feet, not hands");

    statuses.apply(stunned, { nowMs: 0, sourceEntityId: 1 });
    assert.equal(statuses.controlState().canAct, false);
  });

  it("breaks only the control its author said damage should break", () => {
    const statuses = new StatusSet();
    statuses.apply(rooted, { nowMs: 0, sourceEntityId: 1 });
    statuses.apply(snared, { nowMs: 0, sourceEntityId: 1 });
    const broken = statuses.onDamaged();
    assert.deepEqual(broken, [rooted.id]);
    assert.equal(statuses.has(snared.id), true, "snare was not authored to break");
  });

  it("keeps two casters' DoTs independent", () => {
    const statuses = new StatusSet();
    statuses.apply(dot, { nowMs: 0, sourceEntityId: 1 });
    statuses.apply(dot, { nowMs: 0, sourceEntityId: 2 });
    assert.equal(statuses.get(dot.id).length, 2);
  });

  it("does not let a weaker application overwrite a stronger one", () => {
    const statuses = new StatusSet();
    const weakened: StatusDefinition = {
      id: "warrior.disarmed", name: "Disarmed", durationMs: 10_000,
      stacking: "replace_weaker",
    };
    statuses.apply(weakened, { nowMs: 0, sourceEntityId: 1, potency: 1 });
    statuses.apply(weakened, { nowMs: 0, sourceEntityId: 2, potency: 0.4 });
    assert.equal(statuses.get(weakened.id)[0]?.potency, 1);
  });

  it("catches up ticks rather than dropping them on a slow shard", () => {
    const statuses = new StatusSet();
    statuses.apply(dot, { nowMs: 0, sourceEntityId: 1 });
    // One advance covering 5 seconds must still pay 5 ticks.
    const ticks = statuses.advance(5_000);
    assert.equal(ticks.length, 5);
  });

  it("expires on simulation time", () => {
    const statuses = new StatusSet();
    statuses.apply(stunned, { nowMs: 0, sourceEntityId: 1 });
    statuses.advance(1_999);
    assert.equal(statuses.has(stunned.id), true);
    statuses.advance(2_000);
    assert.equal(statuses.has(stunned.id), false);
  });

  it("dispels a bounded number of statuses", () => {
    const statuses = new StatusSet();
    statuses.apply(rooted, { nowMs: 0, sourceEntityId: 1 });
    statuses.apply(snared, { nowMs: 0, sourceEntityId: 1 });
    const removed = statuses.removeWhere((status) => status.definition.control !== undefined, 1);
    assert.equal(removed, 1);
  });
});

describe("interrupt", () => {
  it("lands on an enemy windup and does nothing otherwise", () => {
    const windup = {
      abilityId: "bandit.overhead_chop",
      startedAtMs: 0,
      completesAtMs: 2_000,
      interruptible: true,
    };
    assert.equal(interrupt(windup, 500).interrupted, true);
    assert.equal(interrupt(windup, 2_500).interrupted, false, "already resolved");
    assert.equal(interrupt({ ...windup, interruptible: false }, 500).interrupted, false);
    assert.equal(interrupt(null, 500).interrupted, false);
  });
});

describe("threat", () => {
  function view(entries: Record<number, number>): HateView {
    return {
      hateOf: (_npc, actor) => entries[actor] ?? 0,
      leader: (_npc, exclude) => {
        const sorted = Object.entries(entries)
          .filter(([id]) => Number(id) !== exclude)
          .sort((a, b) => b[1] - a[1])[0];
        return sorted ? { entityId: Number(sorted[0]), hate: sorted[1] } : null;
      },
    };
  }

  it("puts a taunting Warrior just above the current leader", () => {
    const plan = tauntPlan(view({ 2: 1_000 }), 99, 1, 3_000);
    assert.equal(plan.reason, "taunt");
    // 1000 * 1.1 = 1100, and the Warrior had none.
    assert.equal(plan.addHate, 1_100);
    assert.equal(plan.forceAttentionMs, 3_000);
  });

  it("does not inflate the list when the taunter already leads", () => {
    const plan = tauntPlan(view({ 1: 5_000, 2: 1_000 }), 99, 1, 3_000);
    assert.equal(plan.addHate, 0, "already ahead; the taunt only forces attention");
    assert.equal(plan.forceAttentionMs, 3_000);
  });

  it("establishes a taunter against an empty list", () => {
    const plan = tauntPlan(view({}), 99, 1, 3_000);
    assert.equal(plan.addHate, DEFAULT_THREAT_RULES.tauntMinimum);
  });

  it("keeps healing below damage on the list", () => {
    const fromDamage = damageThreat(99, 1, 100).addHate;
    const fromHealing = healingThreat([99], 2, 100)[0]!.addHate;
    assert.ok(
      fromHealing < fromDamage,
      "a Cleric doing their job should not out-threat a Warrior doing theirs",
    );
  });

  it("holds forced attention until it expires", () => {
    const forced = new ForcedAttention();
    forced.force(99, 1, 3_000);
    assert.equal(forced.target(99, 1_000), 1);
    assert.equal(forced.target(99, 3_000), null);
  });

  it("lets a boss shorten forced attention without ignoring it", () => {
    const reduced = reducedAttention(3_000, 700);
    assert.equal(reduced, 900);
    assert.ok(reduced > 0, "bosses reduce, they do not blanket-immune");
  });
});

describe("prediction contract", () => {
  it("namespaces predicted ids so they cannot be mistaken for authoritative ones", () => {
    const predicted = predictedActionId(7, 3);
    assert.ok(isPredictedActionId(predicted));
    assert.ok(!isPredictedActionId("7:3"));
  });

  it("buffers input arriving just before recovery ends", () => {
    assert.equal(shouldBufferInput(1_000, 1_100), true);
    assert.equal(shouldBufferInput(1_000, 1_900), false, "too early to be a rhythm");
    assert.equal(shouldBufferInput(1_000, 900), false, "already ready");
  });
});
