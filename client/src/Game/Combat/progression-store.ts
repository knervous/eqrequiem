import emitter from "@game/Events/events";
import type {
  ProgressionRequestBody,
  ProgressionState,
} from "@game/Net/messages";

/**
 * What the character knows, carries and has spent — the client's mirror of the server's
 * progression state.
 *
 * Like `ability-store`, this imports no transport: `zone-packets` feeds it and the UI
 * reads it, so the module cannot close a cycle with the socket layer. Sending is the
 * caller's job.
 *
 * The state arrives whole rather than as deltas. A panel rebuilt from a complete picture
 * cannot drift out of step with the server, and the whole payload is small enough that
 * the simplicity is free.
 */

class ProgressionStoreImpl {
  #state: ProgressionState | null = null;
  #lastRefusal: string | null = null;

  get state(): ProgressionState | null {
    return this.#state;
  }

  get lastRefusal(): string | null {
    return this.#lastRefusal;
  }

  apply(state: ProgressionState): void {
    this.#state = state;
    this.#lastRefusal = state.refusal ?? null;
    emitter.emit("progressionState", state);
  }

  clear(): void {
    this.#state = null;
    this.#lastRefusal = null;
  }
}

export const ProgressionStore = new ProgressionStoreImpl();

/** The one place a progression request is shaped, so every caller sends the same thing. */
export const progressionRequests = {
  learn: (abilityId: string): ProgressionRequestBody => ({
    type: "learn_ability",
    abilityId,
  }),
  prepare: (abilityId: string, slot: number): ProgressionRequestBody => ({
    type: "prepare_ability",
    abilityId,
    slot,
  }),
  clearSlot: (slot: number): ProgressionRequestBody => ({ type: "clear_slot", slot }),
  spend: (nodeId: string): ProgressionRequestBody => ({
    type: "spend_aspect_point",
    nodeId,
  }),
  respec: (): ProgressionRequestBody => ({ type: "respec_aspects" }),
};

/** Refusals the player can actually meet, in words rather than enum names. */
export const PROGRESSION_REFUSAL_TEXT: Record<string, string> = {
  unknown_ability: "No such technique.",
  wrong_class: "That is not yours to learn.",
  level_too_low: "You are not experienced enough yet.",
  already_known: "You already know that.",
  missing_prerequisite_ability: "You must learn its foundation first.",
  missing_knowledge: "You have not been shown the way to this yet.",
  not_taught_here: "No trainer teaches this — it is found in the world.",
  not_learned: "You have not learned that.",
  invalid_slot: "That slot does not exist.",
  already_prepared: "It is already on your bar.",
  in_combat: "Not while you are fighting.",
  unknown_node: "No such talent.",
  no_points_remaining: "You have no Aspect Points to spend.",
  track_too_shallow: "You must commit further to this Aspect first.",
  already_taken: "You have already taken that.",
};
