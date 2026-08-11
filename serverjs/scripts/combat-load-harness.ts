import { performance } from "node:perf_hooks";
import { DEFAULT_NPC_ENGAGEMENT_RULES, NpcEngagementSystem } from "../src/ai/npc-engagement.js";
import { abilityById } from "../src/combat/abilities/index.js";
import { MeleeCombatSystem, type CombatEvent } from "../src/combat/melee-combat.js";
import { applyAbilityEffects } from "../src/combat/effect-runtime.js";
import { PlayerAbilitySystem } from "../src/combat/player-abilities.js";
import { ZoneAbilityPort } from "../src/combat/zone-ability-port.js";
import { EntityKind, type Entity } from "../src/zone/entity-store.js";
import { loadZoneSimulationKernel } from "../src/zone/zone-kernel-node.js";
import { runZoneGameplayTick, type ZoneTickSystems } from "../src/zone/zone-tick.js";
import type {
  DatabaseBackend,
  DatabaseResult,
  DatabaseRow,
  SqlParameters,
} from "../src/db/backend.js";
import { applyCanonicalRuntimeSchema } from "../src/db/canonical-schema.js";
import { createNodeDatabase } from "../src/db/node/factory.js";
import { ZoneWriteScheduler } from "../src/persist/zone-write-scheduler.js";
import {
  writeZoneDeferredIntent,
  type ZoneDeferredWrite,
} from "../src/persist/zone-write-intents.js";

/**
 * A headless shard, driven at a fixed timestep, with no network and no database.
 *
 * Combat grew three new per-tick cost centres that nothing was measuring: statuses now
 * actually tick (damage-over-time did nothing before), areas scan the entity store once
 * a second each, and multi-target effects fan one activation out into many combat events.
 * None of that is visible from a unit test, and all of it is invisible from a play
 * session until it is already too slow.
 *
 * The harness runs the real `runZoneGameplayTick` against the real systems, so what it
 * measures is what a live shard does. Everything is deterministic — a seeded RNG and a
 * simulation clock that advances by the timestep rather than reading the wall — so two
 * runs of the same scenario are comparable and this can gate a regression in CI.
 *
 * `createLoadShard` is deliberately exported and transport-free: the eventual headless
 * client can drive the same shard through the opcode wire instead of calling methods,
 * and compare like for like.
 */

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

/** Mulberry32. Small, fast, and identical across runs and machines. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The shard
// ---------------------------------------------------------------------------

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;

export interface LoadShard {
  readonly systems: ZoneTickSystems;
  readonly port: ZoneAbilityPort;
  readonly abilities: PlayerAbilitySystem;
  readonly combat: MeleeCombatSystem;
  readonly players: readonly Entity[];
  readonly npcs: readonly Entity[];
  readonly counters: Counters;
  /** Advances one tick and returns how long the gameplay half took, in milliseconds. */
  step(): number;
  /**
   * Advances the simulation clock without running a tick.
   *
   * This is what a stalled shard looks like from the inside: time passed and nothing
   * processed it, so the next tick has to catch up on everything at once.
   */
  skip(ms: number): void;
  simulationTimeMs(): number;
}

export interface Counters {
  combatEvents: number;
  damageApplications: number;
  healApplications: number;
  statusApplications: number;
}

export interface ShardOptions {
  readonly players: number;
  readonly npcs: number;
  /** Metres between spawned entities; tighter packing means more proximity hits. */
  readonly spacing?: number;
  readonly seed?: number;
  readonly playerLevel?: number;
  readonly npcLevel?: number;
}

