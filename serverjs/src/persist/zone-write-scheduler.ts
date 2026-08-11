import type { DatabaseBackend } from "../db/backend.js";

export type ZoneWriteSchedulerState = "open" | "draining" | "drained";

/**
 * The statement layer for queued writes. Intents are inert data; these two stable
 * handlers are the only code retained by the scheduler.
 */
export interface ZoneWriteHandlers<
  DeferredIntent extends { readonly kind: string },
  CoalescedIntent,
  CoalesceKey extends string = string,
> {
  writeDeferred(
    database: DatabaseBackend,
    characterId: number,
    intent: DeferredIntent,
  ): Promise<void>;
  writeCoalesced(
    database: DatabaseBackend,
    characterId: number,
    key: CoalesceKey,
    intent: CoalescedIntent,
  ): Promise<void>;
}

export interface ZoneWriteSchedulerOptions {
  /** Short cadence for ordered, deferrable work. Set to false for checkpoint-only. */
  readonly deferredFlushMs?: number | false;
  /** Broad cadence for last-write-wins work. Set to false for logout/zone/shutdown only. */
  readonly coalescedFlushMs?: number | false;
  /** Flush a character as soon as its ordered queue reaches this size. */
  readonly deferredQueueLimit?: number;
}

const DEFAULT_DEFERRED_FLUSH_MS = 250;
const DEFAULT_COALESCED_FLUSH_MS = 30_000;
const DEFAULT_DEFERRED_QUEUE_LIMIT = 100;

type Timer = ReturnType<typeof setTimeout>;
type FlushCategory = "deferred" | "coalesced" | "both";

/**
 * Per-runtime write admission and ordering boundary. A scheduler must span shards so a
 * character cannot acquire two independent write lanes while zoning.
 *
 * Critical work is deliberately a closure because the caller awaits its result.
 * Deferred and coalesced work is stored only as typed data, making pending work
 * inspectable and independent of a zone session's lifetime.
 */
export class ZoneWriteScheduler<
  DeferredIntent extends { readonly kind: string },
  CoalescedIntent,
  CoalesceKey extends string = string,
