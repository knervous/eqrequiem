import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLASS_IDS, type CombatAbilityDefinition } from "./ability-types.js";
import {
  CombatantRuntime,
  OUT_OF_COMBAT_REGEN,
  pool,
  type ActivationContext,
} from "./combat-runtime.js";
import { ABILITIES, abilityById, startingAbilities, validateAbilities } from "./abilities/index.js";
import { armorMitigation, levelDifferenceMultiplier, resistMultiplier } from "./formulas.js";

function runtime(): CombatantRuntime {
  return new CombatantRuntime(1, {
    health: pool(200),
    mana: pool(100),
    vigor: pool(100),
  });
}

function context(overrides: Partial<ActivationContext> = {}): ActivationContext {
  const learned = new Set(ABILITIES.map((ability) => ability.id));
  return {
    nowMs: 0,
    level: 10,
    classId: CLASS_IDS.warrior,
    learned,
    prepared: learned,
    resources: { health: pool(200), mana: pool(100), vigor: pool(100) },
    hasTarget: true,
    targetSeparation: { horizontalMetres: 2, verticalMetres: 0 },
    ...overrides,
  };
}

const kick = abilityById("warrior.kick")!;
const taunt = abilityById("warrior.taunt")!;

describe("ability activation", () => {
  it("commits resource, cooldown and recovery together", () => {
    const actor = runtime();
    const result = actor.activate(kick, { ...context(), resources: actor.resources });
    assert.ok(result.ok);
    assert.equal(result.committedResource?.type, "vigor");
    assert.equal(actor.resources.vigor.current, 100 - kick.resource!.amount);
    assert.equal(result.cooldownEndsAtMs, kick.cooldownMs);
    assert.equal(result.recoveryEndsAtMs, kick.recoveryMs);
  });

  it("gives every action instance a stable, distinct id", () => {
    const actor = runtime();
    const first = actor.activate(kick, { ...context(), resources: actor.resources });
    const second = actor.activate(taunt, {
      ...context({ nowMs: 1_000 }),
      resources: actor.resources,
    });
    assert.ok(first.ok && second.ok);
    assert.notEqual(first.actionId, second.actionId);
  });

  it("refuses a second action during recovery, and says when it will be ready", () => {
    const actor = runtime();
    actor.activate(kick, { ...context(), resources: actor.resources });
    const during = actor.activate(taunt, {
      ...context({ nowMs: kick.recoveryMs - 1 }),
      resources: actor.resources,
    });
    assert.equal(during.ok, false);
    assert.equal(during.ok === false && during.reason, "recovering");
    assert.equal(during.ok === false && during.readyAtMs, kick.recoveryMs);

    const after = actor.activate(taunt, {
      ...context({ nowMs: kick.recoveryMs }),
      resources: actor.resources,
    });
    assert.ok(after.ok);
  });

  it("lets a reaction fire during recovery, because that is what makes it a reaction", () => {
    const { resource: _cost, ...unpaid } = kick;
    const reaction: CombatAbilityDefinition = {
      ...unpaid,
      id: "warrior.riposte",
      name: "Riposte",
      tags: ["reaction"],
      cooldownMs: 0,
    };
    const actor = runtime();
    actor.activate(kick, { ...context(), resources: actor.resources });
    const learned = new Set([...ABILITIES.map((a) => a.id), reaction.id]);
    const result = actor.activate(reaction, {
      ...context({ nowMs: 10, learned, prepared: learned }),
      resources: actor.resources,
    });
    assert.ok(result.ok, "a reaction must not be blocked by ordinary recovery");
    // And it must not extend the actor's recovery either.
    assert.equal(actor.recoveryEndsAtMs, kick.recoveryMs);
  });

  it("keeps its own cooldown and refuses until it expires", () => {
    const actor = runtime();
    actor.activate(kick, { ...context(), resources: actor.resources });
    const early = actor.activate(kick, {
      ...context({ nowMs: kick.cooldownMs - 1 }),
      resources: actor.resources,
    });
    assert.equal(early.ok === false && early.reason, "on_cooldown");
    const ready = actor.activate(kick, {
      ...context({ nowMs: kick.cooldownMs }),
      resources: actor.resources,
    });
    assert.ok(ready.ok);
  });

  it("does not pay for an action it refuses", () => {
    const actor = runtime();
    actor.resources.vigor.current = 1;
    const result = actor.activate(kick, { ...context(), resources: actor.resources });
    assert.equal(result.ok === false && result.reason, "insufficient_resource");
    assert.equal(actor.resources.vigor.current, 1, "a refused action must cost nothing");
    assert.equal(actor.cooldownEndsAtMs(kick.id), 0);
  });

  it("refuses techniques the character has not learned or prepared", () => {
    const actor = runtime();
    const empty = new Set<string>();
    const unlearned = actor.activate(kick, {
      ...context({ learned: empty, prepared: empty }),
    });
    assert.equal(unlearned.ok === false && unlearned.reason, "not_learned");
    const known = new Set([kick.id]);
    const unprepared = actor.activate(kick, {
      ...context({ learned: known, prepared: new Set() }),
    });
    assert.equal(unprepared.ok === false && unprepared.reason, "not_prepared");
  });

  it("reports the most useful refusal first", () => {
    const actor = runtime();
    // Dead and out of range and broke: being unable to act at all is what matters.
    const result = actor.activate(kick, {
      ...context({
        incapacitated: true,
        hasTarget: false,
        targetSeparation: { horizontalMetres: 999, verticalMetres: 0 },
      }),
    });
    assert.equal(result.ok === false && result.reason, "actor_incapacitated");
  });

  it("shares a cooldown category across major powers", () => {
    const actor = runtime();
    const discipline = abilityById("warrior.defensive_discipline")!;
    const other: CombatAbilityDefinition = {
      ...discipline,
      id: "warrior.last_stand",
      name: "Last Stand",
      cooldownMs: 60_000,
    };
    const learned = new Set([...ABILITIES.map((a) => a.id), other.id]);
    assert.ok(actor.activate(discipline, {
      ...context({ learned, prepared: learned }),
      resources: actor.resources,
    }).ok);
    const blocked = actor.activate(other, {
      ...context({ nowMs: 1_000, learned, prepared: learned }),
      resources: actor.resources,
    });
    assert.equal(blocked.ok === false && blocked.reason, "on_cooldown");
  });

  it("spends charges and refuses at zero", () => {
    const actor = runtime();
    const { resource: _trapCost, ...free } = kick;
    const trap: CombatAbilityDefinition = {
      ...free, id: "ranger.trap", name: "Field Trap", charges: 2, cooldownMs: 0,
    };
    const learned = new Set([trap.id]);
    const ctx = (nowMs: number): ActivationContext =>
      ({ ...context({ nowMs, learned, prepared: learned }), resources: actor.resources });
    assert.ok(actor.activate(trap, ctx(0)).ok);
    assert.ok(actor.activate(trap, ctx(1_000)).ok);
    const empty = actor.activate(trap, ctx(2_000));
    assert.equal(empty.ok === false && empty.reason, "no_charges");
    actor.grantCharge(trap);
    assert.ok(actor.activate(trap, ctx(3_000)).ok);
  });

  it("refuses an out-of-range target", () => {
    const actor = runtime();
    const result = actor.activate(kick, { ...context({ targetSeparation: { horizontalMetres: 40, verticalMetres: 0 } }) });
    assert.equal(result.ok === false && result.reason, "out_of_range");
  });
});

