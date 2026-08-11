import type { DatabaseResult, SqlParameters } from "../db/backend.js";
import { ARRIVAL } from "./eltania.js";

/**
 * Just the write capability, so both runtimes can call this with what they already hold:
 * the live zone passes a `DatabaseBackend`, the offline backend a `DrizzleDatabase`.
 * Neither satisfies the other's full interface, and this function needs neither.
 */
export interface SqlExecutor {
  execute(sql: string, parameters?: SqlParameters): Promise<DatabaseResult>;
}

/**
 * TEMPORARY — demo hook. Every character enters the world at the Crownward gate.
 *
 * The demo is shown from a known first thirty seconds: you arrive at the gate, the watch
 * is arguing about a patrol that has not come back, and the first thread is in front of
 * you. A character that logged out in the Mournvault two floors down starts the demo in
 * the dark, alone, with nothing to do — so where a session *resumes* is not something the
 * demo wants to inherit from where it *ended*.
 *
 * This deliberately overrides saved position, which is why it is a hook and not a
 * feature. It applies at enter-world only: zoning during a session still works normally,
 * or the Greymarch content would be unreachable.
 *
 * To remove: delete this module, `applyDemoStart` in `enterWorld`
 * through `CharacterRosterService.enterWorld` in both runtime adapters.
 * Nothing else depends on it.
 */

/** The single switch. Flip to `false` to restore saved positions without deleting code. */
export const DEMO_FORCE_START_AT_GATE = true;

export interface DemoStartPlacement {
  readonly zoneId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number;
}

/**
 * The gate itself. `ARRIVAL` already names this spot — it is where new characters are
 * placed and where `missing-patrol` expects the watch to be standing — so the hook reuses
 * it rather than introducing a second set of coordinates that could drift from the first.
 */
export const DEMO_START: DemoStartPlacement = {
  zoneId: ARRIVAL.zone.id,
  x: ARRIVAL.x,
  y: ARRIVAL.y,
  z: ARRIVAL.z,
  heading: ARRIVAL.heading,
};

/**
 * Moves a character to the demo start. Returns whether anything was written.
 *
 * Update-then-insert rather than an upsert: the runtime database is SQLite offline and
 * MySQL live, and the two spell upserts differently. `affectedRows` is in the shared
 * backend contract, so this one implementation is correct in both.
 */
export async function applyDemoStart(
  runtime: SqlExecutor,
  characterId: number,
  placement: DemoStartPlacement = DEMO_START,
): Promise<boolean> {
  if (!DEMO_FORCE_START_AT_GATE) return false;

  const updated = await runtime.execute(
    `UPDATE character_positions
        SET zone_id = ?, instance_id = 0, x = ?, y = ?, z = ?, heading = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE character_id = ?`,
    [
      placement.zoneId,
      placement.x,
      placement.y,
      placement.z,
      placement.heading,
      characterId,
    ],
  );
  if (updated.affectedRows > 0) return true;

  // A character with no position row has never been placed. Creating one here keeps the
  // hook working for characters made before `character_positions` was populated.
  await runtime.execute(
    `INSERT INTO character_positions
       (character_id, zone_id, instance_id, x, y, z, heading)
     VALUES (?, ?, 0, ?, ?, ?, ?)`,
    [
      characterId,
      placement.zoneId,
      placement.x,
      placement.y,
      placement.z,
      placement.heading,
    ],
  );
  return true;
}
