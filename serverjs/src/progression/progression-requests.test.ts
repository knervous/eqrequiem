import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLASS_IDS } from "../combat/ability-types.js";
import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../db/backend.js";
import { applyCanonicalRuntimeSchema } from "../db/canonical-schema.js";
import { createNodeDatabase } from "../db/node/factory.js";
import {
  applyProgressionRequest,
  progressionState,
  type ProgressionIdentity,
} from "./progression-requests.js";
import { TechniqueRepository } from "./technique-repository.js";

class FailingTransactionBackend implements DatabaseBackend {
  readonly dialect;

  constructor(
    private readonly database: DatabaseBackend,
    private readonly shouldFail: (sql: string) => boolean,
    private readonly failuresEnabled = false,
  ) {
    this.dialect = database.dialect;
  }

  query<TRow extends DatabaseRow = DatabaseRow>(
    sql: string,
    parameters?: SqlParameters,
  ): Promise<DatabaseResult<TRow>> {
    return this.database.query<TRow>(sql, parameters);
  }

  execute(sql: string, parameters?: SqlParameters): Promise<DatabaseResult> {
    if (this.failuresEnabled && this.shouldFail(sql)) {
      throw new Error("injected progression write failure");
    }
    return this.database.execute(sql, parameters);
  }

  transaction<T>(work: (database: DatabaseBackend) => Promise<T>): Promise<T> {
    return this.database.transaction((transaction) =>
      work(new FailingTransactionBackend(transaction, this.shouldFail, true))
    );
  }

  close(): Promise<void> {
    return this.database.close();
  }
}

/**
 * The gap this covers: the rules and the persistence both existed and nothing called
 * them, so a character could be eligible for Shield Bash forever and never learn it.
 * These exercise the request path a player's click actually travels.
 */

async function fixture(level = 10) {
  const database = createNodeDatabase("sqlite::memory:");
  await applyCanonicalRuntimeSchema(database);
  await database.execute("INSERT INTO accounts (id, identity) VALUES (1, 'test')");
  await database.execute(
    "INSERT INTO characters (id, account_id, name, level, class_id) VALUES (1, 1, 'Halvane', ?, ?)",
    [level, CLASS_IDS.warrior],
  );
  const repository = new TechniqueRepository(database);
  await repository.grantStartingTechniques(1, CLASS_IDS.warrior);
  const identity: ProgressionIdentity = {
    characterId: 1,
    level,
    classId: CLASS_IDS.warrior,
    knowledge: new Set<string>(),
    inCombat: false,
  };
  return { database, repository, identity };
}

