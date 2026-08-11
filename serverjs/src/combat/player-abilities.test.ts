import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { abilityById } from "./abilities/index.js";
import { DEFAULT_MELEE_COMBAT_RULES } from "./melee-combat.js";
import { PlayerAbilitySystem, type AbilityWorldPort } from "./player-abilities.js";

/**
 * The gap this covers: every part of the substrate was unit-tested and none of it was
 * reachable. `CombatantRuntime` was imported by nothing but its own test, so a Warrior
 * could be granted Kick at creation and never use it. These tests exercise the seam —
 * gate, cost, effect — rather than the gate alone.
 */

const ACTOR_ID = 10;
const TARGET_ID = 20;

interface Recorded {
  damage: { targetId: number; amount: number }[];
  heals: { targetId: number; amount: number }[];
  statuses: { targetId: number; statusId: string; durationMultiplier: number }[];
  removed: { targetId: number; statusId: string | undefined; count: number }[];
  interrupts: number[];
  taunts: { targetId: number; seconds: number }[];
  threat: { targetId: number; amount: number }[];
  resources: { resource: string; amount: number; restored: boolean }[];
  moves: { mode: string; metres: number }[];
  projectiles: number[];
  areas: { radiusMetres: number; durationMs: number }[];
  scripts: string[];
}

function port(overrides: Partial<AbilityWorldPort> = {}): {
  port: AbilityWorldPort;
  recorded: Recorded;
} {
  const recorded: Recorded = {
    damage: [], heals: [], statuses: [], removed: [], interrupts: [], taunts: [],
    threat: [], resources: [], moves: [], projectiles: [], areas: [], scripts: [],
  };
  const base: AbilityWorldPort = {
    distanceMetres: () => 2,
    separationTo: () => ({ horizontalMetres: 2, verticalMetres: 0 }),
    targetExists: () => true,
    targetIsHostile: () => true,
    targetArmor: () => 10,
    targetLevel: () => 1,
    targetIsUndead: () => false,
    targetHealthFraction: () => 1,
    hasStatus: () => false,
    applyDamage: (_actorId, targetId, amount) => {
      recorded.damage.push({ targetId, amount });
      return {
        damage: amount,
        targetCurrentHp: Math.max(0, 30 - amount),
        targetMaximumHp: 30,
        killed: amount >= 30,
      };
    },
    applyHeal: (_actorId, targetId, amount) => {
      recorded.heals.push({ targetId, amount });
      return { healed: amount, targetCurrentHp: 30, targetMaximumHp: 30 };
    },
    applyStatus: (targetId, statusId, durationMultiplier = 1) =>
      recorded.statuses.push({ targetId, statusId, durationMultiplier }),
    removeStatus: (targetId, statusId, count) => {
      recorded.removed.push({ targetId, statusId, count });
      return statusId ? [statusId] : [];
    },
    interrupt: (targetId) => {
      recorded.interrupts.push(targetId);
      return true;
    },
    forceAttention: (_actorId, targetId, seconds) =>
      recorded.taunts.push({ targetId, seconds }),
    addThreat: (_actorId, targetId, amount) => recorded.threat.push({ targetId, amount }),
    restoreResource: (_entityId, resource, amount) => {
      recorded.resources.push({ resource, amount, restored: true });
      return amount;
    },
    consumeResource: (_entityId, resource, amount) => {
      recorded.resources.push({ resource, amount, restored: false });
      return amount;
    },
    moveToward: (_actorId, _targetId, metres) => {
      recorded.moves.push({ mode: "self", metres });
      return metres;
    },
    displace: (_actorId, _targetId, metres) => {
      recorded.moves.push({ mode: "target", metres });
      return metres;
    },
    teleport: (_actorId, metres) => {
      recorded.moves.push({ mode: "teleport", metres });
      return metres;
    },
    entitiesWithin: (_actorId, centreEntityId) => [centreEntityId],
    scheduleProjectile: (_actorId, _targetId, speed, onLand) => {
      recorded.projectiles.push(speed);
      onLand();
      return 100;
    },
    spawnArea: (_actorId, centreEntityId, radiusMetres, durationMs, _filter, onTick) => {
      recorded.areas.push({ radiusMetres, durationMs });
      onTick(centreEntityId);
    },
    openReaction: () => {},
    revive: () => true,
    runScript: (handler) => {
      recorded.scripts.push(handler);
      return true;
    },
  };
  return { port: { ...base, ...overrides }, recorded };
}

