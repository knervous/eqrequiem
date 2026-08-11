import { CLASS_IDS, type CombatAbilityDefinition, type StatusDefinition } from "../ability-types.js";
import { formula } from "../formulas.js";

/**
 * The Wizard's level 1–25 kit.
 *
 * Highest burst, most fragile, roots and positioning instead of durability. The 11–25
 * band is where the elemental schools stop being three colours of the same nuke and
 * start interacting: Frost Snap sets up, burns accumulate, Combust spends them. That
 * interaction is the Wizard's skill ceiling, and it is why the kit needs no ranks.
 *
 * Mana is the whole constraint. Nothing here is cheap, and the capstone deliberately
 * costs enough that a Wizard who fires it at the wrong moment has made a real mistake.
 */

const WIZARD = [CLASS_IDS.wizard] as const;

export const WIZARD_ABILITIES: readonly CombatAbilityDefinition[] = [
  {
    id: "wizard.arc_bolt",
    name: "Arc Bolt",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 1,
    acquisition: { source: "starting" },
    resource: { type: "mana", amount: 6 },
    cooldownMs: 2_500,
    recoveryMs: 350,
    target: { kind: "hostile_target", rangeMetres: 30 },
    effects: [
      {
        type: "spawn_projectile",
        speedMetresPerSecond: 45,
        onHit: [{ type: "damage", amount: formula("spell.direct", 0.9), school: "arcane" }],
      },
    ],
    threat: formula("threat.standard", 1),
  },
  {
    id: "wizard.cinder",
    name: "Cinder",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 1,
    acquisition: { source: "starting" },
    resource: { type: "mana", amount: 8 },
    cooldownMs: 6_000,
    recoveryMs: 400,
    target: { kind: "hostile_target", rangeMetres: 30 },
    effects: [
      { type: "damage", amount: formula("spell.direct", 0.6), school: "fire" },
      { type: "apply_status", statusId: "wizard.burning" },
    ],
    threat: formula("threat.standard", 1),
  },
  {
    id: "wizard.root_sigil",
    name: "Root Sigil",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 1,
    acquisition: { source: "starting" },
    resource: { type: "mana", amount: 9 },
    cooldownMs: 12_000,
    recoveryMs: 400,
    target: { kind: "hostile_target", rangeMetres: 25 },
    effects: [{ type: "apply_status", statusId: "wizard.rooted" }],
  },
  {
    id: "wizard.arcane_ward",
    name: "Arcane Ward",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 1,
    acquisition: { source: "starting" },
    resource: { type: "mana", amount: 10 },
    cooldownMs: 20_000,
    recoveryMs: 400,
    target: { kind: "self" },
    effects: [{ type: "apply_status", statusId: "wizard.arcane_ward" }],
  },
  {
    id: "wizard.frost_snap",
    name: "Frost Snap",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 3,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 9 },
    cooldownMs: 8_000,
    recoveryMs: 400,
    target: { kind: "hostile_target", rangeMetres: 30 },
    effects: [
      { type: "damage", amount: formula("spell.direct", 0.75), school: "cold" },
      { type: "apply_status", statusId: "wizard.chilled" },
    ],
    threat: formula("threat.standard", 1),
  },
  {
    id: "wizard.flame_lance",
    name: "Flame Lance",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 5,
    // The design's worked research example: eligibility at 5, three separate paths.
    acquisition: { source: "research", requiresKnowledge: ["arcana.emberwall_formula"] },
    resource: { type: "mana", amount: 16 },
    cooldownMs: 12_000,
    recoveryMs: 500,
    target: { kind: "hostile_target", rangeMetres: 30 },
    effects: [
      {
        type: "spawn_projectile",
        speedMetresPerSecond: 55,
        onHit: [{ type: "damage", amount: formula("spell.direct", 2.1), school: "fire" }],
      },
    ],
    threat: formula("threat.standard", 1.4),
  },
  {
    id: "wizard.blink",
    name: "Blink",
    classIds: WIZARD,
    kind: "utility",
    tags: ["movement", "off_recovery"],
    minLevel: 7,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 12 },
    cooldownMs: 30_000,
    charges: 2,
    recoveryMs: 200,
    target: { kind: "self" },
    // The fragile caster's only real defence is not being there. Charges rather than a
    // shorter cooldown, so escaping twice in a bad moment is possible and then it is not.
    effects: [{ type: "teleport", metres: 12 }],
  },
  {
    id: "wizard.arcane_surge",
    name: "Arcane Surge",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 10,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 20 },
    cooldownMs: 180_000,
    sharedCooldown: "offensive_discipline",
    recoveryMs: 300,
    target: { kind: "self" },
    effects: [{ type: "apply_status", statusId: "wizard.arcane_surge" }],
  },

  // ---------------------------------------------------------------------------
  // 11–25
  // ---------------------------------------------------------------------------

  {
    id: "wizard.shatterfrost",
    name: "Shatterfrost",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 12,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 14 },
    cooldownMs: 10_000,
    recoveryMs: 450,
    target: { kind: "hostile_target", rangeMetres: 30 },
    // Reads the setup the level-3 spell left behind. Two spells that are better together
    // than apart is the whole reason the schools exist.
    requirements: [{ kind: "target_has_status", statusId: "wizard.chilled" }],
    effects: [
      { type: "damage", amount: formula("spell.direct", 1.8), school: "cold" },
      { type: "remove_status", statusId: "wizard.chilled" },
    ],
    threat: formula("threat.standard", 1.3),
  },
  {
    id: "wizard.emberburst",
    name: "Emberburst",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 14,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 22 },
    cooldownMs: 20_000,
    recoveryMs: 600,
    target: { kind: "ground_point", rangeMetres: 25, widthMetres: 7 },
    effects: [
      {
        type: "spawn_area",
        radiusMetres: 7,
        durationMs: 6_000,
        onTick: [{ type: "damage", amount: formula("spell.dot_tick", 1.3), school: "fire" }],
      },
    ],
    threat: formula("threat.standard", 1.5),
  },
  {
    id: "wizard.null_field",
    name: "Null Field",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 16,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 15 },
    cooldownMs: 35_000,
    sharedCooldown: "hard_control",
    recoveryMs: 400,
    target: { kind: "hostile_target", rangeMetres: 25 },
    effects: [
      { type: "interrupt" },
      { type: "apply_status", statusId: "common.silenced" },
      { type: "dispel", count: 1 },
    ],
    threat: formula("threat.standard", 1.2),
  },
  {
    id: "wizard.glacial_bind",
    name: "Glacial Bind",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 18,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 16 },
    cooldownMs: 25_000,
    recoveryMs: 450,
    target: { kind: "hostile_target", rangeMetres: 25 },
    // Unlike Root Sigil this one holds through damage, which is what makes a second
    // enemy survivable while the first one is being killed.
    effects: [{ type: "apply_status", statusId: "wizard.glacial_bind" }],
  },
  {
    id: "wizard.combust",
    name: "Combust",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 20,
    acquisition: { source: "research", requiresKnowledge: ["arcana.ember_notation"] },
    resource: { type: "mana", amount: 20 },
    cooldownMs: 18_000,
    recoveryMs: 500,
    target: { kind: "hostile_target", rangeMetres: 30 },
    requirements: [{ kind: "target_has_status", statusId: "wizard.burning" }],
    // The payoff for having played the fire game: the burn is spent, not refreshed.
    effects: [
      { type: "damage", amount: formula("spell.direct", 2.4), school: "fire" },
      { type: "remove_status", statusId: "wizard.burning" },
    ],
    threat: formula("threat.standard", 1.6),
  },
  {
    id: "wizard.mana_reave",
    name: "Mana Reave",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 22,
    acquisition: { source: "trainer" },
    resource: { type: "mana", amount: 8 },
    cooldownMs: 30_000,
    recoveryMs: 500,
    target: { kind: "hostile_target", rangeMetres: 25 },
    // Mana constrains the Wizard, so the answer to a long fight is a spell that gives
    // some back — never regeneration that removes the constraint entirely.
    effects: [
      { type: "damage", amount: formula("spell.direct", 1), school: "arcane" },
      { type: "restore_resource", resource: "mana", amount: formula("resource.restore", 1.6) },
    ],
    threat: formula("threat.standard", 1.1),
  },
  {
    id: "wizard.conflagration",
    name: "Conflagration",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 25,
    acquisition: { source: "advanced_trainer", requiresAbilities: ["wizard.combust"] },
    resource: { type: "mana", amount: 45 },
    cooldownMs: 90_000,
    sharedCooldown: "offensive_discipline",
    recoveryMs: 800,
    target: { kind: "radius_target", rangeMetres: 30, widthMetres: 10, maxTargets: 6 },
    effects: [
      { type: "damage", amount: formula("spell.direct", 2.6), school: "fire" },
      { type: "apply_status", statusId: "wizard.burning" },
    ],
    threat: formula("threat.standard", 2),
  },

  // Aspect unlocks
  {
    id: "wizard.overchannel",
    name: "Overchannel",
    classIds: WIZARD,
    kind: "spell",
    minLevel: 1,
    acquisition: { source: "aspect" },
    resource: { type: "health", amount: 8 },
    cooldownMs: 25_000,
    recoveryMs: 250,
    target: { kind: "self" },
    // Paid in health, because the point of the node is that power has to come from
    // somewhere and a Wizard has nothing else to spend.
    effects: [{ type: "apply_status", statusId: "wizard.overchannelled" }],
  },
  {
    id: "wizard.null_pattern",
    name: "Null Pattern",
    classIds: WIZARD,
    kind: "spell",
    tags: ["reaction"],
    minLevel: 1,
    acquisition: { source: "aspect" },
    resource: { type: "mana", amount: 10 },
    cooldownMs: 20_000,
    recoveryMs: 200,
    target: { kind: "hostile_target", rangeMetres: 25 },
    effects: [
      { type: "interrupt" },
      { type: "dispel", count: 2 },
    ],
  },
];