export async function createLoadShard(options: ShardOptions): Promise<LoadShard> {
  const random = seededRandom(options.seed ?? 1);
  const spacing = options.spacing ?? 6;
  const kernel = await loadZoneSimulationKernel();
  const combat = new MeleeCombatSystem(kernel.entities, TICK_HZ);
  const engagement = new NpcEngagementSystem(
    kernel.entities,
    combat,
    DEFAULT_NPC_ENGAGEMENT_RULES,
  );
  const abilities = new PlayerAbilitySystem();

  const counters: Counters = {
    combatEvents: 0,
    damageApplications: 0,
    healApplications: 0,
    statusApplications: 0,
  };

  let simulationTimeMs = 0;
  let tick = 0;

  const port = new ZoneAbilityPort({
    entities: kernel.entities,
    combat,
    threat: engagement,
    abilities,
    currentTick: () => tick,
    nowMs: () => simulationTimeMs,
    onCombatEvent: () => {
      counters.combatEvents += 1;
    },
    scripts: {
      // Stand-ins. The harness cares that the effect path runs, not what Track prints.
      "ranger.track": () => {},
      "monk.feign_death": () => {},
    },
  });

  // Instrument the port on the instance rather than in production code, so what runs
  // under measurement is byte-for-byte what runs live.
  instrument(port, counters);

  const players: Entity[] = [];
  const npcs: Entity[] = [];
  const perRow = Math.ceil(Math.sqrt(options.npcs || 1));

  for (let index = 0; index < options.players; index++) {
    const pc = kernel.entities.spawnPC({
      id: 1000 + index,
      x: index * spacing,
      y: 0,
      z: -spacing * 2,
      speed: 0,
    });
    combat.register(pc, combatantStats(options.playerLevel ?? 25, 4000));
    abilities.register(pc.id, options.playerLevel ?? 25, 100);
    players.push(pc);
  }

  for (let index = 0; index < options.npcs; index++) {
    const npc = kernel.entities.spawnNPC({
      id: 5000 + index,
      x: (index % perRow) * spacing + random() * 0.5,
      y: 0,
      z: Math.floor(index / perRow) * spacing + random() * 0.5,
      speed: 0,
    });
    combat.register(npc, combatantStats(options.npcLevel ?? 25, 100_000));
    npcs.push(npc);
  }

  return {
    systems: {
      kernel,
      combat,
      engagement,
      abilities,
      abilityPort: port,
      movementRoutes: new Map(),
      suspendedMovementRoutes: new Set(),
    },
    port,
    abilities,
    combat,
    players,
    npcs,
    counters,
    simulationTimeMs: () => simulationTimeMs,
    skip(ms: number): void {
      simulationTimeMs += ms;
      tick += Math.round(ms / TICK_MS);
    },
    step(): number {
      tick += 1;
      simulationTimeMs += TICK_MS;
      const started = performance.now();
      runZoneGameplayTick(this.systems, {
        deltaMs: TICK_MS,
        tick,
        simulationTimeMs,
      });
      return performance.now() - started;
    },
  };
}

/**
 * Huge NPC health pools on purpose.
 *
 * A load run should measure sustained combat, not how fast the population dies. Anything
 * that kills its own targets stops exercising the path halfway through the run.
 */
function combatantStats(level: number, maximumHp: number) {
  return {
    level,
    strength: 100,
    stamina: 100,
    dexterity: 90,
    agility: 90,
    offense: 100,
    defense: 100,
    armorClass: 200,
    maximumHp,
    weaponDamage: 12,
    attackDelayMs: 2000,
    haste: 0,
    meleeRange: 5,
  };
}

function instrument(port: ZoneAbilityPort, counters: Counters): void {
  const target = port as unknown as Record<string, (...args: never[]) => unknown>;
  const damage = target.applyDamage.bind(port);
  const heal = target.applyHeal.bind(port);
  const status = target.applyStatus.bind(port);

  target.applyDamage = ((...args: never[]) => {
    counters.damageApplications += 1;
    return damage(...args);
  }) as never;
  target.applyHeal = ((...args: never[]) => {
    counters.healApplications += 1;
    return heal(...args);
  }) as never;
  target.applyStatus = ((...args: never[]) => {
    counters.statusApplications += 1;
    return status(...args);
  }) as never;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

interface Report {
  readonly scenario: string;
  readonly ticks: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly eventsPerSecond: number;
  readonly proximityVisitsPerSecond: number;
  readonly retained: ReturnType<ZoneAbilityPort["diagnostics"]> extends never
    ? never
    : { statusSets: number; projectilesInFlight: number; activeAreas: number };
  readonly writeTransactions?: number;
  readonly writesPerTransaction?: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index]!;
}