function actor(overrides: Partial<Parameters<PlayerAbilitySystem["activate"]>[0]> = {}) {
  return {
    entityId: ACTOR_ID,
    level: 5,
    classId: 1,
    learned: new Set(["warrior.kick", "warrior.taunt", "warrior.brace"]),
    prepared: new Set(["warrior.kick", "warrior.taunt", "warrior.brace"]),
    strength: 90,
    stamina: 80,
    agility: 75,
    dexterity: 75,
    weaponDamage: 6,
    skill: 50,
    hasShield: false,
    hasBow: false,
    incapacitated: false,
    ...overrides,
  };
}

function system(): PlayerAbilitySystem {
  const abilities = new PlayerAbilitySystem();
  abilities.register(ACTOR_ID, 5, 80);
  return abilities;
}

describe("player ability system", () => {
  it("turns a prepared technique into damage, an interrupt and threat", () => {
    const abilities = system();
    const { port: world, recorded } = port();

    const result = abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world);

    assert.ok(result.ok, "a prepared, off-cooldown Kick must be accepted");
    assert.equal(recorded.damage.length, 1, "Kick must deal damage");
    assert.ok(recorded.damage[0]!.amount > 0);
    assert.deepEqual(recorded.interrupts, [TARGET_ID], "Kick interrupts");
    assert.equal(recorded.threat.length, 1, "Kick carries authored threat");
    assert.ok(result.effects.some((effect) => effect.kind === "damage"));
  });

  it("charges vigor and refuses when there is not enough", () => {
    const abilities = system();
    const { port: world } = port();
    const runtime = abilities.runtimeFor(ACTOR_ID)!;
    runtime.resources.vigor.current = 5;

    const result = abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "insufficient_resource");
    assert.equal(runtime.resources.vigor.current, 5, "a refusal must not charge");
  });

  it("refuses a technique the character has not put on the bar", () => {
    const abilities = system();
    const { port: world, recorded } = port();

    const result = abilities.activate(
      actor({ prepared: new Set(["warrior.taunt"]) }),
      "warrior.kick",
      TARGET_ID,
      0,
      world,
    );
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "not_prepared");
    assert.equal(recorded.damage.length, 0, "a refused ability must not land");
  });

  it("holds the cooldown it started", () => {
    const abilities = system();
    const { port: world } = port();
    const kick = abilityById("warrior.kick")!;

    assert.ok(abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world).ok);
    const early = abilities.activate(
      actor(), "warrior.kick", TARGET_ID, kick.cooldownMs - 1, world,
    );
    assert.equal(early.ok, false);
    assert.equal((early as { reason: string }).reason, "on_cooldown");

    const later = abilities.activate(
      actor(), "warrior.kick", TARGET_ID, kick.cooldownMs, world,
    );
    assert.equal(later.ok, true, "the ability must return exactly when it says it will");
  });

  it("refuses a target out of the ability's range", () => {
    const abilities = system();
    const { port: world } = port({
      separationTo: () => ({ horizontalMetres: 40, verticalMetres: 0 }),
    });
    const result = abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "out_of_range");
  });

  /**
   * The bug this pins: a melee ability must never refuse at a gap auto-attack is
   * swinging through. Auto-attack reaches `meleeRange` (3) plus the body pad (3), so
   * anything inside 6 metres is a range at which the player is watching their swings
   * land — and being told their target is too far away for a Kick.
   */
  it("accepts every gap auto-attack can swing through", () => {
    const meleeReach =
      3 + DEFAULT_MELEE_COMBAT_RULES.meleeRangePadding;
    for (const horizontalMetres of [0, 2, 4, meleeReach]) {
      // A fresh system per gap: reusing one would refuse the second Kick on its own
      // cooldown and quietly report that as a range failure.
      const abilities = system();
      const { port: world } = port({
        separationTo: () => ({ horizontalMetres, verticalMetres: 0 }),
      });
      const result = abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world);
      assert.equal(
        result.ok,
        true,
        `Kick refused at ${horizontalMetres}m, where auto-attack connects`,
      );
    }
  });

  /**
   * A character's authoritative position is its capsule centre and a spawned NPC's is
   * nearer its feet, so a standing height difference is normal and must not be charged
   * against a melee range. Folding it into a 3D distance is what broke this.
   */
  it("tolerates the standing height difference between a player and an NPC", () => {
    const abilities = system();
    const { port: world } = port({
      separationTo: () => ({ horizontalMetres: 4, verticalMetres: 4 }),
    });
    const result = abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world);
    assert.equal(result.ok, true, "height difference must be tolerated, not spent");
  });

  it("still refuses a target on a ledge far above the actor", () => {
    const abilities = system();
    const { port: world } = port({
      separationTo: () => ({ horizontalMetres: 1, verticalMetres: 40 }),
    });
    const result = abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "out_of_range");
  });

  it("applies a self-targeted status to the actor, not the target", () => {
    const abilities = system();
    const { port: world, recorded } = port();

    const result = abilities.activate(actor(), "warrior.brace", TARGET_ID, 0, world);
    assert.ok(result.ok);
    assert.deepEqual(
      recorded.statuses.map(({ targetId, statusId }) => ({ targetId, statusId })),
      [{ targetId: ACTOR_ID, statusId: "warrior.braced" }],
      "Brace protects the Warrior, not whatever they were looking at",
    );
    assert.equal(recorded.threat.length, 0, "a self buff must not touch the hate table");
  });

  it("moves the hate table on a Taunt that deals no damage", () => {
    const abilities = system();
    const { port: world, recorded } = port();

    const result = abilities.activate(actor(), "warrior.taunt", TARGET_ID, 0, world);
    assert.ok(result.ok);
    assert.deepEqual(recorded.taunts, [{ targetId: TARGET_ID, seconds: 3 }]);
    assert.equal(recorded.damage.length, 0);
  });

  it("refuses an ability whose requirement is unmet", () => {
    const abilities = system();
    const { port: world } = port();
    const result = abilities.activate(
      actor({
        level: 5,
        learned: new Set(["warrior.shield_bash"]),
        prepared: new Set(["warrior.shield_bash"]),
        hasShield: false,
      }),
      "warrior.shield_bash",
      TARGET_ID,
      0,
      world,
    );
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "requirement_unmet");
  });

  it("refuses an unknown ability id rather than throwing", () => {
    const abilities = system();
    const { port: world } = port();
    const result = abilities.activate(actor(), "warrior.nonexistent", TARGET_ID, 0, world);
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "unknown_ability");
  });
});

