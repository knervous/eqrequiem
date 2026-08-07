import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import type { GameItemRow } from "../backend/item-instance.js";
import {
  LevelCurve,
  type ExperienceAwardResult,
} from "../zone/quest-progression.js";
import type { QuestPersistenceBatch } from "../zone/quest-manager.js";
import type { QuestCharacterSnapshot, QuestStateRecord } from "../zone/quest-state.js";
import type { QuestItemSnapshot } from "../zone/quest-types.js";

/** Canonical general-inventory slots, matching the backend's own layout. */
const GENERAL_SLOTS = [22, 23, 24, 25, 26, 27, 28, 29] as const;
const NOTE_BODY_LIMIT = 500;
const NOTE_LIMIT = 250;

interface CharacterRow extends DatabaseRow {
  id: number;
  name: string;
  level: number;
  experience: number | null;
}

interface QuestStateRow extends DatabaseRow {
  quest_key: string;
  revision: number;
  state_json: string;
}

interface KnowledgeRow extends DatabaseRow {
  knowledge_key: string;
  data_json: string;
}

interface JournalNoteRow extends DatabaseRow {
  id: number;
  source: string;
  body: string;
  zone_id: number | null;
  x: number | null;
  y: number | null;
  z: number | null;
  pinned: number;
}

/** Something the player chose to remember, in their own words or an NPC's. */
export interface CharacterJournalNote {
  readonly id: number;
  readonly source: string;
  readonly body: string;
  readonly pinned: boolean;
  readonly place: {
    readonly zoneId: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null;
}

interface InventoryRow extends DatabaseRow {
  bag: number;
  slot: number;
  item_id: number;
  quantity: number;
  charges: number;
}

/**
 * The persistence boundary for everything a character carries between sessions:
 * private quest state, learned knowledge and cumulative experience.
 *
 * Handlers never touch this class. The shard loads a snapshot when the character
 * enters, runs synchronously against it, and commits drained batches here.
 */
export class CharacterProgressRepository {
  #curve: LevelCurve | null = null;

  constructor(
    private readonly runtime: DatabaseBackend,
    private readonly content: DatabaseBackend = runtime,
    private readonly contentPrefix = "",
  ) {}

