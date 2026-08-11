import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { OUT_OF_COMBAT_REGEN } from "../combat/combat-runtime.js";
import { PlayerAbilitySystem } from "../combat/player-abilities.js";
import { runZoneGameplayTick, type ZoneTickSystems } from "./zone-tick.js";

/**
 * What this protects: the two runtimes each had their own tick loop, and they had
 * already diverged — statuses expired and vigor regenerated offline and not live. Both
 * now call one function, so the way to keep them honest is to assert on that function's
 * order and completeness rather than on either caller.
 */

interface Call { readonly name: string }

function harness() {
  const calls: Call[] = [];
  const record = (name: string) => calls.push({ name });

  const abilities = new PlayerAbilitySystem();
  abilities.register(1, 5, 80);

  const systems = {
    kernel: {
      entities: { at: () => null },
      tick: (deltaMs: number) => {
        record(`kernel.tick(${deltaMs})`);
        return { count: 0, state: {}, dirtyIndices: new Uint32Array(), netPayload: new Uint8Array() };
      },
    },
    combat: {
      tick: (tick: number) => {
        record(`combat.tick(${tick})`);
        return [];
      },
    },
    engagement: {
      tick: (tick: number) => {
        record(`engagement.tick(${tick})`);
        return [];
      },
      isEngaged: () => false,
    },
    abilities,
    abilityPort: { advance: () => record("statuses.advance") },
    movementRoutes: new Map(),
    suspendedMovementRoutes: new Set<number>(),
  } as unknown as ZoneTickSystems;

  return { systems, calls, abilities };
}

describe("shared zone gameplay tick", () => {
  it("runs every gameplay step, in the order the design depends on", () => {
    const { systems, calls } = harness();

    runZoneGameplayTick(systems, { deltaMs: 100, tick: 7, simulationTimeMs: 5_000 });

    assert.deepEqual(
      calls.map((call) => call.name),
      [
        "statuses.advance",
        "engagement.tick(7)",
        "combat.tick(7)",
        "kernel.tick(100)",
      ],
      "the order is load-bearing: control resolves before targeting, targeting before "
      + "swings, and integration last so the snapshot reflects the whole tick",
    );
  });

  it("regenerates resources every tick", () => {
    // The drift this closes: this ran offline and not live, so the same Warrior
    // recovered between pulls in one runtime and never in the other.
    const { systems, abilities } = harness();
    const runtime = abilities.runtimeFor(1)!;
    runtime.resources.vigor.current = 50;

    runZoneGameplayTick(systems, { deltaMs: 1_000, tick: 1, simulationTimeMs: 1_000 });

    assert.equal(
      runtime.resources.vigor.current,
      50 + OUT_OF_COMBAT_REGEN.vigorPerSecond,
      "one second of tick must be one second of vigor",
    );
  });

  it("returns what the caller must deliver, and delivers nothing itself", () => {
    // The split the CLAUDE.md rule asks for: decisions here, transport in the runtime.
    const { systems } = harness();
    const result = runZoneGameplayTick(
      systems,
      { deltaMs: 16, tick: 2, simulationTimeMs: 32 },
    );
    assert.ok(Array.isArray(result.pathRequests));
    assert.ok(Array.isArray(result.combatEvents));
    assert.ok(result.snapshot, "the caller encodes the snapshot; the tick produces it");
  });
});
