import type { WorldStateRepository } from "../persist/world-state-repository.js";
import type { WorldStateService } from "./world-state-service.js";
import type { WorldOccurrenceRecord } from "./world-state-types.js";
import { worldHourAt } from "./world-clock.js";
import {
  mixSeed,
  situationRng,
  type SituationContext,
  type WorldSituationDefinition,
} from "./world-situations.js";

/**
 * The small server-side process that decides what the world is currently doing.
 *
 * It runs above the shards and does not need a player present: the world should look
 * like it kept existing while nobody was watching. Every decision is derived from a
 * seed and the current snapshot, so a given world seed plus a given state always
 * produces the same evaluation — which is the only reason this is testable at all.
 *
 * Deliberately not a scheduler. There is no calendar, no daily list, and no quota. A
 * situation starts when the world's state says it plausibly could, its hidden cooldown
 * has elapsed, and the weighted draw picks it.
 */

export interface WorldSituationDirectorOptions {
  /** Fixed per world; makes an entire run replayable. */
  readonly seed?: number;
  readonly now?: () => number;
  /** At most this many new occurrences per evaluation, so nothing floods. */
  readonly maxStartsPerEvaluation?: number;
  /** Global ceiling on concurrently active occurrences. */
  readonly maxActive?: number;
}

export interface DirectorEvaluation {
  readonly started: readonly WorldOccurrenceRecord[];
  readonly expired: readonly WorldOccurrenceRecord[];
  /** Why nothing started, for the dev situation inspector. */
  readonly skipped: readonly { readonly key: string; readonly reason: string }[];
}

export class WorldSituationDirector {
  #lastStartedAt = new Map<string, number>();
  #cooldownUntil = new Map<string, number>();
  #evaluations = 0;

  constructor(
    private readonly world: WorldStateService,
    private readonly situations: readonly WorldSituationDefinition[],
    private readonly options: WorldSituationDirectorOptions = {},
  ) {}

