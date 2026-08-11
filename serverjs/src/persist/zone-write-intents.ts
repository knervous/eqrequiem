import type { DatabaseBackend } from "../db/backend.js";
import { CharacterProgressRepository } from "../progression/character-progress-repository.js";
import type { QuestPersistenceBatch } from "../zone/quest-manager.js";

/** Ordered, replayable writes that may wait for the short scheduler cadence. */
export type ZoneDeferredWrite =
  | {
      readonly kind: "xp_award";
      readonly amount: number;
      readonly resultingLevel: number;
    }
  | {
      readonly kind: "quest_commit";
      readonly batch: QuestPersistenceBatch;
    };

export type ZoneCoalesceKey = "position";
export interface ZonePositionWrite {
  readonly zoneId: number;
  readonly instanceId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly heading: number | null;
}

/** Applies one intent inside the scheduler's existing per-character transaction. */
export async function writeZoneDeferredIntent(
  database: DatabaseBackend,
  characterId: number,
  intent: ZoneDeferredWrite,
): Promise<void> {
  switch (intent.kind) {
    case "xp_award":
      await database.execute(
        `UPDATE characters
         SET experience = experience + ?,
             level = CASE WHEN level < ? THEN ? ELSE level END
         WHERE id = ?`,
        [
          Math.max(0, Math.trunc(intent.amount)),
          intent.resultingLevel,
          intent.resultingLevel,
          characterId,
        ],
      );
      return;
    case "quest_commit":
      if (intent.batch.characterId !== characterId) {
        throw new Error("quest batch character does not match scheduler key");
      }
      await new CharacterProgressRepository(database)
        .commitInTransaction(intent.batch);
  }
}

/** Shared live/offline statement for the latest durable character position. */
export async function writeZoneCoalescedIntent(
  database: DatabaseBackend,
  characterId: number,
  key: ZoneCoalesceKey,
  position: ZonePositionWrite,
): Promise<void> {
  if (key !== "position") throw new Error(`unknown coalesced write ${key}`);
  await database.execute(
    `UPDATE character_positions
     SET zone_id = ?, instance_id = ?, x = ?, y = ?, z = ?,
         heading = COALESCE(?, heading), updated_at = CURRENT_TIMESTAMP
     WHERE character_id = ?`,
    [
      position.zoneId,
      position.instanceId,
      position.x,
      position.y,
      position.z,
      position.heading,
      characterId,
    ],
  );
}