describe("progression requests", () => {
  it("learns a trainable technique and puts it on the bar", async () => {
    const { database, repository, identity } = await fixture();

    const result = await applyProgressionRequest(repository, identity, {
      type: "learn_ability",
      abilityId: "warrior.brace",
    });
    assert.equal(result.ok, true);

    const state = await progressionState(repository, identity);
    const brace = state.abilities.find((a) => a.abilityId === "warrior.brace");
    assert.equal(brace?.known, true);
    assert.ok(
      state.prepared.some((entry) => entry.abilityId === "warrior.brace"),
      "a newly learned technique should not land somewhere the player cannot find it",
    );
    await database.close?.();
  });

  it("rolls back learning when its automatic prepare fails", async () => {
    const { database, identity } = await fixture();
    const repository = new TechniqueRepository(
      new FailingTransactionBackend(
        database,
        (sql) => sql.includes("INSERT INTO character_prepared_actions"),
      ),
    );

    await assert.rejects(
      applyProgressionRequest(repository, identity, {
        type: "learn_ability",
        abilityId: "warrior.brace",
      }),
      /injected progression write failure/,
    );

    const state = await progressionState(repository, identity);
    assert.equal(state.abilities.find((ability) => ability.abilityId === "warrior.brace")?.known, false);
    assert.equal(
      state.prepared.some((entry) => entry.abilityId === "warrior.brace"),
      false,
    );
    await database.close?.();
  });

  it("refuses a technique the character has not reached", async () => {
    const { database, repository, identity } = await fixture(2);
    const result = await applyProgressionRequest(repository, identity, {
      type: "learn_ability",
      abilityId: "warrior.defensive_discipline",
    });
    assert.equal(result.ok, false);
    assert.equal(result.refusal, "level_too_low");
    await database.close?.();
  });

  it("refuses what a trainer cannot teach, distinctly from what is out of reach", async () => {
    const { database, repository, identity } = await fixture(25);
    const result = await applyProgressionRequest(repository, identity, {
      type: "learn_ability",
      abilityId: "warrior.hold_the_line",
    });
    assert.equal(result.refusal, "not_taught_here");

    const state = await progressionState(repository, identity);
    const aspectOnly = state.abilities.find(
      (ability) => ability.abilityId === "warrior.hold_the_line",
    );
    assert.equal(aspectOnly?.refusal, "not_taught_here");
    assert.equal(aspectOnly?.learnable, false);
    await database.close?.();
  });

  it("spends an Aspect point and grants the ability the node unlocks", async () => {
    const { database, repository, identity } = await fixture(25);

    // Hold the Line gates at depth 4, so the four cheaper Bulwark nodes come first.
    for (const nodeId of [
      "warrior.bulwark.iron_guard",
      "warrior.bulwark.shielded_advance",
      "warrior.bulwark.punishing_taunt",
      "warrior.bulwark.riposte",
      "warrior.bulwark.hold_the_line",
    ]) {
      const spent = await applyProgressionRequest(repository, identity, {
        type: "spend_aspect_point",
        nodeId,
      });
      assert.equal(spent.ok, true, `${nodeId} should have been affordable`);
    }

    const state = await progressionState(repository, identity);
    assert.equal(state.aspectPointsSpent, 6, "the capstone costs two points");
    assert.equal(state.aspectPointsAvailable, 24 - 6);
    const unlocked = state.abilities.find(
      (ability) => ability.abilityId === "warrior.hold_the_line",
    );
    assert.equal(unlocked?.known, true, "spending the node must grant its technique");
    await database.close?.();
  });

  it("rolls back an Aspect point and its unlock when automatic prepare fails", async () => {
    const { database, repository, identity } = await fixture(25);

    for (const nodeId of [
      "warrior.bulwark.iron_guard",
      "warrior.bulwark.shielded_advance",
      "warrior.bulwark.punishing_taunt",
      "warrior.bulwark.riposte",
    ]) {
      const spent = await applyProgressionRequest(repository, identity, {
        type: "spend_aspect_point",
        nodeId,
      });
      assert.equal(spent.ok, true);
    }

    const failingRepository = new TechniqueRepository(
      new FailingTransactionBackend(
        database,
        (sql) => sql.includes("INSERT INTO character_prepared_actions"),
      ),
    );
    await assert.rejects(
      applyProgressionRequest(failingRepository, identity, {
        type: "spend_aspect_point",
        nodeId: "warrior.bulwark.hold_the_line",
      }),
      /injected progression write failure/,
    );

    const state = await progressionState(failingRepository, identity);
    assert.equal(state.aspectPointsSpent, 4, "the capstone's two points must roll back");
    assert.equal(
      state.abilities.find((ability) => ability.abilityId === "warrior.hold_the_line")?.known,
      false,
      "the unlocked technique must roll back with the point spend",
    );
    assert.equal(
      state.prepared.some((entry) => entry.abilityId === "warrior.hold_the_line"),
      false,
    );
    await database.close?.();
  });

  it("refuses a node whose track is too shallow", async () => {
    const { database, repository, identity } = await fixture(25);
    const result = await applyProgressionRequest(repository, identity, {
      type: "spend_aspect_point",
      nodeId: "warrior.bulwark.hold_the_line",
    });
    assert.equal(result.ok, false);
    assert.equal(result.refusal, "track_too_shallow");
    await database.close?.();
  });

  it("locks loadout changes in combat but not learning", async () => {
    const { database, repository, identity } = await fixture();
    const fighting = { ...identity, inCombat: true };

    const prepared = await applyProgressionRequest(repository, fighting, {
      type: "prepare_ability",
      abilityId: "warrior.kick",
      slot: 4,
    });
    assert.equal(prepared.refusal, "in_combat");

    const learned = await applyProgressionRequest(repository, fighting, {
      type: "learn_ability",
      abilityId: "warrior.brace",
    });
    assert.equal(learned.ok, true, "learning is not a combat action");
    await database.close?.();
  });

  it("gives back every point on a respec without forgetting anything", async () => {
    const { database, repository, identity } = await fixture(25);
    await applyProgressionRequest(repository, identity, {
      type: "spend_aspect_point",
      nodeId: "warrior.bulwark.iron_guard",
    });
    const before = await progressionState(repository, identity);
    assert.equal(before.aspectPointsSpent, 1);

    await applyProgressionRequest(repository, identity, { type: "respec_aspects" });
    const after = await progressionState(repository, identity);
    assert.equal(after.aspectPointsSpent, 0);
    assert.equal(after.aspectPointsAvailable, 24);
    assert.ok(
      after.abilities.filter((ability) => ability.known).length >= 2,
      "a respec changes emphasis, never knowledge",
    );
    await database.close?.();
  });
});
