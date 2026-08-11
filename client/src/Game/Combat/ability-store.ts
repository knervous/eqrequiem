import emitter from "@game/Events/events";
import type {
  AbilityDescriptor,
  AbilityLoadout,
  AbilityResult,
  PreparedAbility,
} from "@game/Net/messages";

/**
 * This module deliberately imports no transport.
 *
 * `zone-packets` imports the store, and the socket layer imports `zone-packets` back;
 * pulling `WorldSocket` in here closed that loop, and the decorator metadata at the top
 * of `zone-packets` then evaluated while its own message imports were still in the
 * temporal dead zone — "AbilityLoadout is not defined" at zone entry. Sending is the
 * caller's job, which keeps the store a plain piece of state.
 */

/**
 * What this character can do, and what the server said about the last attempt.
 *
 * The client deliberately keeps no cooldown timers of its own beyond what the server
 * reports. `CombatantRuntime` is authoritative, and a locally-run duplicate would drift
 * the first time a packet arrived late — a hotbar that looks ready while the server
 * refuses is worse than one that lights up slightly behind.
 */

export interface AbilityUiState extends PreparedAbility {
  /** Absolute server time the ability is usable again, or 0. */
  readyAtMs: number;
  /**
   * The same moment on the client's own clock.
   *
   * The server reports its deadline in simulation time, which the client has no way to
   * convert. Rather than sync clocks for a cosmetic sweep, the deadline is rebuilt from
   * the authored cooldown the loadout already carries — accurate to the same millisecond
   * the server used, without another thing to keep in step.
   */
  readyAtLocalMs: number;
}

class AbilityStoreImpl {
  #learned: AbilityDescriptor[] = [];
  #prepared: AbilityUiState[] = [];
  #lastRefusal: { abilityId: string; reason: string } | null = null;

  get prepared(): readonly AbilityUiState[] {
    return this.#prepared;
  }

  get learned(): readonly AbilityDescriptor[] {
    return this.#learned;
  }

  get lastRefusal(): { abilityId: string; reason: string } | null {
    return this.#lastRefusal;
  }

  /** The ability in a hotbar slot, or null when the slot is empty. */
  inSlot(slot: number): AbilityUiState | null {
    return this.#prepared.find((entry) => entry.slot === slot) ?? null;
  }

  applyLoadout(loadout: AbilityLoadout): void {
    this.#learned = loadout.learned ?? [];
    this.#prepared = (loadout.prepared ?? []).map((entry) => ({
      ...entry,
      readyAtMs: 0,
      readyAtLocalMs: 0,
    }));
    emitter.emit("abilityLoadout", this.#prepared);
  }

  applyResult(result: AbilityResult): void {
    const entry = this.#prepared.find(
      (candidate) => candidate.abilityId === result.abilityId,
    );
    if (result.ok) {
      this.#lastRefusal = null;
      if (entry) {
        entry.readyAtMs = Math.max(
          result.cooldownEndsAtMs ?? 0,
          result.recoveryEndsAtMs ?? 0,
        );
        entry.readyAtLocalMs = Date.now() + Math.max(entry.cooldownMs, entry.recoveryMs);
      }
    } else {
      this.#lastRefusal = {
        abilityId: result.abilityId,
        reason: result.reason ?? "unknown",
      };
      // A timing refusal still carries useful information: when it will work.
      if (entry && result.readyAtMs) entry.readyAtMs = result.readyAtMs;
    }
    emitter.emit("abilityResult", result);
  }

  clear(): void {
    this.#learned = [];
    this.#prepared = [];
    this.#lastRefusal = null;
  }

}

export const AbilityStore = new AbilityStoreImpl();

/** Human-readable refusals. The server names twelve; these are the ones a player meets. */
export const REFUSAL_TEXT: Record<string, string> = {
  not_learned: "You have not learned that.",
  not_prepared: "That is not on your bar.",
  level_too_low: "You are not skilled enough yet.",
  wrong_class: "That is not yours to use.",
  on_cooldown: "Not ready yet.",
  recovering: "You are still recovering.",
  insufficient_resource: "You lack the vigor.",
  no_charges: "You have none left.",
  requirement_unmet: "You lack what that requires.",
  invalid_target: "You need a target.",
  out_of_range: "You are too far away.",
  actor_incapacitated: "You cannot act.",
  unknown_ability: "Nothing happens.",
};
