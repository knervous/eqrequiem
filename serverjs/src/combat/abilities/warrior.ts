import { CLASS_IDS, type CombatAbilityDefinition, type StatusDefinition } from "../ability-types.js";
import { formula } from "../formulas.js";

/**
 * The Warrior's level 1–25 kit.
 *
 * The identity to preserve is threat, mitigation and weapons — a Warrior holds things
 * because enemies want to hit them, not because a mechanic staples aggro on. Levels 1–10
 * are the design's demo table; 11–25 deepen the same three verbs rather than introducing
 * a fourth. The Warrior never gains a heal that competes with a Cleric, and never gains
 * burst that competes with a Wizard: what it gains is more ways to decide *who is being
 * hit*, which is the only question a tank is really answering.
 *
 * Blank levels are deliberate. A ding that produces an Aspect point, a higher skill cap
 * and nothing on the bar is a fine ding.
 */

const WARRIOR = [CLASS_IDS.warrior] as const;

export const WARRIOR_ABILITIES: readonly CombatAbilityDefinition[] = [
  {
    id: "warrior.taunt",
    name: "Taunt",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 1,
    acquisition: { source: "starting" },
    resource: { type: "vigor", amount: 4 },
    cooldownMs: 6_000,
    recoveryMs: 250,
    target: { kind: "hostile_target", rangeMetres: 5 },
    // Position relative to the current threat leader, then a brief forced look. Not a
    // large threat number: a number can be out-damaged by accident, a position cannot.
    effects: [{ type: "taunt", forceSeconds: 3 }],
  },
  {
    id: "warrior.kick",
    name: "Kick",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 1,
    acquisition: { source: "starting" },
    resource: { type: "vigor", amount: 6 },
    cooldownMs: 5_000,
    recoveryMs: 300,
    target: { kind: "hostile_target", rangeMetres: 4 },
    effects: [
      { type: "damage", amount: formula("martial.weapon_strike", 0.6) },
      { type: "interrupt" },
    ],
    threat: formula("threat.standard", 1.2),
  },
  {
    id: "warrior.brace",
    name: "Brace",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 2,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 8 },
    cooldownMs: 20_000,
    recoveryMs: 250,
    target: { kind: "self" },
    effects: [{ type: "apply_status", statusId: "warrior.braced" }],
  },
  {
    id: "warrior.shield_bash",
    name: "Shield Bash",
    classIds: WARRIOR,
    kind: "martial",
    tags: ["requires_shield"],
    minLevel: 3,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 8 },
    cooldownMs: 12_000,
    recoveryMs: 400,
    target: { kind: "hostile_target", rangeMetres: 4 },
    requirements: [{ kind: "has_shield" }],
    effects: [
      { type: "damage", amount: formula("martial.weapon_strike", 0.5) },
      { type: "interrupt" },
      { type: "apply_status", statusId: "common.staggered" },
    ],
    threat: formula("threat.standard", 1.5),
  },
  {
    id: "warrior.intercept",
    name: "Intercept",
    classIds: WARRIOR,
    kind: "martial",
    tags: ["movement"],
    minLevel: 5,
    // Learned from a guard captain rather than bought at a level-up counter.
    acquisition: { source: "class_quest", requiresKnowledge: ["talios.watch_trust"] },
    resource: { type: "vigor", amount: 10 },
    cooldownMs: 25_000,
    recoveryMs: 300,
    target: { kind: "friendly_target", rangeMetres: 20 },
    effects: [
      { type: "move_self", metres: 20 },
      { type: "apply_status", statusId: "warrior.interceding" },
    ],
  },
  {
    id: "warrior.disarm",
    name: "Disarm",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 7,
    acquisition: { source: "trainer" },
    // Cheap on purpose: Disarm is a timing tool, so the 30s cooldown is the constraint.
    // Charging heavily for it as well would tax the same decision twice.
    resource: { type: "vigor", amount: 6 },
    cooldownMs: 30_000,
    recoveryMs: 400,
    target: { kind: "hostile_target", rangeMetres: 4 },
    effects: [{ type: "apply_status", statusId: "warrior.disarmed" }],
    threat: formula("threat.standard", 1.1),
  },
  {
    id: "warrior.defensive_discipline",
    name: "Defensive Discipline",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 10,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 15 },
    cooldownMs: 180_000,
    // Shared so major defensives cannot be chained into permanent immunity.
    sharedCooldown: "major_defensive",
    recoveryMs: 250,
    target: { kind: "self" },
    effects: [{ type: "apply_status", statusId: "warrior.defensive_discipline" }],
  },

  // ---------------------------------------------------------------------------
  // 11–25. Same three verbs, more answers.
  // ---------------------------------------------------------------------------

  {
    id: "warrior.bulwark_stance",
    name: "Bulwark Stance",
    classIds: WARRIOR,
    kind: "martial",
    tags: ["stance"],
    minLevel: 12,
    acquisition: { source: "trainer" },
    // A stance is a standing decision, not a cooldown to weave. It costs almost nothing
    // to enter and holds until the Warrior chooses otherwise.
    resource: { type: "vigor", amount: 5 },
    cooldownMs: 3_000,
    recoveryMs: 250,
    target: { kind: "self" },
    effects: [{ type: "apply_status", statusId: "warrior.bulwark_stance" }],
  },
  {
    id: "warrior.shield_throw",
    name: "Shield Throw",
    classIds: WARRIOR,
    kind: "martial",
    tags: ["requires_shield"],
    minLevel: 14,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 9 },
    cooldownMs: 18_000,
    recoveryMs: 400,
    // The Warrior's only reach. Pulling is a skill the design protects, and a tank with
    // no ranged opener has to body-pull every camp, which flattens the choice.
    target: { kind: "hostile_target", rangeMetres: 30 },
    requirements: [{ kind: "has_shield" }],
    effects: [
      {
        type: "spawn_projectile",
        speedMetresPerSecond: 40,
        onHit: [
          { type: "damage", amount: formula("martial.weapon_strike", 0.45) },
          { type: "interrupt" },
        ],
      },
    ],
    threat: formula("threat.standard", 2),
  },
  {
    id: "warrior.sunder",
    name: "Sunder",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 16,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 9 },
    cooldownMs: 15_000,
    recoveryMs: 500,
    target: { kind: "hostile_target", rangeMetres: 4 },
    effects: [
      { type: "damage", amount: formula("martial.weapon_strike", 0.7) },
      { type: "apply_status", statusId: "common.sundered" },
    ],
    threat: formula("threat.standard", 1.4),
  },
  {
    id: "warrior.second_wind",
    name: "Second Wind",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 18,
    acquisition: { source: "trainer" },
    cooldownMs: 120_000,
    recoveryMs: 400,
    target: { kind: "self" },
    // Not a heal that competes with a Cleric: it is one breath at the wrong moment,
    // priced in a long cooldown rather than a resource a Warrior barely spends.
    effects: [
      { type: "heal", amount: formula("spell.heal", 1.6) },
      { type: "restore_resource", resource: "vigor", amount: formula("resource.restore", 2) },
    ],
  },
  {
    id: "warrior.rampart",
    name: "Rampart",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 20,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 18 },
    cooldownMs: 150_000,
    sharedCooldown: "major_defensive",
    recoveryMs: 300,
    target: { kind: "radius_self" },
    // Protecting other people is the Warrior's, and this is the first time it reaches
    // the whole group rather than one intercepted ally.
    effects: [{ type: "apply_status", statusId: "warrior.rampart" }],
  },
  {
    id: "warrior.cleave",
    name: "Cleave",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 22,
    acquisition: { source: "trainer" },
    resource: { type: "vigor", amount: 12 },
    cooldownMs: 14_000,
    recoveryMs: 600,
    target: { kind: "cone", rangeMetres: 6, widthMetres: 5, maxTargets: 4 },
    effects: [{ type: "damage", amount: formula("martial.weapon_strike", 0.55) }],
    // Multi-target threat is what makes holding three enemies a decision rather than a
    // taunt-rotation chore.
    threat: formula("threat.standard", 1.6),
  },
  {
    id: "warrior.last_stand",
    name: "Last Stand",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 25,
    acquisition: { source: "class_quest", requiresKnowledge: ["talios.warden_oath"] },
    resource: { type: "vigor", amount: 25 },
    cooldownMs: 600_000,
    sharedCooldown: "major_defensive",
    recoveryMs: 300,
    target: { kind: "self" },
    // The capstone is not more damage. It is the promise that the group's worst thirty
    // seconds are survivable if the Warrior spends their best minute on it.
    effects: [
      { type: "apply_status", statusId: "warrior.last_stand" },
      { type: "heal", amount: formula("spell.heal", 2.2) },
    ],
    threat: formula("threat.standard", 3),
  },

  // ---------------------------------------------------------------------------
  // Aspect unlocks. Known only by spending the node that grants them.
  // ---------------------------------------------------------------------------

  {
    id: "warrior.hold_the_line",
    name: "Hold the Line",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 1,
    acquisition: { source: "aspect" },
    resource: { type: "vigor", amount: 9 },
    cooldownMs: 45_000,
    recoveryMs: 300,
    target: { kind: "self" },
    effects: [{ type: "apply_status", statusId: "warrior.holding_the_line" }],
  },
  {
    id: "warrior.challenge",
    name: "Challenge",
    classIds: WARRIOR,
    kind: "martial",
    minLevel: 1,
    acquisition: { source: "aspect" },
    resource: { type: "vigor", amount: 9 },
    cooldownMs: 30_000,
    recoveryMs: 300,
    target: { kind: "radius_self", rangeMetres: 8, maxTargets: 6 },
    effects: [{ type: "taunt", forceSeconds: 2 }],
    threat: formula("threat.standard", 2.5),
  },
];

