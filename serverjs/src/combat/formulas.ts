import type { FormulaRef } from "./ability-types.js";

/**
 * One place where combat maths lives.
 *
 * Abilities reference formulas by name (`formula("warrior.kick")`) instead of carrying
 * arithmetic, for three reasons the design calls out: balance becomes a single file to
 * read, telemetry can attribute damage to a named curve, and an ability author cannot
 * quietly invent a different level-scaling rule for their own technique.
 *
 * Every formula is a pure function of an explicit input record, so a balance change is
 * testable without a running combat.
 */

export interface FormulaInput {
  readonly level: number;
  /** The ability's authored scalar, from `FormulaRef.scale`. */
  readonly scale: number;
  readonly strength?: number;
  readonly stamina?: number;
  readonly agility?: number;
  readonly dexterity?: number;
  readonly wisdom?: number;
  readonly intelligence?: number;
  /** Relevant weapon skill or arcane control, 0–255ish. */
  readonly skill?: number;
  readonly weaponDamage?: number;
  readonly spellPower?: number;
  readonly healingPower?: number;
  /** Target-side inputs. */
  readonly targetArmor?: number;
  readonly targetResist?: number;
  readonly levelDifference?: number;
}

export type Formula = (input: FormulaInput) => number;

/**
 * Armor uses a diminishing-return curve rather than a reproduction of legacy EQ AC.
 *
 * `K` grows with attacker level so a fixed armour value loses value as the world gets
 * more dangerous, which is what stops early armour from trivialising later content
 * without any need to scale the enemies themselves.
 */
export function armorMitigation(armor: number, attackerLevel: number): number {
  const safeArmor = Math.max(0, armor);
  const k = 60 + 25 * Math.max(1, attackerLevel);
  return safeArmor / (safeArmor + k);
}

/**
 * Resist produces partial mitigation, not a coin flip.
 *
 * A full resist is reserved for a strong mismatch; the common case is that a resisted
 * spell still does something, because a caster whose turn simply evaporates is not
 * making an interesting decision.
 */
export function resistMultiplier(
  resist: number,
  penetration: number,
): number {
  const net = Math.max(0, resist - penetration);
  const mitigated = net / (net + 200);
  return Math.max(0, 1 - mitigated);
}

/**
 * How much a level gap matters. Deliberately steep enough that a red-con enemy is
 * frightening — the design keeps geography and level meaningful rather than scaling
 * the world to the player.
 */
export function levelDifferenceMultiplier(difference: number): number {
  if (difference >= 0) return 1 + Math.min(0.5, difference * 0.05);
  return Math.max(0.25, 1 + difference * 0.08);
}

const registry = new Map<string, Formula>();

export function defineFormula(name: string, formula: Formula): void {
  if (registry.has(name)) throw new Error(`duplicate combat formula: ${name}`);
  registry.set(name, formula);
}

export function evaluateFormula(ref: FormulaRef, input: Omit<FormulaInput, "scale">): number {
  const formula = registry.get(ref.formula);
  if (!formula) throw new Error(`unknown combat formula: ${ref.formula}`);
  return formula({ ...input, scale: ref.scale ?? 1 });
}

export function formula(name: string, scale = 1): FormulaRef {
  return { formula: name, scale };
}

export function formulaNames(): string[] {
  return [...registry.keys()].sort();
}

/** Test seam: clears authored formulas. Not for runtime use. */
export function resetFormulasForTest(): void {
  registry.clear();
}

// ---------------------------------------------------------------------------
// Shared curves. Ability-specific numbers come from each ability's `scale`.
// ---------------------------------------------------------------------------

/** Weapon-based martial damage: weapon does the work, level and strength shape it. */
defineFormula("martial.weapon_strike", ({ scale, level, strength = 75, weaponDamage = 2, skill = 0 }) =>
  Math.max(
    1,
    Math.round(
      scale
      * (weaponDamage * 2 + level * 0.8)
      * (1 + (strength - 75) / 250)
      * (1 + skill / 500),
    ),
  ));

/** Unarmed/technique damage that does not lean on a weapon, e.g. Monk strikes. */
defineFormula("martial.technique", ({ scale, level, agility = 75, skill = 0 }) =>
  Math.max(
    1,
    Math.round(scale * (3 + level * 1.1) * (1 + (agility - 75) / 300) * (1 + skill / 500)),
  ));

/** Direct magical damage. Scales on spell power and level, not on weapons. */
defineFormula("spell.direct", ({ scale, level, intelligence = 75, spellPower = 0 }) =>
  Math.max(
    1,
    Math.round(scale * (4 + level * 1.6) * (1 + (intelligence - 75) / 200) * (1 + spellPower / 100)),
  ));

/**
 * Physical damage-over-time per tick — bleeds, poisons, sundered wounds.
 *
 * Separate from `spell.dot_tick` because a Ranger's bleed has no business scaling on
 * Wisdom; the school the damage comes from is what decides which stat funds it.
 */
defineFormula("martial.bleed_tick", ({ scale, level, strength = 75 }) =>
  Math.max(
    1,
    Math.round(scale * (1 + level * 0.3) * (1 + (strength - 75) / 250)),
  ));

/** Damage-over-time per tick, on the 1s cadence. */
defineFormula("spell.dot_tick", ({ scale, level, wisdom = 75, spellPower = 0 }) =>
  Math.max(
    1,
    Math.round(scale * (1 + level * 0.35) * (1 + (wisdom - 75) / 250) * (1 + spellPower / 150)),
  ));

/** Direct healing. */
defineFormula("spell.heal", ({ scale, level, wisdom = 75, healingPower = 0 }) =>
  Math.max(
    1,
    Math.round(scale * (6 + level * 2.0) * (1 + (wisdom - 75) / 180) * (1 + healingPower / 100)),
  ));

/**
 * Healing-over-time per tick.
 *
 * Deliberately much flatter than `spell.heal`: a heal-over-time that matched a direct
 * heal per tick would make the direct heal pointless, and the design wants the emergency
 * button and the sustained button to answer different questions.
 */
defineFormula("spell.heal_tick", ({ scale, level, wisdom = 75, healingPower = 0 }) =>
  Math.max(
    1,
    Math.round(scale * (2 + level * 0.45) * (1 + (wisdom - 75) / 220) * (1 + healingPower / 150)),
  ));

/**
 * Resource restored by a technique that gives some back.
 *
 * Flat in level rather than proportional, so restoring vigor stays a real decision at
 * 25 instead of quietly becoming free uptime as pools grow.
 */
defineFormula("resource.restore", ({ scale, level }) =>
  Math.max(1, Math.round(scale * (6 + level * 0.6))));

/** Absorb shields. Slightly flatter than healing so wards stay predictable. */
defineFormula("spell.ward", ({ scale, level, wisdom = 75 }) =>
  Math.max(1, Math.round(scale * (8 + level * 2.2) * (1 + (wisdom - 75) / 200))));

/**
 * Threat from an ordinary action. Taunt does not use this — forcing attention is a
 * position change relative to the current leader, not a large number.
 */
defineFormula("threat.standard", ({ scale, level }) =>
  Math.max(1, Math.round(scale * (2 + level * 0.5))));
