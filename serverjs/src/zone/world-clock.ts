/**
 * Server-side world clock.
 *
 * Time-of-day is a gameplay input — rituals, night-only content, who is awake to talk to
 * — so it cannot live only in the client's sky renderer. This derives the hour from wall
 * time against a fixed epoch, which makes it deterministic, restart-proof and free of any
 * per-shard state.
 *
 * The client sky (`sky-motion.ts`) currently free-runs from hour 12 at scene load with
 * the same day length, so the two agree in cadence but not in phase. Syncing the client
 * to this clock is a separate change; until then, treat the server hour as authoritative
 * for content decisions and the client sky as decoration.
 */

/** One in-world day per real hour, matching DEFAULT_SKY_MOTION_SETTINGS. */
export const DEFAULT_DAY_LENGTH_SECONDS = 3600;

export interface WorldClockOptions {
  readonly dayLengthSeconds?: number;
  /** World hour at the Unix epoch. */
  readonly epochHour?: number;
}

/** Fractional hour in [0, 24). */
export function worldHourAt(
  nowMs: number,
  options: WorldClockOptions = {},
): number {
  const dayLengthSeconds = Math.max(1, options.dayLengthSeconds ?? DEFAULT_DAY_LENGTH_SECONDS);
  const hoursPerSecond = 24 / dayLengthSeconds;
  const hour = (options.epochHour ?? 12) + (nowMs / 1000) * hoursPerSecond;
  return ((hour % 24) + 24) % 24;
}

export function isNight(hour: number): boolean {
  return hour >= 19 || hour < 5;
}
