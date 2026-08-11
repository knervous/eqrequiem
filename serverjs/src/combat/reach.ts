/**
 * One reach rule for everything that targets something.
 *
 * Auto-attack and abilities used to measure differently, and the difference was not
 * cosmetic:
 *
 * - Melee compared a *horizontal* gap against weapon reach plus a body-width pad, and
 *   tolerated a generous height difference separately.
 * - The ability gate compared a full *3D* distance against the authored range, with no
 *   pad at all.
 *
 * A character's authoritative position is its physics capsule centre, while a spawned
 * NPC's is nearer its feet, so the height difference alone spent several metres of an
 * authored four-metre melee range before any horizontal gap was counted. The result was
 * that a Warrior standing exactly where their auto-attacks were connecting was refused
 * their Kick — "your target is too far away" from a target they were actively hitting.
 *
 * Both systems measure the same way now. Anything answering "is my target close enough"
 * belongs here rather than in either caller.
 */

export interface TargetSeparation {
  /** Ground-plane gap. This is the number the client shows beside the target's name. */
  readonly horizontalMetres: number;
  /** Absolute height difference, which reach tolerates rather than spends. */
  readonly verticalMetres: number;
}

export interface ReachRules {
  /** Slack for two bodies standing adjacent: positions are centres, not surfaces. */
  readonly bodyPaddingMetres: number;
  /**
   * Height difference that still counts as "next to": a step, a slope, or simply the
   * offset between a capsule origin and a spawn origin.
   */
  readonly maximumVerticalSeparationMetres: number;
}

/**
 * The pad a *player character* gets, and it is deliberately generous.
 *
 * A browser MMO played through a follow camera, over a network, against
 * server-authoritative positions cannot ask a player for precise spacing — and being
 * refused by a few centimetres is not difficulty, it is noise. Weapon reach is 3, so a
 * 9 pad puts a player's effective melee reach at 12: roughly two body lengths, which is
 * about as far as a swing still *looks* like it should connect.
 *
 * This is the single dial for how forgiving a player's targeted ranges are. Everything
 * else — authored `rangeMetres`, weapon reach, the client's attack cone decal — is
 * derived from or matched to it.
 */
export const DEFAULT_REACH_RULES: ReachRules = Object.freeze({
  bodyPaddingMetres: 9,
  maximumVerticalSeparationMetres: 12,
});

/**
 * The pad an NPC gets, which is the ordinary one.
 *
 * The generosity above exists so a *player's* input is never refused by a hair, and it
 * does not transfer. Handing it to NPCs would make them hit from two body lengths away
 * and let them stop chasing at that distance, so they would stand off and swing at air
 * — the leniency meant to remove frustration would read as enemies cheating.
 */
export const NPC_REACH_RULES: ReachRules = Object.freeze({
  bodyPaddingMetres: 3,
  maximumVerticalSeparationMetres:
    DEFAULT_REACH_RULES.maximumVerticalSeparationMetres,
});

export interface ReachPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function separationBetween(
  left: ReachPoint,
  right: ReachPoint,
): TargetSeparation {
  const dx = left.x - right.x;
  const dz = left.z - right.z;
  return {
    horizontalMetres: Math.sqrt(dx * dx + dz * dz),
    verticalMetres: Math.abs(left.y - right.y),
  };
}

/**
 * `reachMetres` is the authored reach — weapon reach for a swing, `rangeMetres` for an
 * ability. The pad is added here rather than by callers so the two can never drift.
 */
export function withinReach(
  separation: TargetSeparation,
  reachMetres: number,
  rules: ReachRules = DEFAULT_REACH_RULES,
): boolean {
  const reach =
    Math.max(0.1, reachMetres) + Math.max(0, rules.bodyPaddingMetres);
  return (
    separation.verticalMetres
      <= Math.max(0, rules.maximumVerticalSeparationMetres)
    && separation.horizontalMetres <= reach
  );
}
