import { ZONES } from "../../../../serverjs/src/content/eltania";

/**
 * Canonical zone display names for the client.
 *
 * This used to accept either identity — the canonical key or the EverQuest short name —
 * because the runtime and the fiction disagreed about what a zone was called. They no
 * longer do: the world assets, `zones.short_name` and the canonical key are one string,
 * so this is a plain lookup from that key to the name a player should read.
 *
 * It still reads the server's vocabulary rather than keeping its own table, so the two
 * sides cannot drift.
 */

const BY_KEY = new Map(
  Object.values(ZONES).map((zone) => [zone.key.toLowerCase(), zone.name]),
);

/** The canonical name for a zone key, or null if it is not demo canon. */
export function eltaniaZoneName(zoneKey: string): string | null {
  return BY_KEY.get(zoneKey.trim().toLowerCase()) ?? null;
}
