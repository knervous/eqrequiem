import type { WorldSituationDefinition } from "../world-situations.js";
import { DEEPS_SITUATIONS } from "./deeps.js";
import { GREENVEIL_SITUATIONS } from "./greenveil.js";
import { GREYMARCH_SITUATIONS } from "./greymarch.js";
import { LOWHARBOR_SITUATIONS } from "./lowharbor.js";

/**
 * Every authored World Situation, in one registry.
 *
 * Kept deliberately small. The design target is roughly a dozen situations that each
 * mean something, not a catalog: a player should be able to learn what the world does,
 * and that is only possible if the set is small enough to become familiar.
 */
export const WORLD_SITUATIONS: readonly WorldSituationDefinition[] = [
  ...GREYMARCH_SITUATIONS,
  ...GREENVEIL_SITUATIONS,
  ...LOWHARBOR_SITUATIONS,
  ...DEEPS_SITUATIONS,
];

/**
 * Static checks on the authored set. Every one of these is a rule the design document
 * states in prose; keeping them here means a violation fails the build rather than
 * quietly shipping.
 */
export function validateSituations(
  situations: readonly WorldSituationDefinition[] = WORLD_SITUATIONS,
): void {
  const seen = new Set<string>();
  for (const situation of situations) {
    if (seen.has(situation.key)) {
      throw new Error(`duplicate world situation key: ${situation.key}`);
    }
    seen.add(situation.key);
    if (!situation.key.includes(":")) {
      throw new Error(`world situation key must be "zone:name": ${situation.key}`);
    }
    if (!situation.discovery?.text?.trim()) {
      throw new Error(
        `${situation.key} has no discovery hook; a situation nobody can stumble into `
        + "is a timer, not content",
      );
    }
    // A repeatable situation with no cooldown range is a fixed schedule the player can
    // memorize, which is the daily-reset feel this design exists to avoid.
    if (situation.cooldown) {
      const { minMinutes, maxMinutes } = situation.cooldown;
      if (!(maxMinutes > minMinutes)) {
        throw new Error(
          `${situation.key} has a fixed cooldown (${minMinutes}m); use a range so the `
          + "world cannot be read off a clock",
        );
      }
    }
    if (situation.durationMinutes !== undefined && situation.durationMinutes <= 0) {
      throw new Error(`${situation.key} has a non-positive duration`);
    }
  }
}
