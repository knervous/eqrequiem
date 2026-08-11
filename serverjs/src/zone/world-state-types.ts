/**
 * The vocabulary of global world state, kept free of persistence and transport so the
 * zone worker, the embedded backend and the persistence layer can all speak it.
 *
 * Four state scopes exist in this game and they are deliberately not merged: character
 * state (what one person knows and has done), zone-instance state (what is true in one
 * running shard right now), *global world state* (what every shard agrees on), and
 * *occurrence state* (one concrete appearance of a repeatable situation). This module
 * owns the last two.
 */

export type WorldOccurrenceState = "active" | "resolved" | "expired";

export interface WorldFactRecord {
  readonly key: string;
  readonly value: unknown;
  readonly revision: number;
}

export interface WorldOccurrenceRecord {
  readonly id: number;
  readonly situationKey: string;
  readonly state: WorldOccurrenceState;
  readonly seed: number;
  readonly data: Readonly<Record<string, unknown>>;
  readonly startedAtMs: number;
  readonly endsAtMs: number | null;
  readonly resolvedAtMs: number | null;
}

/**
 * What a shard sees. `revision` increments on every published change, so a consumer can
 * cheaply decide whether it already has this state without comparing the contents.
 */
export interface WorldStateSnapshot {
  readonly revision: number;
  readonly facts: Readonly<Record<string, unknown>>;
  readonly occurrences: readonly WorldOccurrenceRecord[];
}

export const EMPTY_WORLD_STATE: WorldStateSnapshot = {
  revision: 0,
  facts: {},
  occurrences: [],
};

/**
 * The read side authored content sees. Situation predicates take this, never the
 * service, so they stay synchronous, deterministic and testable from a literal
 * snapshot.
 */
export interface WorldStateView {
  readonly revision: number;
  readonly facts: Readonly<Record<string, unknown>>;
  value<T = unknown>(key: string): T | undefined;
  number(key: string, fallback?: number): number;
  boolean(key: string, fallback?: boolean): boolean;
  text(key: string, fallback?: string): string;
  hasActive(situationKey: string): boolean;
  active(situationKey: string): WorldOccurrenceRecord | null;
  activeSituations(): readonly WorldOccurrenceRecord[];
}

export function worldStateView(snapshot: WorldStateSnapshot): WorldStateView {
  const active = snapshot.occurrences.filter((entry) => entry.state === "active");
  return {
    revision: snapshot.revision,
    facts: snapshot.facts,
    value: <T,>(key: string) => snapshot.facts[key] as T | undefined,
    number: (key, fallback = 0) => {
      const value = snapshot.facts[key];
      return typeof value === "number" && Number.isFinite(value) ? value : fallback;
    },
    boolean: (key, fallback = false) => {
      const value = snapshot.facts[key];
      return typeof value === "boolean" ? value : fallback;
    },
    text: (key, fallback = "") => {
      const value = snapshot.facts[key];
      return typeof value === "string" ? value : fallback;
    },
    hasActive: (situationKey) => active.some((entry) => entry.situationKey === situationKey),
    active: (situationKey) =>
      active.find((entry) => entry.situationKey === situationKey) ?? null,
    activeSituations: () => active,
  };
}

/**
 * The one-time-award anchor for something earned inside a specific occurrence.
 *
 * This is what keeps "repeatable" honest: the key changes when — and only when — the
 * world genuinely produced a new appearance of the situation, so a player cannot claim
 * the same ambush twice and does not have to wait for a calendar reset to claim the
 * next one.
 */
export function occurrenceAwardKey(
  occurrence: Pick<WorldOccurrenceRecord, "situationKey" | "id">,
  beat: string,
): string {
  return `${occurrence.situationKey}:${occurrence.id}:${beat}`;
}