export const WIZARD_STATUSES: readonly StatusDefinition[] = [
  {
    id: "wizard.burning",
    name: "Burning",
    durationMs: 12_000,
    stacking: "independent_by_caster",
    school: "fire",
    tick: { everyMs: 1_000, amount: formula("spell.dot_tick", 1) },
  },
  {
    id: "wizard.chilled",
    name: "Chilled",
    durationMs: 10_000,
    stacking: "replace_weaker",
    control: "snare",
    school: "cold",
  },
  {
    // Root Sigil breaks on damage; Glacial Bind does not. Authored per spell, because
    // that difference is exactly what the design says a root definition decides.
    id: "wizard.rooted",
    name: "Rooted",
    durationMs: 16_000,
    stacking: "replace_weaker",
    control: "root",
    school: "arcane",
    breaksOnDamage: true,
  },
  {
    id: "wizard.glacial_bind",
    name: "Glacial Bind",
    durationMs: 10_000,
    stacking: "replace_weaker",
    control: "root",
    school: "cold",
  },
  {
    id: "wizard.arcane_ward",
    name: "Arcane Ward",
    durationMs: 20_000,
    stacking: "refresh",
    school: "arcane",
  },
  {
    id: "wizard.arcane_surge",
    name: "Arcane Surge",
    durationMs: 15_000,
    stacking: "unique",
    school: "arcane",
  },
  {
    id: "wizard.overchannelled",
    name: "Overchannelled",
    durationMs: 8_000,
    stacking: "refresh",
    school: "arcane",
  },
];