/**
 * Every primitive used to fall through a `default:` that silently did nothing, so an
 * Intercept charged its cost and moved nobody. These cover the ones that were missing.
 */
describe("effect primitives", () => {
  const learn = (...ids: string[]) => ({
    learned: new Set(ids),
    prepared: new Set(ids),
  });

  it("heals through the port and reports what landed", () => {
    const abilities = new PlayerAbilitySystem();
    abilities.register(ACTOR_ID, 20, 80);
    const { port: world, recorded } = port();

    const result = abilities.activate(
      actor({ level: 20, classId: 2, ...learn("cleric.mend") }),
      "cleric.mend",
      TARGET_ID,
      0,
      world,
    );

    assert.ok(result.ok);
    assert.equal(recorded.heals.length, 1);
    assert.ok(recorded.heals[0]!.amount > 0);
    assert.ok(result.effects.some((effect) => effect.kind === "heal"));
  });

  it("moves the actor for a gap closer", () => {
    const abilities = new PlayerAbilitySystem();
    abilities.register(ACTOR_ID, 12, 80);
    const { port: world, recorded } = port();

    const result = abilities.activate(
      actor({ level: 12, classId: 7, ...learn("monk.flying_kick") }),
      "monk.flying_kick",
      TARGET_ID,
      0,
      world,
    );

    assert.ok(result.ok);
    assert.deepEqual(recorded.moves, [{ mode: "self", metres: 12 }]);
    assert.equal(recorded.damage.length, 1, "the kick still lands after the leap");
  });

  it("flies a projectile and applies its payload on arrival", () => {
    const abilities = new PlayerAbilitySystem();
    abilities.register(ACTOR_ID, 5, 80);
    const { port: world, recorded } = port();

    const result = abilities.activate(
      actor({ level: 5, classId: 12, ...learn("wizard.arc_bolt") }),
      "wizard.arc_bolt",
      TARGET_ID,
      0,
      world,
    );

    assert.ok(result.ok);
    assert.deepEqual(recorded.projectiles, [45]);
    assert.equal(recorded.damage.length, 1, "the bolt's damage lands when it arrives");
  });

  it("restores a resource and strips statuses", () => {
    const abilities = new PlayerAbilitySystem();
    abilities.register(ACTOR_ID, 20, 80);
    const { port: world, recorded } = port();

    const result = abilities.activate(
      actor({ level: 20, classId: 7, ...learn("monk.iron_fast") }),
      "monk.iron_fast",
      ACTOR_ID,
      0,
      world,
    );

    assert.ok(result.ok);
    assert.deepEqual(recorded.removed, [{ targetId: ACTOR_ID, statusId: undefined, count: 2 }]);
    assert.equal(recorded.resources.at(-1)?.resource, "vigor");
    assert.ok(recorded.heals.length === 1);
  });

  it("runs an authored script handler", () => {
    const abilities = new PlayerAbilitySystem();
    abilities.register(ACTOR_ID, 3, 80);
    const { port: world, recorded } = port();

    const result = abilities.activate(
      actor({ level: 3, classId: 7, ...learn("monk.feign_death") }),
      "monk.feign_death",
      ACTOR_ID,
      0,
      world,
    );

    assert.ok(result.ok);
    assert.deepEqual(recorded.scripts, ["monk.feign_death"]);
  });

  it("answers a status requirement instead of assuming it holds", () => {
    const abilities = new PlayerAbilitySystem();
    abilities.register(ACTOR_ID, 20, 80);
    const { port: cold } = port({ hasStatus: () => false });

    const refused = abilities.activate(
      actor({ level: 20, classId: 12, ...learn("wizard.shatterfrost") }),
      "wizard.shatterfrost",
      TARGET_ID,
      0,
      cold,
    );
    assert.equal(refused.ok, false, "Shatterfrost needs a chilled target");
    assert.equal((refused as { reason: string }).reason, "requirement_unmet");

    const { port: chilled, recorded } = port({ hasStatus: () => true });
    const landed = abilities.activate(
      actor({ level: 20, classId: 12, ...learn("wizard.shatterfrost") }),
      "wizard.shatterfrost",
      TARGET_ID,
      0,
      chilled,
    );
    assert.ok(landed.ok);
    assert.equal(recorded.damage.length, 1);
  });
});

