/**
 * Server-side world clock.
 *
 * Time-of-day is a gameplay input — rituals, night-only content, who is awake to talk to
 * — so it cannot live only in the client's sky renderer. This derives the hour from wall
 * time against a fixed epoch, which makes it deterministic, restart-proof and free of any
 * per-shard state.
 *
 * The client sky (`client/src/Game/Sky/sky-motion.ts`) derives its hour from the same
 * function of wall time — same epoch hour, same day length — so the two agree in phase
 * without a packet. Changing `DEFAULT_DAY_LENGTH_SECONDS` or the epoch hour here means
 * changing `DEFAULT_SKY_MOTION_SETTINGS` and `WORLD_CLOCK_EPOCH_HOUR` there, or a
 * night-gated quest will tell a player "after sunset" while their sky renders midday.
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
