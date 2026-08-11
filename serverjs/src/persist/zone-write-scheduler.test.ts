import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  DatabaseBackend,
  DatabaseDialect,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../db/backend.js";
import {
  ZoneWriteScheduler,
  type ZoneWriteHandlers,
} from "./zone-write-scheduler.js";

type DeferredIntent = {
  readonly kind: "event";
  readonly value: string;
};
type CoalescedIntent = { readonly value: string };
type CoalesceKey = "position" | "snapshot";

describe("ZoneWriteScheduler", () => {
  it("serializes critical transactions per character without blocking another character", async () => {
    const database = new CaptureBackend();
    const scheduler = createScheduler(database);
    const firstGate = deferred<void>();
    const firstStarted = deferred<void>();
    const events: string[] = [];

    const first = scheduler.critical(1, "first", async () => {
      events.push("first:start");
      firstStarted.resolve();
      await firstGate.promise;
      events.push("first:end");
    });
    const second = scheduler.critical(1, "second", async () => {
      events.push("second");
    });
    const otherCharacter = scheduler.critical(2, "other", async () => {
      events.push("other");
    });

    await firstStarted.promise;
    await otherCharacter;
    assert.deepEqual(events, ["first:start", "other"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(events, ["first:start", "other", "first:end", "second"]);
    assert.equal(database.transactionCount, 3);
    await scheduler.drain();
  });

  it("serializes transactions across characters on a single SQLite connection", async () => {
    const database = new CaptureBackend("sqlite");
    const scheduler = createScheduler(database);
    const firstGate = deferred<void>();
    const firstStarted = deferred<void>();
    const events: string[] = [];

    const first = scheduler.critical(1, "first", async () => {
      events.push("first:start");
      firstStarted.resolve();
      await firstGate.promise;
      events.push("first:end");
    });
    const second = scheduler.critical(2, "second", async () => {
      events.push("second");
    });
    await firstStarted.promise;
    await Promise.resolve();
    assert.deepEqual(events, ["first:start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(events, ["first:start", "first:end", "second"]);
    await scheduler.drain();
  });

  it("flushes ordered intents in one transaction before a critical write", async () => {
    const database = new CaptureBackend();
    const events: string[] = [];
    const scheduler = createScheduler(database, {
      deferred: (characterId, intent) => {
        events.push(`deferred:${characterId}:${intent.value}`);
      },
    });

    scheduler.defer(7, { kind: "event", value: "one" });
    scheduler.defer(7, { kind: "event", value: "two" });
    await scheduler.critical(7, "item_move", async () => {
      events.push("critical");
    });

    assert.deepEqual(events, ["deferred:7:one", "deferred:7:two", "critical"]);
    assert.equal(database.transactionCount, 2);
    await scheduler.drain();
  });

  it("keeps the short deferred timer separate from broad coalescing", async () => {
    const database = new CaptureBackend();
    const deferredWritten = deferred<void>();
    const coalesced: string[] = [];
    const scheduler = createScheduler(
      database,
      {
        deferred: () => deferredWritten.resolve(),
        coalesced: (_characterId, key, intent) => {
          coalesced.push(`${key}:${intent.value}`);
        },
      },
      { deferredFlushMs: 5, coalescedFlushMs: 10_000 },
    );

    scheduler.defer(3, { kind: "event", value: "xp" });
    scheduler.coalesce(3, "position", { value: "latest" });
    await deferredWritten.promise;
    assert.deepEqual(coalesced, []);

    await scheduler.flush(3);
    assert.deepEqual(coalesced, ["position:latest"]);
    await scheduler.drain();
  });

  it("does not turn a critical operation into a position checkpoint", async () => {
    const database = new CaptureBackend();
    const events: string[] = [];
    const scheduler = createScheduler(database, {
      coalesced: () => events.push("position"),
    });

    scheduler.coalesce(3, "position", { value: "latest" });
    await scheduler.critical(3, "item_move", async () => {
      events.push("critical");
    });
    assert.deepEqual(events, ["critical"]);

    await scheduler.flush(3);
    assert.deepEqual(events, ["critical", "position"]);
    await scheduler.drain();
  });

  it("supports checkpoint-only coalescing and retains only the latest value per key", async () => {
    const database = new CaptureBackend();
    const writes: string[] = [];
    const scheduler = createScheduler(
      database,
      {
        coalesced: (_characterId, key, intent) => {
          writes.push(`${key}:${intent.value}`);
        },
      },
      { deferredFlushMs: false, coalescedFlushMs: false },
    );

    scheduler.coalesce(9, "position", { value: "old" });
    scheduler.coalesce(9, "snapshot", { value: "snapshot" });
    scheduler.coalesce(9, "position", { value: "new" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(writes, []);

    await scheduler.flush(9);
    assert.deepEqual(writes, ["position:new", "snapshot:snapshot"]);
    assert.equal(database.transactionCount, 1);
    await scheduler.drain();
  });

  it("flushes at the configured queue limit", async () => {
    const database = new CaptureBackend();
    const written = deferred<void>();
    const values: string[] = [];
    const scheduler = createScheduler(
      database,
      {
        deferred: (_characterId, intent) => {
          values.push(intent.value);
          if (values.length === 2) written.resolve();
        },
      },
      { deferredFlushMs: false, deferredQueueLimit: 2 },
    );

    scheduler.defer(4, { kind: "event", value: "one" });
    scheduler.defer(4, { kind: "event", value: "two" });
    await written.promise;
    assert.deepEqual(values, ["one", "two"]);
    assert.equal(database.transactionCount, 1);
    await scheduler.drain();
  });

  it("restores a failed batch for an explicit retry", async () => {
    const database = new CaptureBackend();
    const writes: string[] = [];
    let fail = true;
    const scheduler = createScheduler(
      database,
      {
        deferred: (_characterId, intent) => {
          if (fail) throw new Error("database unavailable");
          writes.push(`deferred:${intent.value}`);
        },
        coalesced: (_characterId, key, intent) => {
          writes.push(`${key}:${intent.value}`);
        },
      },
      { deferredFlushMs: false, coalescedFlushMs: false },
    );
    scheduler.defer(5, { kind: "event", value: "kept" });
    scheduler.coalesce(5, "position", { value: "kept" });

    await assert.rejects(scheduler.flush(5), /database unavailable/);
    fail = false;
    await scheduler.flush(5);
    assert.deepEqual(writes, ["deferred:kept", "position:kept"]);
    await scheduler.drain();
  });

  it("closes admission while drain waits, flushes every character, and can be called again", async () => {
    const database = new CaptureBackend();
    const writes: string[] = [];
    const gate = deferred<void>();
    const started = deferred<void>();
    const scheduler = createScheduler(database, {
      deferred: (characterId, intent) => {
        writes.push(`${characterId}:${intent.value}`);
      },
    });
    const critical = scheduler.critical(1, "slow", async () => {
      started.resolve();
      await gate.promise;
    });
    scheduler.defer(1, { kind: "event", value: "one" });
    scheduler.defer(2, { kind: "event", value: "two" });

    await started.promise;
    const draining = scheduler.drain();
    assert.equal(scheduler.state, "draining");
    assert.throws(
      () => scheduler.defer(1, { kind: "event", value: "late" }),
      /scheduler is draining/,
    );
    await assert.rejects(
      scheduler.critical(1, "late", async () => {}),
      /scheduler is draining/,
    );
    gate.resolve();
    await Promise.all([critical, draining]);

    assert.equal(scheduler.state, "drained");
    assert.deepEqual(writes.sort(), ["1:one", "2:two"]);
    await scheduler.drain();
  });
});

function createScheduler(
  database: DatabaseBackend,
  callbacks: {
    readonly deferred?: (characterId: number, intent: DeferredIntent) => void;
    readonly coalesced?: (
      characterId: number,
      key: CoalesceKey,
      intent: CoalescedIntent,
    ) => void;
  } = {},
  options: ConstructorParameters<
    typeof ZoneWriteScheduler<DeferredIntent, CoalescedIntent, CoalesceKey>
  >[2] = { deferredFlushMs: false, coalescedFlushMs: false },
): ZoneWriteScheduler<DeferredIntent, CoalescedIntent, CoalesceKey> {
  const handlers: ZoneWriteHandlers<DeferredIntent, CoalescedIntent, CoalesceKey> = {
    writeDeferred: async (_transaction, characterId, intent) => {
      callbacks.deferred?.(characterId, intent);
    },
    writeCoalesced: async (_transaction, characterId, key, intent) => {
      callbacks.coalesced?.(characterId, key, intent);
    },
  };
  return new ZoneWriteScheduler(database, handlers, options);
}

class CaptureBackend implements DatabaseBackend {
  readonly dialect: DatabaseDialect;
  transactionCount = 0;

  constructor(dialect: DatabaseDialect = "postgres") {
    this.dialect = dialect;
  }

  query<TRow extends DatabaseRow = DatabaseRow>(
    _statement: string,
    _parameters: SqlParameters = [],
  ): Promise<DatabaseResult<TRow>> {
    return Promise.resolve({ rows: [], affectedRows: 0 });
  }

  execute(
    statement: string,
    parameters: SqlParameters = [],
  ): Promise<DatabaseResult> {
    return this.query(statement, parameters);
  }

  async transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return work(this);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
