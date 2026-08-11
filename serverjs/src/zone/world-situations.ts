import type { WorldStateView } from "./world-state-types.js";

/**
 * Authored World Situations: the things the world does on its own.
 *
 * A situation is not a quest. It is a *reason for content to currently exist* — a
 * caravan is overdue, the warrens are pushing at the road, something in the Greenveil
 * has bloomed. Quests then discover it. Keeping the two apart is what lets a repeatable
 * situation stay repeatable without a daily-reset UI: the quest asks whether an
 * occurrence exists, not whether a timer has rolled over.
 *
 * Availability is an authored TypeScript predicate over a world snapshot, deliberately
 * not a rows-and-operators condition DSL. A predicate is written beside the content it
 * gates, reads as prose, and can be tested from a literal snapshot with no database.
 */

/** Deterministic RNG. Every choice a situation makes must be replayable from its seed. */
export interface SituationRng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** True with the given probability. */
  chance(probability: number): boolean;
}

export interface SituationCooldown {
  readonly minMinutes: number;
  readonly maxMinutes: number;
}

/**
 * What an availability predicate is allowed to read.
 *
 * Note what is *absent*: weather. `QuestWorldContext.weather` exists as an API idea but
 * has no authoritative source, so authoring against it would gate content on a null
 * placeholder — content that silently never runs. Weather is deliberately out of the
 * demo; when a real authoritative source exists it can be added here, and every
 * predicate that wants it will fail to compile until it is.
 */
export interface SituationContext {
  readonly world: WorldStateView;
  /** Fractional world hour in [0, 24). Server-authoritative; the client sky matches it. */
  readonly hour: number;
  readonly nowMs: number;
}

export interface SituationCreateContext extends SituationContext {
  readonly rng: SituationRng;
}

/**
 * How a player could plausibly find out this is happening, without being told by a
 * marker.
 *
 * Required on every situation. A situation the world runs that nobody can stumble into
 * is not content — it is a timer with no output, and the found-not-assigned design has
 * no other channel to surface it. Making this a field rather than a convention means a
 * test can hold the line.
 */
export interface SituationDiscovery {
  /** The sense or channel that reveals it. */
  readonly kind: "rumor" | "sight" | "sound" | "trace" | "encounter";
  /** What the player perceives, in their own terms. */
  readonly text: string;
  /** Where the hook is available, when it is narrower than the situation's zone. */
  readonly near?: string;
}

export interface WorldSituationDefinition {
  /** Stable identity, `zone:name`. Occurrence award keys are built from it. */
  readonly key: string;
  readonly title?: string;
  /** At least one natural way to find out. Required — see `SituationDiscovery`. */
  readonly discovery: SituationDiscovery;
  /**
   * Whether the world could start this right now. Must be a pure function of the
   * snapshot: no I/O, no Date.now(), no reading from a shard.
   */
  readonly canStart: (context: SituationContext) => boolean;
  /** Relative likelihood among everything eligible in the same evaluation. */
  readonly weight?: number;
  /** Hidden, randomized quiet period after the last occurrence started. */
  readonly cooldown?: SituationCooldown;
  /** How long an occurrence stays active before it expires unresolved. */
  readonly durationMinutes?: number;
  /**
   * Situations sharing a group never run at once, so the world stays legible: one thing
   * is happening on the Greymarch road, not four.
   */
  readonly exclusiveGroup?: string;
  /** Seeded variant data — which road, which lieutenant, which of three clues. */
  readonly create?: (context: SituationCreateContext) => Record<string, unknown>;
}

/** Identity function that exists to give authored definitions their type. */
export function defineSituation(
  definition: WorldSituationDefinition,
): WorldSituationDefinition {
  return definition;
}

/** Small, fast, seedable. Chosen for reproducibility, not cryptographic quality. */
export function situationRng(seed: number): SituationRng {
  let state = (Math.trunc(seed) || 1) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => {
      const low = Math.ceil(Math.min(min, max));
      const high = Math.floor(Math.max(min, max));
      return low + Math.floor(next() * (high - low + 1));
    },
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("cannot pick from an empty list");
      return items[Math.floor(next() * items.length)] as T;
    },
    chance: (probability) => next() < probability,
  };
}

/** Mixes two seeds so per-situation streams stay independent within one evaluation. */
export function mixSeed(left: number, right: number): number {
  let value = (Math.trunc(left) ^ Math.imul(Math.trunc(right) || 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}
