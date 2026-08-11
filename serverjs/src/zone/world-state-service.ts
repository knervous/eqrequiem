import type { WorldStateRepository } from "../persist/world-state-repository.js";
import {
  EMPTY_WORLD_STATE,
  worldStateView,
  type WorldOccurrenceRecord,
  type WorldOccurrenceState,
  type WorldStateSnapshot,
  type WorldStateView,
} from "./world-state-types.js";

/**
 * The authoritative owner of global world state.
 *
 * One of these exists per server process, above the shards, because the point of a
 * world fact is that every zone agrees on it. Zone workers *consume* published
 * snapshots; they never invent global state of their own, or two shards would quietly
 * disagree about whether the caravan is due.
 *
 * Writes are serialized through a single chain and committed with a compare-and-set on
 * the stored revision, so a lost update surfaces as a retry rather than as a fact that
 * silently reverts.
 */

export interface WorldStateServiceOptions {
  /** Facts written once at startup if the key has never been persisted. */
  readonly defaults?: Readonly<Record<string, unknown>>;
  readonly now?: () => number;
  /** Attempts before a contended fact write gives up. */
  readonly writeAttempts?: number;
}

export type WorldStateListener = (snapshot: WorldStateSnapshot) => void;

export class WorldStateService {
  #snapshot: WorldStateSnapshot = EMPTY_WORLD_STATE;
  #revisions = new Map<string, number>();
  #listeners = new Set<WorldStateListener>();
  #writes: Promise<unknown> = Promise.resolve();
  #started = false;

  constructor(
    private readonly repository: WorldStateRepository,
    private readonly options: WorldStateServiceOptions = {},
  ) {}

  get snapshot(): WorldStateSnapshot {
    return this.#snapshot;
  }

  get started(): boolean {
    return this.#started;
  }

  view(): WorldStateView {
    return worldStateView(this.#snapshot);
  }

  /** Loads persisted state and seeds any default fact that has never been written. */
  async start(): Promise<WorldStateSnapshot> {
    await this.reload();
    for (const [key, value] of Object.entries(this.options.defaults ?? {})) {
      if (this.#revisions.has(key)) continue;
      await this.setFact(key, value);
    }
    this.#started = true;
    return this.#snapshot;
  }

  /** Re-reads everything from persistence. Cheap enough to call on a slow cadence. */
  async reload(): Promise<WorldStateSnapshot> {
    const [facts, occurrences] = await Promise.all([
      this.repository.facts(),
      this.repository.occurrences(["active"]),
    ]);
    const values: Record<string, unknown> = {};
    this.#revisions = new Map();
    for (const fact of facts) {
      values[fact.key] = fact.value;
      this.#revisions.set(fact.key, fact.revision);
    }
    this.#publish({ facts: values, occurrences });
    return this.#snapshot;
  }

  subscribe(listener: WorldStateListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Sets a fact to a literal value, last writer wins among callers in this process. */
  setFact(key: string, value: unknown): Promise<void> {
    return this.updateFact(key, () => value).then(() => undefined);
  }

  /**
   * Reads and writes a fact as one step. The mutator may run more than once when
   * another writer commits in between, so it must be a pure function of its input.
   */
  updateFact<T>(key: string, mutate: (current: T | undefined) => T): Promise<T> {
    return this.#serialize(async () => {
      const attempts = Math.max(1, this.options.writeAttempts ?? 3);
      for (let attempt = 0; attempt < attempts; attempt++) {
        const current = this.#snapshot.facts[key] as T | undefined;
        const next = mutate(current);
        const expected = this.#revisions.get(key) ?? 0;
        const revision = await this.repository.setFact(key, next, expected);
        if (revision !== null) {
          this.#revisions.set(key, revision);
          this.#publish({
            facts: { ...this.#snapshot.facts, [key]: next },
            occurrences: this.#snapshot.occurrences,
          });
          return next;
        }
        // Another writer moved the key. Re-read and let the mutator see the new value.
        await this.reload();
      }
      throw new Error(`world fact ${key} could not be written after ${attempts} attempts`);
    });
  }

  /** Records a new appearance of a situation and publishes it to every shard. */
  beginOccurrence(occurrence: {
    readonly situationKey: string;
    readonly seed: number;
    readonly data?: Readonly<Record<string, unknown>>;
    readonly startedAtMs?: number;
    readonly durationMs?: number | null;
  }): Promise<WorldOccurrenceRecord> {
    return this.#serialize(async () => {
      const startedAtMs = occurrence.startedAtMs ?? this.#now();
      const record = await this.repository.createOccurrence({
        situationKey: occurrence.situationKey,
        seed: occurrence.seed,
        data: occurrence.data ?? {},
        startedAtMs,
        endsAtMs: occurrence.durationMs == null ? null : startedAtMs + occurrence.durationMs,
      });
      this.#publish({
        facts: this.#snapshot.facts,
        occurrences: [...this.#snapshot.occurrences, record],
      });
      return record;
    });
  }

  /**
   * Ends an occurrence. Returns false when it was already terminal, which is the normal
   * outcome of two shards reporting the same resolution.
   */
  closeOccurrence(
    id: number,
    state: Exclude<WorldOccurrenceState, "active"> = "resolved",
  ): Promise<boolean> {
    return this.#serialize(async () => {
      const closed = await this.repository.closeOccurrence(id, state, this.#now());
      if (!closed) return false;
      this.#publish({
        facts: this.#snapshot.facts,
        occurrences: this.#snapshot.occurrences.filter((entry) => entry.id !== id),
      });
      return true;
    });
  }

  mergeOccurrenceData(
    id: number,
    patch: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    return this.#serialize(async () => {
      const current = this.#snapshot.occurrences.find((entry) => entry.id === id);
      if (!current) return;
      const data = { ...current.data, ...patch };
      await this.repository.updateOccurrenceData(id, data);
      this.#publish({
        facts: this.#snapshot.facts,
        occurrences: this.#snapshot.occurrences.map((entry) =>
          entry.id === id ? { ...entry, data } : entry,
        ),
      });
    });
  }

  /** Expires anything whose authored window has passed. Safe to call on a timer. */
  async expireElapsed(nowMs = this.#now()): Promise<readonly WorldOccurrenceRecord[]> {
    const elapsed = this.#snapshot.occurrences.filter(
      (entry) => entry.endsAtMs !== null && entry.endsAtMs <= nowMs,
    );
    const expired: WorldOccurrenceRecord[] = [];
    for (const entry of elapsed) {
      if (await this.closeOccurrence(entry.id, "expired")) expired.push(entry);
    }
    return expired;
  }

  /** Waits for every fact/occurrence mutation admitted before this call. */
  async drain(): Promise<void> {
    await this.#writes;
  }

  #now(): number {
    return this.options.now?.() ?? Date.now();
  }

  #publish(next: {
    readonly facts: Readonly<Record<string, unknown>>;
    readonly occurrences: readonly WorldOccurrenceRecord[];
  }): void {
    this.#snapshot = {
      revision: this.#snapshot.revision + 1,
      facts: next.facts,
      occurrences: next.occurrences,
    };
    for (const listener of this.#listeners) listener(this.#snapshot);
  }

  /** Keeps this process's own writes from interleaving mid compare-and-set. */
  #serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#writes.then(work, work);
    this.#writes = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