async function measure(
  scenario: string,
  seconds: number,
  shard: LoadShard,
  onTick: (tick: number, shard: LoadShard) => void,
): Promise<Report> {
  const ticks = Math.round(seconds * TICK_HZ);
  const durations: number[] = [];
  for (let tick = 0; tick < ticks; tick++) {
    onTick(tick, shard);
    durations.push(shard.step());
  }
  const sorted = [...durations].sort((left, right) => left - right);
  return {
    scenario,
    ticks,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
    eventsPerSecond: shard.counters.combatEvents / seconds,
    // Read from the port, which counts both the activation-time scans and the once-a-
    // second scan every active area performs.
    proximityVisitsPerSecond: shard.port.diagnostics.proximityVisits / seconds,
    retained: shard.port.diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/**
 * Applies an ability's effects directly, bypassing cooldown and cost.
 *
 * A load scenario has to choose the pressure. Going through `activate` would make the
 * shape of the test an accident of whatever cooldowns the content happens to carry, and
 * every scenario would silently measure "mostly refusals". The gate is a handful of map
 * lookups; the effects are where the work is, and this is that path exactly as it runs.
 */
function forceCast(
  shard: LoadShard,
  caster: Entity,
  abilityId: string,
  targetId: number,
): void {
  const ability = abilityById(abilityId);
  if (!ability) throw new Error(`unknown ability in scenario: ${abilityId}`);
  applyAbilityEffects({
    ability,
    actor: {
      entityId: caster.id,
      level: 25,
      classId: ability.classIds[0]!,
      learned: new Set([abilityId]),
      prepared: new Set([abilityId]),
      strength: 100,
      stamina: 100,
      agility: 90,
      dexterity: 90,
      wisdom: 100,
      intelligence: 100,
      weaponDamage: 12,
      skill: 120,
      hasShield: true,
      hasBow: true,
      incapacitated: false,
    },
    targetId,
    port: shard.port,
  });
}

class TransactionCounter implements DatabaseBackend {
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

const SCENARIOS: Record<
  string,
  (seconds: number, scale: number) => Promise<Report>
> = {
  /** Eight simultaneous kills credited to a full six-player group: 48 XP awards. */
  async "xp-burst"(seconds) {
    const underlying = createNodeDatabase("sqlite::memory:");
    await applyCanonicalRuntimeSchema(underlying);
    await underlying.execute("INSERT INTO accounts (id, identity) VALUES (1, 'load')");
    for (let characterId = 1; characterId <= 6; characterId++) {
      await underlying.execute(
        "INSERT INTO characters (id, account_id, name, level, experience) VALUES (?, 1, ?, 1, 0)",
        [characterId, `Load${characterId}`],
      );
    }
    const database = new TransactionCounter(underlying);
    const scheduler = new ZoneWriteScheduler<
      ZoneDeferredWrite,
      { readonly unused: true },
      "unused"
    >(
      database,
      {
        writeDeferred: writeZoneDeferredIntent,
        writeCoalesced: async () => undefined,
      },
      { deferredFlushMs: false, coalescedFlushMs: false },
    );
    const bursts = Math.max(1, Math.round(seconds));
    const durations: number[] = [];
    for (let burst = 0; burst < bursts; burst++) {
      const started = performance.now();
      for (let characterId = 1; characterId <= 6; characterId++) {
        for (let kill = 0; kill < 8; kill++) {
          scheduler.defer(characterId, {
            kind: "xp_award",
            amount: 10,
            resultingLevel: 1,
          });
        }
      }
      await Promise.all(
        [1, 2, 3, 4, 5, 6].map((characterId) => scheduler.flush(characterId)),
      );
      durations.push(performance.now() - started);
    }
    await scheduler.drain();
    await underlying.close();
    const sorted = [...durations].sort((left, right) => left - right);
    return {
      scenario: "xp-burst",
      ticks: bursts,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      max: sorted.at(-1) ?? 0,
      eventsPerSecond: 48,
      proximityVisitsPerSecond: 0,
      retained: { statusSets: 0, projectilesInFlight: 0, activeAreas: 0 },
      writeTransactions: database.transactionCount,
      writesPerTransaction: (bursts * 48) / database.transactionCount,
    };
  },

  /** Nothing but bodies and swings. The floor everything else is measured against. */
  async baseline(seconds, scale) {
    const shard = await createLoadShard({ players: 6, npcs: scale });
    return measure("baseline", seconds, shard, () => {});
  },

  /**
   * Damage-over-time across the population.
   *
   * Every applied DoT ticks once a second, and each tick is a formula evaluation, a
   * damage application, a combat event and a threat write. This is the cost that did not
   * exist at all before ticks were wired.
   */
  async dots(seconds, scale) {
    const shard = await createLoadShard({ players: 4, npcs: scale });
    return measure("dots", seconds, shard, (tick) => {
      // Walk the whole population, so within a few seconds every NPC is ticking and the
      // run measures a zone fully under rot rather than one unlucky NPC.
      const caster = shard.players[tick % shard.players.length]!;
      for (let offset = 0; offset < 4; offset++) {
        const victim = shard.npcs[(tick * 4 + offset) % shard.npcs.length]!;
        forceCast(shard, caster, "druid.thornrot", victim.id);
        forceCast(shard, caster, "druid.blightbloom", victim.id);
      }
    });
  },

  /**
   * Ground areas, which scan the entity store once per second each.
   *
   * `entitiesWithin` is linear over the whole store and does not use the zone's spatial
   * index, so this is where cost should grow fastest with population.
   */
  async areas(seconds, scale) {
    const shard = await createLoadShard({ players: 6, npcs: scale });
    return measure("areas", seconds, shard, (tick) => {
      // Six overlapping fields, refreshed as they expire.
      if (tick % 40 !== 0) return;
      for (const [index, caster] of shard.players.entries()) {
        const victim = shard.npcs[(index * 7) % shard.npcs.length]!;
        forceCast(shard, caster, "druid.quagmire", victim.id);
        forceCast(shard, caster, "wizard.emberburst", victim.id);
      }
    });
  },

  /** Multi-target abilities: one activation, many victims, many events. */
  async fanout(seconds, scale) {
    const shard = await createLoadShard({ players: 6, npcs: scale, spacing: 3 });
    return measure("fanout", seconds, shard, (tick) => {
      const caster = shard.players[tick % shard.players.length]!;
      const victim = shard.npcs[tick % shard.npcs.length]!;
      forceCast(shard, caster, "warrior.cleave", victim.id);
      if (tick % 5 === 0) forceCast(shard, caster, "monk.whirling_fists", victim.id);
    });
  },

  /**
   * A stalled shard catching up.
   *
   * Both `StatusSet.advance` and the area loop catch up missed ticks rather than dropping
   * them, which is right for fairness and means a stall converts directly into a burst.
   * This measures how bad that burst is — the worst tick is the number that matters.
   */
  async stall(seconds, scale) {
    const shard = await createLoadShard({ players: 4, npcs: scale });
    return measure("stall", seconds, shard, (tick) => {
      if (tick < 200) {
        const caster = shard.players[tick % shard.players.length]!;
        for (let offset = 0; offset < 4; offset++) {
          const victim = shard.npcs[(tick * 4 + offset) % shard.npcs.length]!;
          forceCast(shard, caster, "druid.thornrot", victim.id);
        }
      }
      // Once the population is afflicted, lose five seconds. Every DoT in the zone owes
      // five ticks, and the next frame pays all of them at once.
      if (tick === 300) shard.skip(5_000);
    });
  },

  /** A long run that should end holding nothing it does not still need. */
  async soak(seconds, scale) {
    const shard = await createLoadShard({ players: 6, npcs: scale });
    return measure("soak", seconds, shard, (tick) => {
      const caster = shard.players[tick % shard.players.length]!;
      const victim = shard.npcs[tick % shard.npcs.length]!;
      if (tick % 3 === 0) forceCast(shard, caster, "wizard.arc_bolt", victim.id);
      if (tick % 40 === 0) forceCast(shard, caster, "druid.thornrot", victim.id);
      if (tick % 200 === 0) forceCast(shard, caster, "ranger.bramble_trap", victim.id);
    });
  },
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function argument(name: string, fallback: string): string {
  const found = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const requested = argument("scenario", "all");
const seconds = Number(argument("seconds", "20"));
const scale = Number(argument("entities", "200"));
/** Gameplay budget per tick. At 20Hz a tick has 50ms; anything over this is a warning. */
const budgetMs = Number(argument("budget", "8"));

const names = requested === "all" ? Object.keys(SCENARIOS) : requested.split(",");
const reports: Report[] = [];

for (const name of names) {
  const scenario = SCENARIOS[name];
  if (!scenario) throw new Error(`unknown scenario: ${name}`);
  reports.push(await scenario(seconds, scale));
}

const pad = (value: string | number, width: number): string =>
  String(value).padStart(width);

console.log(
  `\n${scale} entities · ${seconds}s each · ${TICK_HZ}Hz · budget ${budgetMs}ms/tick\n`,
);
console.log(
  "scenario    ticks     p50     p95     max   events/s   scan visits/s  retained",
);
for (const report of reports) {
  const over = report.p95 > budgetMs ? "  ⚠ over budget" : "";
  console.log(
    `${report.scenario.padEnd(10)}${pad(report.ticks, 6)}`
    + `${pad(report.p50.toFixed(2), 8)}${pad(report.p95.toFixed(2), 8)}`
    + `${pad(report.max.toFixed(2), 8)}${pad(report.eventsPerSecond.toFixed(0), 11)}`
    + `${pad(report.proximityVisitsPerSecond.toFixed(0), 16)}`
    + `  areas=${report.retained.activeAreas} proj=${report.retained.projectilesInFlight}`
    + ` statuses=${report.retained.statusSets}`
    + (report.writeTransactions === undefined
      ? ""
      : ` tx=${report.writeTransactions} writes/tx=${report.writesPerTransaction?.toFixed(1)}`)
    + over,
  );
}

const worst = reports.find((report) => report.p95 > budgetMs);
if (worst) {
  console.log(
    `\n${worst.scenario} exceeded the ${budgetMs}ms gameplay budget at p95 `
    + `(${worst.p95.toFixed(2)}ms).`,
  );
  process.exitCode = 1;
}