describe("aspect modifiers reach combat", () => {
  it("shortens the cooldown of the ability a node names", () => {
    const plain = new PlayerAbilitySystem();
    plain.register(ACTOR_ID, 5, 80);
    const hastened = new PlayerAbilitySystem();
    // Battle Rhythm: Kick's cooldown multiplied by 0.8.
    hastened.register(ACTOR_ID, 5, 80, new Map([["warrior.vanguard.battle_rhythm", 1]]));

    const { port: world } = port();
    const kick = abilityById("warrior.kick")!;
    const earlier = Math.round(kick.cooldownMs * 0.8);

    assert.ok(plain.activate(actor(), "warrior.kick", TARGET_ID, 0, world).ok);
    assert.equal(
      plain.activate(actor(), "warrior.kick", TARGET_ID, earlier, world).ok,
      false,
      "without the node Kick is still cooling down",
    );

    assert.ok(hastened.activate(actor(), "warrior.kick", TARGET_ID, 0, world).ok);
    assert.ok(
      hastened.activate(actor(), "warrior.kick", TARGET_ID, earlier, world).ok,
      "Battle Rhythm has to actually shorten the cooldown",
    );
  });

  it("staples an extra effect onto the ability a node modifies", () => {
    const abilities = new PlayerAbilitySystem();
    // Driving Blow: Kick also snares.
    abilities.register(ACTOR_ID, 5, 80, new Map([["warrior.vanguard.driving_blow", 1]]));
    const { port: world, recorded } = port();

    assert.ok(abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world).ok);
    assert.ok(
      recorded.statuses.some((status) => status.statusId === "common.snared"),
      "Driving Blow's snare must land with the Kick",
    );
  });

  it("raises the resource ceiling a passive node grants", () => {
    const plain = new PlayerAbilitySystem();
    plain.register(ACTOR_ID, 10, 80);
    const deep = new PlayerAbilitySystem();
    deep.register(ACTOR_ID, 10, 80, new Map([["warrior.bulwark.deep_reserves", 1]]));

    assert.equal(
      deep.runtimeFor(ACTOR_ID)!.resources.vigor.maximum
        - plain.runtimeFor(ACTOR_ID)!.resources.vigor.maximum,
      30,
    );
  });

  it("lets a reaction window forgive the cooldown once", () => {
    const abilities = new PlayerAbilitySystem();
    // Riposte: a parry grants Kick.
    abilities.register(ACTOR_ID, 5, 80, new Map([["warrior.bulwark.riposte", 1]]));
    const { port: world } = port();

    assert.ok(abilities.activate(actor(), "warrior.kick", TARGET_ID, 0, world).ok);
    assert.equal(
      abilities.activate(actor(), "warrior.kick", TARGET_ID, 100, world).ok,
      false,
      "without a parry the cooldown holds",
    );

    assert.deepEqual(abilities.openReactionWindows(ACTOR_ID, "parry", 100), ["warrior.kick"]);
    assert.ok(
      abilities.activate(actor(), "warrior.kick", TARGET_ID, 150, world).ok,
      "the parry has to open the riposte",
    );
    assert.equal(
      abilities.activate(actor(), "warrior.kick", TARGET_ID, 200, world).ok,
      false,
      "and the window closes after one use",
    );
  });
});
