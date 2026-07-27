const EQ_HEADING_UNITS_PER_TURN = 512;
const RADIANS_PER_TURN = Math.PI * 2;

/** Converts persisted EQ heading units into the runtime/net radians contract. */
export function eqHeadingToRadians(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  return heading * (RADIANS_PER_TURN / EQ_HEADING_UNITS_PER_TURN);
}

/** Converts runtime/net radians into normalized persisted EQ heading units. */
export function radiansToEqHeading(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  const normalized =
    ((heading % RADIANS_PER_TURN) + RADIANS_PER_TURN) % RADIANS_PER_TURN;
  return normalized * (EQ_HEADING_UNITS_PER_TURN / RADIANS_PER_TURN);
}
