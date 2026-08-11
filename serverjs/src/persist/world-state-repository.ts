import type { DatabaseBackend, DatabaseRow } from "../db/backend.js";
import type {
  WorldFactRecord,
  WorldOccurrenceRecord,
  WorldOccurrenceState,
} from "../zone/world-state-types.js";

interface FactRow extends DatabaseRow {
  fact_key: string;
  value_json: string;
  revision: number | bigint;
}

interface OccurrenceRow extends DatabaseRow {
  id: number | bigint;
  situation_key: string;
  state: string;
  seed: number | bigint;
  data_json: string;
  started_at: string | number;
  ends_at: string | number | null;
  resolved_at: string | number | null;
}

/**
 * Persistence port for global world state.
 *
 * Facts are versioned per key so a compare-and-set can reject a stale write without
 * locking the whole table; the service above owns the retry policy. Occurrences are
 * append-only rows that transition state, never delete, because a resolved occurrence
 * is what proves a player already claimed that appearance of a situation.
 */
export class WorldStateRepository {
  constructor(private readonly runtime: DatabaseBackend) {}

  async facts(): Promise<WorldFactRecord[]> {
    const result = await this.runtime.query<FactRow>(
      "SELECT fact_key, value_json, revision FROM world_facts",
    );
    return result.rows.map((row) => ({
      key: row.fact_key,
      value: parseJson(row.value_json),
      revision: Number(row.revision),
    }));
  }

  /**
   * Writes a fact and returns its new revision, or null when `expectedRevision` no
   * longer matches what is stored.
   */
  async setFact(
    key: string,
    value: unknown,
    expectedRevision: number | null = null,
  ): Promise<number | null> {
    const encoded = JSON.stringify(value ?? null);
    const existing = await this.runtime.query<FactRow>(
      "SELECT fact_key, value_json, revision FROM world_facts WHERE fact_key = ?",
      [key],
    );
    const current = existing.rows[0];
    if (!current) {
      if (expectedRevision !== null && expectedRevision !== 0) return null;
      await this.runtime.execute(
        "INSERT INTO world_facts (fact_key, value_json, revision) VALUES (?, ?, 1)",
        [key, encoded],
      );
      return 1;
    }
    const revision = Number(current.revision);
    if (expectedRevision !== null && expectedRevision !== revision) return null;
    const next = revision + 1;
    const updated = await this.runtime.execute(
      "UPDATE world_facts SET value_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP WHERE fact_key = ? AND revision = ?",
      [encoded, next, key, revision],
    );
    // A zero-row update means another writer won the race between the read and here.
    if (updated.affectedRows === 0) return null;
    return next;
  }

  async occurrences(
    states: readonly WorldOccurrenceState[] = ["active"],
  ): Promise<WorldOccurrenceRecord[]> {
    if (states.length === 0) return [];
    const placeholders = states.map(() => "?").join(", ");
    const result = await this.runtime.query<OccurrenceRow>(
      `SELECT id, situation_key, state, seed, data_json, started_at, ends_at, resolved_at
       FROM world_situation_occurrences WHERE state IN (${placeholders})
       ORDER BY started_at, id`,
      [...states],
    );
    return result.rows.map(toOccurrence);
  }

  /** The most recent occurrence of each situation, whatever its state. Feeds cooldowns. */
  async latestBySituation(): Promise<WorldOccurrenceRecord[]> {
    const result = await this.runtime.query<OccurrenceRow>(
      `SELECT o.id, o.situation_key, o.state, o.seed, o.data_json, o.started_at, o.ends_at, o.resolved_at
       FROM world_situation_occurrences o
       JOIN (SELECT situation_key, MAX(id) AS id FROM world_situation_occurrences GROUP BY situation_key) latest
         ON latest.id = o.id`,
    );
    return result.rows.map(toOccurrence);
  }

  async createOccurrence(occurrence: {
    readonly situationKey: string;
    readonly seed: number;
    readonly data: Readonly<Record<string, unknown>>;
    readonly startedAtMs: number;
    readonly endsAtMs: number | null;
  }): Promise<WorldOccurrenceRecord> {
    await this.runtime.execute(
      `INSERT INTO world_situation_occurrences
       (situation_key, state, seed, data_json, started_at, ends_at)
       VALUES (?, 'active', ?, ?, ?, ?)`,
      [
        occurrence.situationKey,
        occurrence.seed,
        JSON.stringify(occurrence.data ?? {}),
        new Date(occurrence.startedAtMs).toISOString(),
        occurrence.endsAtMs === null ? null : new Date(occurrence.endsAtMs).toISOString(),
      ],
    );
    const result = await this.runtime.query<OccurrenceRow>(
      `SELECT id, situation_key, state, seed, data_json, started_at, ends_at, resolved_at
       FROM world_situation_occurrences WHERE situation_key = ?
       ORDER BY id DESC LIMIT 1`,
      [occurrence.situationKey],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`world occurrence insert did not persist: ${occurrence.situationKey}`);
    return toOccurrence(row);
  }

  /** Transitions an active occurrence. Returns false if it was already terminal. */
  async closeOccurrence(
    id: number,
    state: Exclude<WorldOccurrenceState, "active">,
    atMs: number,
  ): Promise<boolean> {
    const result = await this.runtime.execute(
      `UPDATE world_situation_occurrences SET state = ?, resolved_at = ?
       WHERE id = ? AND state = 'active'`,
      [state, new Date(atMs).toISOString(), id],
    );
    return result.affectedRows > 0;
  }

  async updateOccurrenceData(
    id: number,
    data: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.runtime.execute(
      "UPDATE world_situation_occurrences SET data_json = ? WHERE id = ?",
      [JSON.stringify(data ?? {}), id],
    );
  }
}

function toOccurrence(row: OccurrenceRow): WorldOccurrenceRecord {
  const data = parseJson(row.data_json);
  return {
    id: Number(row.id),
    situationKey: row.situation_key,
    state: normalizeState(row.state),
    seed: Number(row.seed),
    data: (data && typeof data === "object" ? data : {}) as Record<string, unknown>,
    startedAtMs: toMillis(row.started_at) ?? 0,
    endsAtMs: toMillis(row.ends_at),
    resolvedAtMs: toMillis(row.resolved_at),
  };
}

function normalizeState(state: string): WorldOccurrenceState {
  return state === "resolved" || state === "expired" ? state : "active";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toMillis(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
