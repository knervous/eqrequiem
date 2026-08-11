import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import { DEMO_FORCE_START_AT_GATE } from "./demo-start.js";
import { ARRIVAL, ZONES } from "./eltania.js";

/**
 * Where a newly created character starts, decided once for both runtimes.
 *
 * This used to be two implementations — one in `backend/embedded-game-backend.ts`, one
 * in `persist/repository.ts` — that queried `character_origins` for a row matching the
 * character's race, class, deity *and* requested start zone. Against the real content
 * database no such row exists for any race under the current character contract, so
 * creation failed outright: the offline path threw and the live path silently returned
 * false. Only the test fixtures passed, because they leave `character_origins` empty and
 * so reached a fallback.
 *
 * The deeper problem was scope. Those origin rows describe a dozen EverQuest home
 * cities, none of which the demo ships. The demo has one city, so the rule is simply
 * that every character begins in Talios — and this resolver cannot fail.
 */

export interface CharacterOriginPlacement {
  readonly zoneId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
  readonly bindZoneId: number;
  readonly bindX: number;
  readonly bindY: number;
  readonly bindZ: number;
  readonly bindHeading: number;
  /** How the placement was decided, for logs and tests. */
  readonly source: "authored" | "arrival";
}

export interface CharacterOriginQuery {
  readonly race: number;
  readonly charClass: number;
  readonly deity: number;
}

/** Zones a character may start in. One city for now, by design. */
const START_ZONE_IDS: readonly number[] = [ZONES.crownward.id, ZONES.lowharbor.id];

interface OriginRow extends DatabaseRow {
  zone_id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  bind_zone_id: number;
  bind_x: number;
  bind_y: number;
  bind_z: number;
  bind_heading: number;
}

/** The canonical arrival, used whenever content has nothing better to say. */
export function arrivalPlacement(): CharacterOriginPlacement {
  return {
    zoneId: ARRIVAL.zone.id,
    x: ARRIVAL.x,
    y: ARRIVAL.y,
    z: ARRIVAL.z,
    heading: ARRIVAL.heading,
    bindZoneId: ARRIVAL.zone.id,
    bindX: ARRIVAL.x,
    bindY: ARRIVAL.y,
    bindZ: ARRIVAL.z,
    bindHeading: ARRIVAL.heading,
    source: "arrival",
  };
}

/**
 * Resolves a start position. Never returns null: a character that cannot be placed is a
 * character that cannot be created, and "your race has no home city in this build" is
 * not a reason to refuse.
 *
 * An authored origin is still honoured when one exists *inside a start zone*, so content
 * can place a class at its own trainer without this function changing. Origins pointing
 * at cities the demo does not ship are ignored rather than obeyed.
 */
export async function resolveCharacterOrigin(
  content: DatabaseBackend,
  character: CharacterOriginQuery,
  options: {
    readonly contentPrefix?: string;
    /**
     * Whether the temporary demo hook applies. Defaults to the hook's own switch;
     * `false` resolves origins normally, which is how the authored path stays covered
     * while the hook is on.
     */
    readonly forceDemoStart?: boolean;
  } = {},
): Promise<CharacterOriginPlacement> {
  // Temporary demo hook — see `content/demo-start.ts`. Authored origins still describe
  // EverQuest's home cities, and 48 of them point at Lowharbor, so a new Human warrior
  // is legitimately placed there rather than at the gate. While the demo forces every
  // session to start in the Crownward, creation has to agree, or the roster advertises a
  // city the player never actually wakes up in.
  if (options.forceDemoStart ?? DEMO_FORCE_START_AT_GATE) return arrivalPlacement();

  const prefix = options.contentPrefix ?? "";
  const placeholders = START_ZONE_IDS.map(() => "?").join(", ");
  try {
    const rows = (
      await content.query<OriginRow>(
        `SELECT zone_id, x, y, z, heading, bind_zone_id, bind_x, bind_y, bind_z, bind_heading
           FROM ${prefix}character_origins
          WHERE race_id = ? AND class_id = ? AND deity_id = ?
            AND zone_id IN (${placeholders})
          ORDER BY CASE WHEN zone_id = ? THEN 0 ELSE 1 END, priority DESC
          LIMIT 1`,
        [
          character.race,
          character.charClass,
          character.deity,
          ...START_ZONE_IDS,
          // Prefer the Crownward when content offers a choice.
          ZONES.crownward.id,
        ],
      )
    ).rows;
    const row = rows[0];
    if (!row) return arrivalPlacement();
    return {
      zoneId: Number(row.zone_id),
      x: Number(row.x),
      y: Number(row.y),
      z: Number(row.z),
      heading: Number(row.heading),
      bindZoneId: Number(row.bind_zone_id),
      bindX: Number(row.bind_x),
      bindY: Number(row.bind_y),
      bindZ: Number(row.bind_z),
      bindHeading: Number(row.bind_heading),
      source: "authored",
    };
  } catch {
    // A content database predating `character_origins` is not an error; it just has
    // nothing to add. Falling through to the arrival keeps creation working.
    return arrivalPlacement();
  }
}