> {
  readonly #deferredFlushMs: number | false;
  readonly #coalescedFlushMs: number | false;
  readonly #deferredQueueLimit: number;

  readonly #chains = new Map<number, Promise<void>>();
  #sqliteTransactionTail: Promise<void> = Promise.resolve();
  readonly #deferred = new Map<number, DeferredIntent[]>();
  readonly #coalesced = new Map<number, Map<CoalesceKey, CoalescedIntent>>();

  #deferredTimer: Timer | null = null;
  #coalescedTimer: Timer | null = null;
  #state: ZoneWriteSchedulerState = "open";
  #drainPromise: Promise<void> | null = null;

  constructor(
    private readonly runtime: DatabaseBackend,
    private readonly handlers: ZoneWriteHandlers<
      DeferredIntent,
      CoalescedIntent,
      CoalesceKey
    >,
    options: ZoneWriteSchedulerOptions = {},
  ) {
    this.#deferredFlushMs = interval(
      options.deferredFlushMs,
      DEFAULT_DEFERRED_FLUSH_MS,
      "deferredFlushMs",
    );
    this.#coalescedFlushMs = interval(
      options.coalescedFlushMs,
      DEFAULT_COALESCED_FLUSH_MS,
      "coalescedFlushMs",
    );
    this.#deferredQueueLimit = positiveInteger(
      options.deferredQueueLimit ?? DEFAULT_DEFERRED_QUEUE_LIMIT,
      "deferredQueueLimit",
    );
  }

  get state(): ZoneWriteSchedulerState {
    return this.#state;
  }

  /** Run blocking work transactionally and in character order. */
  critical<T>(
    characterId: number,
    operation: string,
    work: (transaction: DatabaseBackend) => Promise<T>,
  ): Promise<T> {
    if (this.#state !== "open") return Promise.reject(this.#closedError());
    validateCharacterId(characterId);
    if (!operation) return Promise.reject(new TypeError("operation must not be empty"));

    return this.#enqueue(characterId, async () => {
      // A blocking operation must never observe stale ordered state.
      await this.#flushCharacter(characterId, "deferred");
      return this.#transaction(work);
    });
  }

  /** Queue ordered data for the next short flush or explicit checkpoint. */
  defer(characterId: number, intent: DeferredIntent): void {
    this.#assertOpen();
    validateCharacterId(characterId);
    const queue = this.#deferred.get(characterId) ?? [];
    queue.push(intent);
    this.#deferred.set(characterId, queue);

    if (queue.length >= this.#deferredQueueLimit) {
      void this.#backgroundFlushCharacter(characterId, "deferred");
    } else {
      this.#ensureDeferredTimer();
    }
  }

  /** Replace a last-write-wins value without scheduling it on the short timer. */
  coalesce(
    characterId: number,
    key: CoalesceKey,
    intent: CoalescedIntent,
  ): void {
    this.#assertOpen();
    validateCharacterId(characterId);
    const pending = this.#coalesced.get(characterId) ?? new Map();
    pending.set(key, intent);
    this.#coalesced.set(characterId, pending);
    this.#ensureCoalescedTimer();
  }

  /** Flush both ordered and last-write-wins data for a zone/logout checkpoint. */
  flush(characterId: number): Promise<void> {
    validateCharacterId(characterId);
    return this.#enqueue(characterId, () =>
      this.#flushCharacter(characterId, "both"),
    );
  }

  /**
   * Stop accepting work, wait behind every admitted critical write, and persist all
   * queued data. If persistence fails, drain rejects and may be called again to retry.
   */
  drain(): Promise<void> {
    if (this.#state === "drained") return Promise.resolve();
    if (this.#drainPromise) return this.#drainPromise;
    this.#state = "draining";
    this.#clearTimers();

    const draining = this.#performDrain();
    this.#drainPromise = draining;
    void draining.then(
      () => {
        this.#state = "drained";
        this.#drainPromise = null;
      },
      () => {
        // Admission remains closed, but an explicit second drain can retry.
        this.#drainPromise = null;
      },
    );
    return draining;
  }

  async #performDrain(): Promise<void> {
    const characterIds = new Set([
      ...this.#chains.keys(),
      ...this.#deferred.keys(),
      ...this.#coalesced.keys(),
    ]);
    const results = await Promise.allSettled(
      [...characterIds].map((characterId) => this.flush(characterId)),
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }

  #enqueue<T>(characterId: number, work: () => Promise<T>): Promise<T> {
    const previous = this.#chains.get(characterId) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#chains.set(characterId, tail);
    void tail.then(() => {
      if (this.#chains.get(characterId) === tail) {
        this.#chains.delete(characterId);
      }
    });
    return result;
  }

  async #flushCharacter(
    characterId: number,
    category: FlushCategory,
  ): Promise<void> {
    const deferred = category === "coalesced"
      ? []
      : (this.#deferred.get(characterId) ?? []);
    const coalesced = category === "deferred"
      ? new Map<CoalesceKey, CoalescedIntent>()
      : (this.#coalesced.get(characterId) ?? new Map());

    if (deferred.length === 0 && coalesced.size === 0) return;
    if (deferred.length > 0) this.#deferred.delete(characterId);
    if (coalesced.size > 0) this.#coalesced.delete(characterId);

    try {
      await this.#transaction(async (transaction) => {
        for (const intent of deferred) {
          await this.handlers.writeDeferred(transaction, characterId, intent);
        }
        for (const [key, intent] of coalesced) {
          await this.handlers.writeCoalesced(
            transaction,
            characterId,
            key,
            intent,
          );
        }
      });
    } catch (error) {
      this.#restore(characterId, deferred, coalesced);
      throw error;
    } finally {
      if (this.#state === "open") this.#ensureTimersForPendingWork();
    }
  }

  #restore(
    characterId: number,
    deferred: DeferredIntent[],
    coalesced: Map<CoalesceKey, CoalescedIntent>,
  ): void {
    if (deferred.length > 0) {
      const newer = this.#deferred.get(characterId) ?? [];
      this.#deferred.set(characterId, [...deferred, ...newer]);
    }
    if (coalesced.size > 0) {
      const newer = this.#coalesced.get(characterId) ?? new Map();
      // A value queued while the failed transaction ran is newer and must win.
      for (const [key, intent] of coalesced) {
        if (!newer.has(key)) newer.set(key, intent);
      }
      this.#coalesced.set(characterId, newer);
    }
  }

  /** SQLite exposes one connection, so independent character lanes share its BEGIN. */
  #transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    if (this.runtime.dialect !== "sqlite") return this.runtime.transaction(work);
    const result = this.#sqliteTransactionTail.then(() =>
      this.runtime.transaction(work)
    );
    this.#sqliteTransactionTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async #backgroundFlushCharacter(
    characterId: number,
    category: Exclude<FlushCategory, "both">,
  ): Promise<void> {
    try {
      await this.#enqueue(characterId, () =>
        this.#flushCharacter(characterId, category),
      );
    } catch {
      // The data was restored. An explicit checkpoint/drain can surface the error.
    }
  }

  async #backgroundFlushAll(
    category: Exclude<FlushCategory, "both">,
  ): Promise<void> {
    const source = category === "deferred" ? this.#deferred : this.#coalesced;
    await Promise.all(
      [...source.keys()].map((characterId) =>
        this.#backgroundFlushCharacter(characterId, category),
      ),
    );
  }

  #ensureTimersForPendingWork(): void {
    if (this.#deferred.size > 0) this.#ensureDeferredTimer();
    if (this.#coalesced.size > 0) this.#ensureCoalescedTimer();
  }

  #ensureDeferredTimer(): void {
    if (
      this.#state !== "open"
      || this.#deferredFlushMs === false
      || this.#deferredTimer
    ) return;
    this.#deferredTimer = unrefTimer(setTimeout(() => {
      this.#deferredTimer = null;
      void this.#backgroundFlushAll("deferred");
    }, this.#deferredFlushMs));
  }

  #ensureCoalescedTimer(): void {
    if (
      this.#state !== "open"
      || this.#coalescedFlushMs === false
      || this.#coalescedTimer
    ) return;
    this.#coalescedTimer = unrefTimer(setTimeout(() => {
      this.#coalescedTimer = null;
      void this.#backgroundFlushAll("coalesced");
    }, this.#coalescedFlushMs));
  }

  #clearTimers(): void {
    if (this.#deferredTimer) clearTimeout(this.#deferredTimer);
    if (this.#coalescedTimer) clearTimeout(this.#coalescedTimer);
    this.#deferredTimer = null;
    this.#coalescedTimer = null;
  }

  #assertOpen(): void {
    if (this.#state !== "open") throw this.#closedError();
  }

  #closedError(): Error {
    return new Error(`zone write scheduler is ${this.#state}`);
  }
}

function validateCharacterId(characterId: number): void {
  if (!Number.isSafeInteger(characterId) || characterId <= 0) {
    throw new TypeError("characterId must be a positive safe integer");
  }
}

function interval(
  configured: number | false | undefined,
  fallback: number,
  name: string,
): number | false {
  if (configured === false) return false;
  const value = configured ?? fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number or false`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function unrefTimer(timer: Timer): Timer {
  const unref = (timer as { unref?: () => void }).unref;
  if (typeof unref === "function") unref.call(timer);
  return timer;
}
