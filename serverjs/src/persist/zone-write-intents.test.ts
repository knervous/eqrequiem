import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../db/backend.js";
import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import { ZoneWriteScheduler } from "./zone-write-scheduler.js";
import {
  writeZoneCoalescedIntent,
  writeZoneDeferredIntent,
  type ZoneDeferredWrite,
  type ZonePositionWrite,
} from "./zone-write-intents.js";

type NoCoalescedWrite = { readonly unused: true };

describe("zone deferred write intents", () => {
  it("uses one shared latest-position checkpoint for live and embedded runtimes", async () => {
    const underlying = createNodeDatabase("sqlite::memory:");
    await applyCanonicalRuntimeSchema(underlying);
    await underlying.execute("INSERT INTO accounts (id, identity) VALUES (1, 'test')");
    await underlying.execute(
      "INSERT INTO characters (id, account_id, name) VALUES (1, 1, 'Walker')",
    );
    await underlying.execute(
      "INSERT INTO character_positions (character_id, zone_id, x, y, z, heading) VALUES (1, 1, 0, 0, 0, 0)",
    );
    const database = new CountingTransactions(underlying);
    const scheduler = new ZoneWriteScheduler<
      ZoneDeferredWrite,
      ZonePositionWrite,
      "position"
    >(
      database,
      {
        writeDeferred: writeZoneDeferredIntent,
        writeCoalesced: writeZoneCoalescedIntent,
      },
      { deferredFlushMs: false, coalescedFlushMs: false },
    );
    scheduler.coalesce(1, "position", {
      zoneId: 1, instanceId: 0, x: 10, y: 2, z: 3, heading: 64,
    });
    scheduler.coalesce(1, "position", {
      zoneId: 2, instanceId: 4, x: 20, y: 5, z: 6, heading: 128,
    });

    assert.equal(
      Number((await underlying.query<{ x: number }>(
        "SELECT x FROM character_positions WHERE character_id = 1",
      )).rows[0]?.x),
      0,
    );
    await scheduler.flush(1);
    assert.deepEqual(
      (await underlying.query(
        "SELECT zone_id, instance_id, x, y, z, heading FROM character_positions WHERE character_id = 1",
      )).rows,
      [{ zone_id: 2, instance_id: 4, x: 20, y: 5, z: 6, heading: 128 }],
    );
    assert.equal(database.transactionCount, 1);
    await scheduler.drain();
    await underlying.close();
  });

  it("commits an AoE-sized XP burst in one transaction", async () => {
    const underlying = createNodeDatabase("sqlite::memory:");
    await applyCanonicalRuntimeSchema(underlying);
    await underlying.execute("INSERT INTO accounts (id, identity) VALUES (1, 'test')");
    await underlying.execute(
      "INSERT INTO characters (id, account_id, name, level, experience) VALUES (1, 1, 'Burst', 1, 0)",
    );
    const database = new CountingTransactions(underlying);
    const scheduler = schedulerFor(database);

    for (let award = 0; award < 48; award++) {
      scheduler.defer(1, {
        kind: "xp_award",
        amount: 10,
        resultingLevel: 1,
      });
    }
    assert.equal(database.transactionCount, 0);
    await scheduler.flush(1);

    assert.equal(database.transactionCount, 1);
    assert.equal(
      Number((await underlying.query<{ experience: number }>(
        "SELECT experience FROM characters WHERE id = 1",
      )).rows[0]?.experience),
      480,
    );
    await scheduler.drain();
    await underlying.close();
  });

  it("commits ordered XP and quest state together at a checkpoint", async () => {
    const underlying = createNodeDatabase("sqlite::memory:");
    await applyCanonicalRuntimeSchema(underlying);
    await underlying.execute("INSERT INTO accounts (id, identity) VALUES (1, 'test')");
    await underlying.execute(
      "INSERT INTO characters (id, account_id, name, level, experience) VALUES (1, 1, 'Quest', 1, 0)",
    );
    const database = new CountingTransactions(underlying);
    const scheduler = schedulerFor(database);

    scheduler.defer(1, { kind: "xp_award", amount: 25, resultingLevel: 1 });
    scheduler.defer(1, {
      kind: "quest_commit",
      batch: {
        sessionId: 7,
        characterId: 1,
        quests: [{ questKey: "test:first", revision: 1, state: { found: true } }],
        knowledgeLearned: [{ key: "test.fact", data: { source: "test" } }],
        knowledgeForgotten: [],
      },
    });
    await scheduler.flush(1);

    assert.equal(database.transactionCount, 1);
    assert.deepEqual(
      (await underlying.query(
        "SELECT quest_key, state_json FROM character_quest_state WHERE character_id = 1",
      )).rows,
      [{ quest_key: "test:first", state_json: '{"found":true}' }],
    );
    assert.equal(
      (await underlying.query<{ knowledge_key: string }>(
        "SELECT knowledge_key FROM character_knowledge WHERE character_id = 1",
      )).rows[0]?.knowledge_key,
      "test.fact",
    );
    await scheduler.drain();
    await underlying.close();
  });
});

function schedulerFor(database: DatabaseBackend) {
  return new ZoneWriteScheduler<ZoneDeferredWrite, NoCoalescedWrite, "unused">(
    database,
    {
      writeDeferred: writeZoneDeferredIntent,
      writeCoalesced: async () => undefined,
    },
    { deferredFlushMs: false, coalescedFlushMs: false },
  );
}

class CountingTransactions implements DatabaseBackend {
  readonly dialect;
  transactionCount = 0;

  constructor(private readonly underlying: DatabaseBackend) {
    this.dialect = underlying.dialect;
  }

  query<TRow extends DatabaseRow = DatabaseRow>(
    sql: string,
    parameters?: SqlParameters,
  ): Promise<DatabaseResult<TRow>> {
    return this.underlying.query<TRow>(sql, parameters);
  }

  execute(sql: string, parameters?: SqlParameters): Promise<DatabaseResult> {
    return this.underlying.execute(sql, parameters);
  }

  transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    return this.underlying.transaction(work);
  }

  close(): Promise<void> {
    return this.underlying.close();
  }
}