describe("out-of-combat recovery", () => {
  it("returns Vigor much faster than Mana", () => {
    const actor = runtime();
    actor.resources.vigor.current = 0;
    actor.resources.mana.current = 0;
    actor.regenerate(10_000, OUT_OF_COMBAT_REGEN);
    assert.ok(
      actor.resources.vigor.current > actor.resources.mana.current * 3,
      "a martial class should be ready to pull again long before a caster is",
    );
    assert.ok(actor.resources.vigor.current <= actor.resources.vigor.maximum);
  });
});

describe("combat formulas", () => {
  it("gives armor diminishing returns that weaken as the attacker levels", () => {
    const low = armorMitigation(300, 5);
    const high = armorMitigation(300, 40);
    assert.ok(low > high, "the same armor must matter less against a stronger attacker");
    assert.ok(low < 1 && high > 0);
  });

  it("makes a resisted spell partial rather than wasted", () => {
    const partial = resistMultiplier(150, 0);
    assert.ok(partial > 0 && partial < 1, "a resist should reduce, not erase");
    assert.equal(resistMultiplier(0, 0), 1);
    assert.ok(resistMultiplier(150, 150) === 1, "penetration cancels resist");
  });

  it("makes a red-con enemy frightening and a grey one trivial", () => {
    assert.ok(levelDifferenceMultiplier(6) > 1.2);
    assert.ok(levelDifferenceMultiplier(-8) < 0.5);
  });
});

describe("authored abilities", () => {
  it("passes its own static checks", () => {
    validateAbilities();
    assert.ok(ABILITIES.length > 0);
  });

  it("gives the Warrior a working level-1 identity with no trainer visit", () => {
    const starting = startingAbilities(CLASS_IDS.warrior).map((ability) => ability.id);
    assert.deepEqual(starting.sort(), ["warrior.kick", "warrior.taunt"]);
  });

  it("never uses a global cooldown", () => {
    // Recovery is the only pacing knob; a uniform recovery across every ability would
    // be a GCD wearing a different name.
    const recoveries = new Set(ABILITIES.map((ability) => ability.recoveryMs));
    assert.ok(recoveries.size > 1, "every action recovering identically is a GCD");
  });

  it("never puts a calendar cooldown on a combat ability", () => {
    const oneDayMs = 24 * 60 * 60 * 1000;
    for (const ability of ABILITIES) {
      assert.ok(ability.cooldownMs < oneDayMs, `${ability.id} has a calendar cooldown`);
    }
  });
});
