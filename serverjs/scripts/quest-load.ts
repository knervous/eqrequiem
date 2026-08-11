import {
  DEMO_TARGET_LOAD,
  loadQuestZone,
  walkPosition,
  type QuestLoadShape,
} from "../src/zone/quest-load.js";

/**
 * Quest engine load harness.
 *
 * Prints per-operation cost for the paths a busy shard actually drives, and the shape of
 * the curve as content grows. `quest-load.test.ts` asserts budgets from the same content;
 * this is the version you run when a budget fails and you need to know why.
 *
 *   npm run load:quests
 */

function measure(label: string, operations: number, run: () => void): void {
  run();
  const started = performance.now();
  run();
  const elapsedMs = performance.now() - started;
  const perOp = (elapsedMs * 1000) / operations;
  process.stdout.write(
    `${label.padEnd(42)}${elapsedMs.toFixed(1).padStart(8)} ms   `
    + `${perOp.toFixed(3).padStart(8)} µs/op   `
    + `${Math.round(operations / (elapsedMs / 1000)).toLocaleString().padStart(12)} ops/s\n`,
  );
}

function dispatchLoad(shape: QuestLoadShape, events: number): void {
  const { manager, npcNames } = loadQuestZone(shape, 1);
  const handlers = shape.quests * shape.handlersPerQuest;
  measure(
    `dispatch say (${handlers} handlers)`,
    events,
    () => {
      for (let i = 0; i < events; i++) {
        manager.dispatch({
          type: "say",
          tick: i,
          sessionId: 1,
          npcName: npcNames[i % npcNames.length]!,
          message: "hail",
        } as never);
      }
    },
  );
}

function positionLoad(shape: QuestLoadShape, players: number, ticks: number): void {
  const { manager, sessionIds } = loadQuestZone(shape, players);
  measure(
    `position updates (${players}p x ${shape.regions}r x ${shape.watchers}w)`,
    players * ticks,
    () => {
      for (let step = 0; step < ticks; step++) {
        for (const sessionId of sessionIds) {
          manager.updatePlayerPosition(sessionId, walkPosition(sessionId, step), step);
        }
      }
    },
  );
}

function timerLoad(pending: number, ticks: number): void {
  const { manager } = loadQuestZone({ ...DEMO_TARGET_LOAD, quests: 4 }, 1);
  for (let i = 0; i < pending; i++) {
    manager.dispatch({
      type: "npc_tick",
      tick: 0,
      // Far-future timers: the realistic steady state is many pending and none due, so
      // this measures the check, not the firing.
      effects: [],
    } as never);
  }
  measure(`advanceTimers (${pending} pending)`, ticks, () => {
    for (let tick = 0; tick < ticks; tick++) manager.advanceTimers(tick, 0);
  });
}

function main(): void {
  process.stdout.write("\nQuest engine load\n");
  process.stdout.write(`${"".padEnd(42)}${"total".padStart(8)}${"per op".padStart(19)}`
    + `${"throughput".padStart(16)}\n`);

  process.stdout.write("\n-- dispatch scaling with content volume --\n");
  for (const quests of [3, 15, 60, 240]) {
    dispatchLoad({ ...DEMO_TARGET_LOAD, quests }, 20_000);
  }

  process.stdout.write("\n-- position updates (regions + proximity) --\n");
  for (const players of [10, 50, 200]) {
    positionLoad(DEMO_TARGET_LOAD, players, 100);
  }

  process.stdout.write("\n-- world event volume --\n");
  const { manager, sessionIds } = loadQuestZone(DEMO_TARGET_LOAD, 50);
  measure("npc_death with credit", 20_000, () => {
    for (let i = 0; i < 20_000; i++) {
      manager.dispatchNpcDeath({
        tick: i,
        npc: { kind: "npc", id: i, name: `a_target_${i % 60}`, level: 5 } as never,
        creditSessionIds: sessionIds.slice(0, 6),
      });
    }
  });

  timerLoad(200, 20_000);
  process.stdout.write("\n");
}

main();