  /** Content-authored curve, falling back to the built-in default when unseeded. */
  async curve(): Promise<LevelCurve> {
    if (this.#curve) return this.#curve;
    try {
      const rows = (
        await this.content.query<{ level: number; cumulative_experience: number }>(
          `SELECT level, cumulative_experience FROM ${this.contentPrefix}level_experience_curve
           ORDER BY level`,
        )
      ).rows;
      this.#curve = rows.length > 0
        ? new LevelCurve(rows.map((row) => ({
            level: Number(row.level),
            cumulativeExperience: Number(row.cumulative_experience),
          })))
        : LevelCurve.default();
    } catch {
      // A prebuilt content database predating the curve table is not an error.
      this.#curve = LevelCurve.default();
    }
    return this.#curve;
  }

  async load(characterId: number): Promise<QuestCharacterSnapshot | null> {
    const character = (
      await this.runtime.query<CharacterRow>(
        "SELECT id, name, level, experience FROM characters WHERE id = ? LIMIT 1",
        [characterId],
      )
    ).rows[0];
    if (!character) return null;
    const [quests, knowledge, inventory] = await Promise.all([
      this.questStates(characterId),
      this.knowledge(characterId),
      this.inventory(characterId),
    ]);
    return {
      characterId: Number(character.id),
      name: String(character.name),
      level: Number(character.level ?? 1),
      experience: Number(character.experience ?? 0),
      quests,
      knowledge,
      inventory,
    };
  }

  async commit(batch: QuestPersistenceBatch): Promise<void> {
    if (
      batch.quests.length === 0
      && batch.knowledgeLearned.length === 0
      && batch.knowledgeForgotten.length === 0
    ) return;
    await this.runtime.transaction(async (transaction) => {
      for (const quest of batch.quests) {
        const stateJson = JSON.stringify(quest.state);
        const updated = await transaction.execute(
          `UPDATE character_quest_state
           SET revision = ?, state_json = ?, updated_at = CURRENT_TIMESTAMP
           WHERE character_id = ? AND quest_key = ?`,
          [quest.revision, stateJson, batch.characterId, quest.questKey],
        );
        if (Number(updated.affectedRows ?? 0) > 0) continue;
        await transaction.execute(
          `INSERT INTO character_quest_state (character_id, quest_key, revision, state_json)
           VALUES (?, ?, ?, ?)`,
          [batch.characterId, quest.questKey, quest.revision, stateJson],
        );
      }
      for (const fact of batch.knowledgeLearned) {
        await transaction.execute(
          `INSERT INTO character_knowledge (character_id, knowledge_key, data_json)
           VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
          [batch.characterId, fact.key, JSON.stringify(fact.data ?? {})],
        );
      }
      for (const key of batch.knowledgeForgotten) {
        await transaction.execute(
          "DELETE FROM character_knowledge WHERE character_id = ? AND knowledge_key = ?",
          [batch.characterId, key],
        );
      }
    });
  }

  /**
   * The single authoritative experience path. Level is derived from cumulative XP by
   * the curve, so no caller can drift the two apart.
   */
  async awardExperience(
    characterId: number,
    amount: number,
  ): Promise<ExperienceAwardResult | null> {
    const curve = await this.curve();
    const gained = Math.max(0, Math.trunc(amount));
    return this.runtime.transaction(async (transaction) => {
      // Relative increment inside a transaction: a kill landing while a quest beat
      // resolves must not lose one of the two awards to a read-modify-write race.
      const updated = await transaction.execute(
        "UPDATE characters SET experience = experience + ? WHERE id = ?",
        [gained, characterId],
      );
      if (Number(updated.affectedRows ?? 0) === 0) return null;
      const row = (
        await transaction.query<CharacterRow>(
          "SELECT id, name, level, experience FROM characters WHERE id = ? LIMIT 1",
          [characterId],
        )
      ).rows[0];
      if (!row) return null;
      const experience = Number(row.experience ?? 0);
      const result = curve.award(
        { experience: experience - gained, level: Number(row.level ?? 1) },
        gained,
      );
      if (result.level !== Number(row.level ?? 1)) {
        await transaction.execute(
          "UPDATE characters SET level = ? WHERE id = ?",
          [result.level, characterId],
        );
      }
      return result;
    });
  }

  /**
   * Places an item in the first free general slot. Returns the stored row so the
   * caller can tell the client, or null when there is nowhere to put it.
   */
  async grantItem(
    characterId: number,
    itemId: number,
    quantity = 1,
  ): Promise<{ readonly slot: number; readonly bag: number; readonly itemId: number } | null> {
    const occupied = new Set(
      (
        await this.runtime.query<{ slot: number }>(
          "SELECT slot FROM player_inventory WHERE character_id = ? AND bag = 0",
          [characterId],
        )
      ).rows.map((row) => Number(row.slot)),
    );
    const slot = GENERAL_SLOTS.find((candidate) => !occupied.has(candidate));
    if (slot === undefined) return null;
    await this.runtime.execute(
      `INSERT INTO player_inventory (character_id, bag, slot, item_id, quantity)
       VALUES (?, 0, ?, ?, ?)`,
      [characterId, slot, itemId, Math.max(1, quantity)],
    );
    return { slot, bag: 0, itemId };
  }

  /** Content row for an item, so every transport encodes the same instance. */
  async itemRow(itemId: number): Promise<GameItemRow | null> {
    try {
      return (
        await this.content.query<GameItemRow>(
          `SELECT * FROM ${this.contentPrefix}items WHERE id = ? LIMIT 1`,
          [itemId],
        )
      ).rows[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Player-authored note writes. One implementation for every transport. */
  async addNote(
    characterId: number,
    note: {
      readonly body: string;
      readonly source?: string;
      readonly place?: {
        readonly zoneId: number;
        readonly x: number;
        readonly y: number;
        readonly z: number;
      } | null;
    },
  ): Promise<void> {
    const body = note.body.trim().slice(0, NOTE_BODY_LIMIT);
    if (!body) return;
    const existing = (
      await this.runtime.query<{ total: number }>(
        "SELECT COUNT(*) AS total FROM character_journal_notes WHERE character_id = ?",
        [characterId],
      )
    ).rows[0];
    // A journal is memory, not a log; refuse to grow without bound.
    if (Number(existing?.total ?? 0) >= NOTE_LIMIT) return;
    await this.runtime.execute(
      `INSERT INTO character_journal_notes
       (character_id, source, body, zone_id, x, y, z)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        characterId,
        (note.source ?? "").slice(0, 120),
        body,
        note.place?.zoneId ?? null,
        note.place?.x ?? null,
        note.place?.y ?? null,
        note.place?.z ?? null,
      ],
    );
  }

  async removeNote(characterId: number, noteId: number): Promise<void> {
    await this.runtime.execute(
      "DELETE FROM character_journal_notes WHERE id = ? AND character_id = ?",
      [noteId, characterId],
    );
  }

  async pinNote(characterId: number, noteId: number, pinned: boolean): Promise<void> {
    await this.runtime.execute(
      "UPDATE character_journal_notes SET pinned = ? WHERE id = ? AND character_id = ?",
      [pinned ? 1 : 0, noteId, characterId],
    );
  }

  /** Where the character currently stands, for notes that keep a place. */
  async position(characterId: number): Promise<{
    readonly zoneId: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  } | null> {
    const row = (
      await this.runtime.query<{ zone_id: number; x: number; y: number; z: number }>(
        "SELECT zone_id, x, y, z FROM character_positions WHERE character_id = ? LIMIT 1",
        [characterId],
      )
    ).rows[0];
    return row
      ? {
          zoneId: Number(row.zone_id),
          x: Number(row.x),
          y: Number(row.y),
          z: Number(row.z),
        }
      : null;
  }

  /** Reads progression without mutating it, for profile and meter bootstrap. */
  async progress(characterId: number): Promise<ExperienceAwardResult | null> {
    const curve = await this.curve();
    const row = (
      await this.runtime.query<CharacterRow>(
        "SELECT id, name, level, experience FROM characters WHERE id = ? LIMIT 1",
        [characterId],
      )
    ).rows[0];
    if (!row) return null;
    return curve.award(
      { experience: Number(row.experience ?? 0), level: Number(row.level ?? 1) },
      0,
    );
  }

  /** Player-authored journal notes, pinned first, newest last. */
  async notes(characterId: number): Promise<readonly CharacterJournalNote[]> {
    try {
      const rows = (
        await this.runtime.query<JournalNoteRow>(
          `SELECT id, source, body, zone_id, x, y, z, pinned
           FROM character_journal_notes WHERE character_id = ?
           ORDER BY pinned DESC, id`,
          [characterId],
        )
      ).rows;
      return rows.map((row) => ({
        id: Number(row.id),
        source: String(row.source ?? ""),
        body: String(row.body ?? ""),
        pinned: Number(row.pinned ?? 0) === 1,
        place: row.zone_id === null || row.zone_id === undefined
          ? null
          : {
              zoneId: Number(row.zone_id),
              x: Number(row.x ?? 0),
              y: Number(row.y ?? 0),
              z: Number(row.z ?? 0),
            },
      }));
    } catch {
      // A runtime database predating the notes table simply has no notes.
      return [];
    }
  }

  private async questStates(
    characterId: number,
  ): Promise<Record<string, QuestStateRecord>> {
    const rows = (
      await this.runtime.query<QuestStateRow>(
        "SELECT quest_key, revision, state_json FROM character_quest_state WHERE character_id = ?",
        [characterId],
      )
    ).rows;
    const states: Record<string, QuestStateRecord> = {};
    for (const row of rows) {
      states[String(row.quest_key)] = {
        revision: Number(row.revision ?? 0),
        state: parseObject(row.state_json),
      };
    }
    return states;
  }

  private async knowledge(
    characterId: number,
  ): Promise<Record<string, Record<string, unknown>>> {
    try {
      const rows = (
        await this.runtime.query<KnowledgeRow>(
          "SELECT knowledge_key, data_json FROM character_knowledge WHERE character_id = ?",
          [characterId],
        )
      ).rows;
      const knowledge: Record<string, Record<string, unknown>> = {};
      for (const row of rows) {
        knowledge[String(row.knowledge_key)] = parseObject(row.data_json);
      }
      return knowledge;
    } catch {
      return {};
    }
  }

  private async inventory(characterId: number): Promise<QuestItemSnapshot[]> {
    const rows = (
      await this.runtime.query<InventoryRow>(
        "SELECT bag, slot, item_id, quantity, charges FROM player_inventory WHERE character_id = ?",
        [characterId],
      )
    ).rows;
    if (rows.length === 0) return [];
    const names = await this.itemNames([...new Set(rows.map((row) => Number(row.item_id)))]);
    return rows.map((row) => ({
      id: Number(row.item_id),
      name: names.get(Number(row.item_id)) ?? `Item ${Number(row.item_id)}`,
      slot: Number(row.slot),
      quantity: Math.max(1, Number(row.quantity ?? 1)),
      charges: Number(row.charges ?? 0),
    }));
  }

  private async itemNames(ids: readonly number[]): Promise<Map<number, string>> {
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    try {
      const rows = (
        await this.content.query<{ id: number; name: string }>(
          `SELECT id, name FROM ${this.contentPrefix}items WHERE id IN (${placeholders})`,
          [...ids],
        )
      ).rows;
      return new Map(rows.map((row) => [Number(row.id), String(row.name)]));
    } catch {
      return new Map();
    }
  }
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
