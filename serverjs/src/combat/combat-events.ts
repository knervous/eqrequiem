import type { ResourceType } from "./ability-types.js";
import type { PhysicalOutcome, SpellOutcome } from "./resolution.js";

/**
 * What the server tells clients happened, and the contract that lets a client predict.
 *
 * Instant-activation combat makes prediction load-bearing rather than a nicety: at
 * ordinary transatlantic latency, waiting for a round trip before the animation starts
 * would undo the responsiveness the whole model exists for. So the client is allowed to
 * start things that are cosmetic and reversible, and the server owns everything that is
 * not.
 *
 * `actionId` is the hinge. The client mints a provisional one when it predicts; the
 * server echoes the authoritative one back; reconciliation is matching them up.
 */

/** Exactly what a client may start before hearing from the server. */
export const CLIENT_PREDICTABLE = Object.freeze([
  "animation_start",
  "cooldown_display",
  "movement",
  "target_highlight",
  "projectile_visual",
] as const);

/** What only the server decides. A client that assumes any of these will desync. */
export const SERVER_AUTHORITATIVE = Object.freeze([
  "action_validity",
  "resource_commitment",
  "hit_or_resist",
  "damage_or_heal",
  "status_state",
  "threat",
  "death",
  "experience_and_loot",
] as const);

export interface CombatResultEvent {
  /** Stable per activation; the anchor for dedupe and reconciliation. */
  readonly actionId: string;
  readonly sourceId: number;
  readonly targetId: number;
  readonly abilityId: string;
  readonly result: PhysicalOutcome | SpellOutcome | "applied" | "refused";
  readonly amount?: number;
  readonly statusIds?: readonly string[];
  readonly resourceDelta?: { readonly type: ResourceType; readonly amount: number };
  readonly cooldownEndsAtMs?: number;
}

/**
 * Sent when the server disagrees with a prediction the client already showed.
 *
 * Carrying the reason matters: a client that only learns "no" has to guess whether to
 * refund the cooldown display, snap the animation, or both. A client that learns
 * "out_of_range" can show the right feedback and keep the cooldown unspent.
 */
export interface CombatReconciliation {
  readonly predictedActionId: string;
  readonly accepted: boolean;
  readonly reason?: string;
  /** Present when the server accepted but with different timing than predicted. */
  readonly authoritative?: {
    readonly actionId: string;
    readonly cooldownEndsAtMs: number;
    readonly recoveryEndsAtMs: number;
  };
}

/**
 * Provisional ids are namespaced so they can never collide with a server id, which
 * makes an un-reconciled prediction obvious in a log rather than subtly wrong.
 */
export function predictedActionId(entityId: number, sequence: number): string {
  return `p:${entityId}:${sequence}`;
}

export function isPredictedActionId(actionId: string): boolean {
  return actionId.startsWith("p:");
}

/**
 * How long a client may show a predicted action before treating silence as a refusal.
 *
 * Generous enough to cover ordinary transatlantic latency, short enough that a dropped
 * packet does not leave a phantom cooldown on the bar.
 */
export const PREDICTION_TIMEOUT_MS = 2_000;

/**
 * Input buffering window. Accepting a keypress slightly before recovery ends is what
 * makes the cadence feel like the player's rhythm rather than the server's.
 */
export const INPUT_BUFFER_MS = 150;

/** Whether an input arriving now should be queued rather than refused outright. */
export function shouldBufferInput(
  nowMs: number,
  readyAtMs: number,
  bufferMs = INPUT_BUFFER_MS,
): boolean {
  return readyAtMs > nowMs && readyAtMs - nowMs <= bufferMs;
}
