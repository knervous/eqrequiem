import { armorMitigation, levelDifferenceMultiplier, resistMultiplier } from "./formulas.js";
import type { MagicSchool } from "./ability-types.js";

/**
 * How an attack actually lands.
 *
 * Two rules from the design shape this more than the arithmetic does:
 *
 * - **Level-appropriate combat must not become a miss streak.** A player who cannot
 *   affect an even-level enemy is not making decisions, they are waiting. The floor on
 *   hit chance is high and the avoidance ceilings are per-class rather than open-ended.
 * - **A level gap must still be frightening.** The same curve that protects even fights
 *   lets a red-con enemy shred you, because the world is never scaled to the player.
 *
 * Randomness is injected, never ambient: every resolution takes a `roll` so a fight can
 * be replayed exactly in a test or from a recorded seed.
 */

export type PhysicalOutcome =
  | "miss"
  | "dodge"
  | "parry"
  | "block"
  | "hit"
  | "critical";

export interface PhysicalAttack {
  readonly attackerLevel: number;
  readonly defenderLevel: number;
  /** Weapon skill or hand-to-hand, 0–255ish. */
  readonly accuracySkill: number;
  readonly baseDamage: number;
  readonly defenderArmor: number;
  /** Per-class avoidance, already capped by the caller's class ceilings. */
  readonly dodgeChance?: number;
  readonly parryChance?: number;
  /** Block mitigates rather than negates. */
  readonly blockChance?: number;
  readonly blockMitigation?: number;
  readonly criticalChance?: number;
}

export interface PhysicalResult {
  readonly outcome: PhysicalOutcome;
  readonly damage: number;
}

/** Even-level baseline. High enough that ordinary fights are about decisions. */
const BASE_HIT_CHANCE = 0.9;
const MINIMUM_HIT_CHANCE = 0.2;
const MAXIMUM_HIT_CHANCE = 0.98;

export function resolvePhysicalAttack(
  attack: PhysicalAttack,
  roll: () => number,
): PhysicalResult {
  const levelGap = attack.attackerLevel - attack.defenderLevel;
  const hitChance = Math.min(
    MAXIMUM_HIT_CHANCE,
    Math.max(
      MINIMUM_HIT_CHANCE,
      BASE_HIT_CHANCE + levelGap * 0.02 + attack.accuracySkill / 2_000,
    ),
  );

  // Avoidance is checked before the hit roll: dodging is the defender doing something,
  // not the attacker failing.
  if (roll() < (attack.dodgeChance ?? 0)) return { outcome: "dodge", damage: 0 };
  if (roll() < (attack.parryChance ?? 0)) return { outcome: "parry", damage: 0 };
  if (roll() >= hitChance) return { outcome: "miss", damage: 0 };

  const mitigation = armorMitigation(attack.defenderArmor, attack.attackerLevel);
  const scaled = attack.baseDamage * levelDifferenceMultiplier(levelGap);
  let damage = scaled * (1 - mitigation);

  let outcome: PhysicalOutcome = "hit";
  if (roll() < (attack.blockChance ?? 0)) {
    outcome = "block";
    damage *= 1 - (attack.blockMitigation ?? 0.5);
  } else if (roll() < (attack.criticalChance ?? 0)) {
    outcome = "critical";
    damage *= 1.5;
  }

  return { outcome, damage: Math.max(1, Math.round(damage)) };
}

export type SpellOutcome = "hit" | "partial" | "resisted";

export interface SpellAttack {
  readonly casterLevel: number;
  readonly targetLevel: number;
  readonly school: MagicSchool;
  readonly baseAmount: number;
  readonly targetResist: number;
  readonly penetration?: number;
}

export interface SpellResult {
  readonly outcome: SpellOutcome;
  readonly amount: number;
  /** 0–1 of the authored effect that survived. Control uses it for duration. */
  readonly retained: number;
}

/**
 * Spells mostly land for reduced value rather than nothing.
 *
 * A full resist is reserved for a genuine mismatch, because a caster whose action
 * simply evaporates has been given a coin flip instead of a decision. Control spells
 * reuse `retained` as a duration multiplier, which is how a boss ends up resisting
 * most of a root's duration without needing blanket immunity.
 */
export function resolveSpell(attack: SpellAttack, roll: () => number): SpellResult {
  const multiplier = resistMultiplier(attack.targetResist, attack.penetration ?? 0);
  const levelGap = attack.casterLevel - attack.targetLevel;
  const retained = Math.max(0, Math.min(1, multiplier * levelDifferenceMultiplier(levelGap)));

  // A full resist needs both a bad matchup and an unlucky roll.
  if (retained < 0.3 && roll() > retained) {
    return { outcome: "resisted", amount: 0, retained: 0 };
  }
  const amount = Math.max(1, Math.round(attack.baseAmount * retained));
  return {
    outcome: retained >= 0.95 ? "hit" : "partial",
    amount,
    retained,
  };
}

/** Control duration after resistance. Bosses reduce, they do not blanket-immune. */
export function controlDuration(
  authoredMs: number,
  retained: number,
  controlReduction = 0,
): number {
  const reduced = authoredMs * retained * (1 - Math.max(0, Math.min(1, controlReduction)));
  return Math.max(0, Math.round(reduced));
}