  /** Rebuilds cooldowns from history so a restart does not re-fire everything at once. */
  async start(repository: WorldStateRepository): Promise<void> {
    for (const occurrence of await repository.latestBySituation()) {
      this.#lastStartedAt.set(occurrence.situationKey, occurrence.startedAtMs);
      const definition = this.situations.find(
        (entry) => entry.key === occurrence.situationKey,
      );
      if (definition?.cooldown) {
        this.#cooldownUntil.set(
          occurrence.situationKey,
          occurrence.startedAtMs + this.#cooldownMs(definition, occurrence.startedAtMs),
        );
      }
    }
  }

  async evaluate(nowMs = this.#now()): Promise<DirectorEvaluation> {
    const expired = await this.world.expireElapsed(nowMs);
    const view = this.world.view();
    const context: SituationContext = {
      world: view,
      hour: worldHourAt(nowMs),
      nowMs,
    };
    const skipped: { key: string; reason: string }[] = [];
    const started: WorldOccurrenceRecord[] = [];
    const evaluationSeed = mixSeed(this.options.seed ?? 1, this.#evaluations++);
    const maxActive = this.options.maxActive ?? Number.POSITIVE_INFINITY;
    const maxStarts = Math.max(0, this.options.maxStartsPerEvaluation ?? 1);

    let activeCount = view.activeSituations().length;
    const activeGroups = new Set(
      view
        .activeSituations()
        .map((occurrence) => this.#groupOf(occurrence.situationKey))
        .filter((group): group is string => group !== null),
    );

    const eligible: { definition: WorldSituationDefinition; weight: number }[] = [];
    for (const definition of this.situations) {
      const reason = this.#ineligibleReason(definition, context, activeGroups);
      if (reason) {
        skipped.push({ key: definition.key, reason });
        continue;
      }
      eligible.push({ definition, weight: Math.max(0, definition.weight ?? 1) });
    }

    const rng = situationRng(evaluationSeed);
    const pool = eligible.filter((entry) => entry.weight > 0);
    while (started.length < maxStarts && pool.length > 0 && activeCount < maxActive) {
      const chosen = drawWeighted(pool, rng.next());
      if (!chosen) break;
      pool.splice(pool.indexOf(chosen), 1);
      const group = chosen.definition.exclusiveGroup ?? null;
      if (group !== null && activeGroups.has(group)) continue;

      const seed = mixSeed(evaluationSeed, hashKey(chosen.definition.key));
      const data = chosen.definition.create?.({
        ...context,
        rng: situationRng(seed),
      }) ?? {};
      const occurrence = await this.world.beginOccurrence({
        situationKey: chosen.definition.key,
        seed,
        data,
        startedAtMs: nowMs,
        durationMs:
          chosen.definition.durationMinutes === undefined
            ? null
            : chosen.definition.durationMinutes * 60_000,
      });
      started.push(occurrence);
      activeCount += 1;
      if (group !== null) activeGroups.add(group);
      this.#lastStartedAt.set(chosen.definition.key, nowMs);
      if (chosen.definition.cooldown) {
        this.#cooldownUntil.set(
          chosen.definition.key,
          nowMs + this.#cooldownMs(chosen.definition, seed),
        );
      }
    }

    return { started, expired, skipped };
  }

  /** What the director would say about one situation right now. For dev tooling. */
  explain(key: string, nowMs = this.#now()): string {
    const definition = this.situations.find((entry) => entry.key === key);
    if (!definition) return "unknown situation";
    const view = this.world.view();
    const activeGroups = new Set(
      view
        .activeSituations()
        .map((occurrence) => this.#groupOf(occurrence.situationKey))
        .filter((group): group is string => group !== null),
    );
    return (
      this.#ineligibleReason(
        definition,
        { world: view, hour: worldHourAt(nowMs), nowMs },
        activeGroups,
      ) ?? "eligible"
    );
  }

  #ineligibleReason(
    definition: WorldSituationDefinition,
    context: SituationContext,
    activeGroups: ReadonlySet<string>,
  ): string | null {
    if (context.world.hasActive(definition.key)) return "already active";
    const group = definition.exclusiveGroup;
    if (group !== undefined && activeGroups.has(group)) {
      return `group ${group} is occupied`;
    }
    const until = this.#cooldownUntil.get(definition.key);
    if (until !== undefined && context.nowMs < until) return "cooling down";
    if (!definition.canStart(context)) return "world state says no";
    return null;
  }

  #groupOf(situationKey: string): string | null {
    return (
      this.situations.find((entry) => entry.key === situationKey)?.exclusiveGroup ?? null
    );
  }

  /**
   * A randomized quiet period rather than a fixed one: a player should learn that
   * ambushes happen on this road, not that they happen every 25 minutes.
   */
  #cooldownMs(definition: WorldSituationDefinition, seed: number): number {
    const cooldown = definition.cooldown;
    if (!cooldown) return 0;
    const low = Math.min(cooldown.minMinutes, cooldown.maxMinutes);
    const high = Math.max(cooldown.minMinutes, cooldown.maxMinutes);
    const roll = situationRng(mixSeed(seed, hashKey(definition.key))).next();
    return (low + (high - low) * roll) * 60_000;
  }

  #now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

/** One in-world hour at the default day length; slow enough to feel unscheduled. */
export const DEFAULT_DIRECTOR_INTERVAL_MS = 150_000;

export interface DirectorLoop {
  stop(): Promise<void>;
}

/**
 * Runs the director on a timer. Shared by the live server and the offline backend so an
 * offline player's world behaves the same as a live one — a rule only the live server
 * follows is a rule that is not being tested.
 */
export function runSituationDirector(
  director: WorldSituationDirector,
  options: {
    readonly intervalMs?: number;
    readonly onEvaluation?: (evaluation: DirectorEvaluation) => void;
    readonly onError?: (error: unknown) => void;
  } = {},
): DirectorLoop {
  let stopped = false;
  let running = false;
  let inFlight: Promise<void> = Promise.resolve();
  const tick = (): void => {
    if (stopped || running) return;
    running = true;
    inFlight = director.evaluate().then(
      (evaluation) => options.onEvaluation?.(evaluation),
      (error) => options.onError?.(error),
    ).then(() => undefined).finally(() => {
      running = false;
    });
  };
  const timer = setInterval(
    tick,
    Math.max(1_000, options.intervalMs ?? DEFAULT_DIRECTOR_INTERVAL_MS),
  );
  // The world ticking must never be the reason a process refuses to exit.
  timer.unref?.();
  tick();
  return {
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}

function drawWeighted<T extends { readonly weight: number }>(
  entries: readonly T[],
  roll: number,
): T | null {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;
  let cursor = roll * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor < 0) return entry;
  }
  return entries[entries.length - 1] ?? null;
}

function hashKey(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}