/** Statuses the Warrior kit applies. Durations are authored, never derived. */
export const WARRIOR_STATUSES: readonly StatusDefinition[] = [
  {
    id: "warrior.braced",
    name: "Braced",
    durationMs: 6_000,
    stacking: "refresh",
  },
  {
    id: "warrior.interceding",
    name: "Interceding",
    durationMs: 8_000,
    stacking: "refresh",
  },
  {
    id: "warrior.disarmed",
    name: "Disarmed",
    durationMs: 12_000,
    stacking: "replace_weaker",
  },
  {
    id: "warrior.defensive_discipline",
    name: "Defensive Discipline",
    durationMs: 12_000,
    stacking: "refresh",
  },
  {
    // Stances hold until changed. Ten minutes is "until changed" in practice while still
    // expiring on its own, so a disconnected character does not keep a stance forever.
    id: "warrior.bulwark_stance",
    name: "Bulwark Stance",
    durationMs: 600_000,
    stacking: "unique",
  },
  {
    id: "warrior.rampart",
    name: "Rampart",
    durationMs: 15_000,
    stacking: "refresh",
  },
  {
    id: "warrior.last_stand",
    name: "Last Stand",
    durationMs: 20_000,
    stacking: "unique",
  },
  {
    id: "warrior.holding_the_line",
    name: "Holding the Line",
    durationMs: 8_000,
    stacking: "refresh",
  },
];
