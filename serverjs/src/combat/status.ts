import type { StatusDefinition } from "./ability-types.js";

/**
 * Statuses: buffs, debuffs, damage-over-time and every form of control.
 *
 * Root, snare, stun, silence and knockdown are not separate systems — they are statuses
 * carrying a `control` field. That keeps one expiry path, one stacking policy and one
 * place where "can this actor act" is answered, instead of four subsystems that each
 * forget a different edge case.
 *
 * Ticks are scheduled against simulation time on the design's 1-second cadence, never
 * against frames, so a slow shard produces the same total damage as a fast one.
 */

export interface ActiveStatus {
  readonly definition: StatusDefinition;
  readonly sourceEntityId: number;
  readonly appliedAtMs: number;
  expiresAtMs: number;
  nextTickAtMs: number;
  /** For `stack` statuses. Always 1 for the others. */
  stacks: number;
  /** Authored magnitude retained after resistance, 0–1. */
  potency: number;
}

export interface StatusTick {
  readonly statusId: string;
  readonly sourceEntityId: number;
  readonly stacks: number;
  readonly potency: number;
}

/** What an actor may currently do. Derived, never stored. */
export interface ControlState {
  readonly canAct: boolean;
  readonly canMove: boolean;
  readonly canCastSpells: boolean;
  /** 1 = full speed, 0 = rooted. */
  readonly movementMultiplier: number;
}

export const UNIMPAIRED: ControlState = Object.freeze({
  canAct: true,
  canMove: true,
  canCastSpells: true,
  movementMultiplier: 1,
});

/** How much a snare slows. Authored as one number because it is a game-feel constant. */
const SNARE_MULTIPLIER = 0.4;

export class StatusSet {
  readonly #active = new Map<string, ActiveStatus[]>();

  /**
   * Applies a status under its authored stacking rule.
   *
   * Stacking is per-definition rather than global because the right answer genuinely
   * differs: a Warrior's Brace should refresh, two Druids' DoTs should be independent,
   * and a weaker Disarm should not overwrite a stronger one.
   */
  apply(
    definition: StatusDefinition,
    options: {
      readonly nowMs: number;
      readonly sourceEntityId: number;
      readonly durationMs?: number;
      readonly potency?: number;
    },
  ): ActiveStatus {
    const durationMs = options.durationMs ?? definition.durationMs;
    const potency = options.potency ?? 1;
    const existing = this.#active.get(definition.id) ?? [];
    const fresh: ActiveStatus = {
      definition,
      sourceEntityId: options.sourceEntityId,
      appliedAtMs: options.nowMs,
      expiresAtMs: options.nowMs + durationMs,
      nextTickAtMs: definition.tick
        ? options.nowMs + definition.tick.everyMs
        : Number.POSITIVE_INFINITY,
      stacks: 1,
      potency,
    };

    switch (definition.stacking) {
      case "independent_by_caster": {
        const mine = existing.find((entry) => entry.sourceEntityId === options.sourceEntityId);
        if (mine) {
          mine.expiresAtMs = fresh.expiresAtMs;
          mine.potency = potency;
          return mine;
        }
        existing.push(fresh);
        break;
      }
      case "stack": {
        const first = existing[0];
        if (first) {
          first.stacks += 1;
          first.expiresAtMs = fresh.expiresAtMs;
          return first;
        }
        existing.push(fresh);
        break;
      }
      case "replace_weaker": {
        const first = existing[0];
        if (first) {
          if (potency < first.potency) return first;
          existing[0] = fresh;
          this.#active.set(definition.id, existing);
          return fresh;
        }
        existing.push(fresh);
        break;
      }
      case "unique": {
        const first = existing[0];
        if (first) return first;
        existing.push(fresh);
        break;
      }
      case "refresh":
      default: {
        const first = existing[0];
        if (first) {
          first.expiresAtMs = fresh.expiresAtMs;
          first.potency = potency;
          first.nextTickAtMs = fresh.nextTickAtMs;
          return first;
        }
        existing.push(fresh);
        break;
      }
    }

    this.#active.set(definition.id, existing);
    return fresh;
  }

  has(statusId: string): boolean {
    return (this.#active.get(statusId)?.length ?? 0) > 0;
  }

  get(statusId: string): readonly ActiveStatus[] {
    return this.#active.get(statusId) ?? [];
  }

  all(): ActiveStatus[] {
    return [...this.#active.values()].flat();
  }

  remove(statusId: string): boolean {
    return this.#active.delete(statusId);
  }

  /** Dispel: strips up to `count` statuses matching a predicate. */
  removeWhere(
    predicate: (status: ActiveStatus) => boolean,
    count = Number.POSITIVE_INFINITY,
  ): number {
    let removed = 0;
    for (const [id, list] of this.#active) {
      const kept = list.filter((status) => {
        if (removed >= count || !predicate(status)) return true;
        removed += 1;
        return false;
      });
      if (kept.length === 0) this.#active.delete(id);
      else this.#active.set(id, kept);
    }
    return removed;
  }

  /**
   * Damage can break control. Whether it does is authored per status, because "root
   * breaks on damage" is a design decision per spell, not a universal rule — a Wizard's
   * Root Sigil and a Druid's Entangling Roots may reasonably differ.
   */
  onDamaged(): string[] {
    const broken: string[] = [];
    for (const [id, list] of this.#active) {
      const kept = list.filter((status) => {
        if (!status.definition.breaksOnDamage) return true;
        broken.push(id);
        return false;
      });
      if (kept.length === 0) this.#active.delete(id);
      else this.#active.set(id, kept);
    }
    return broken;
  }

  /** Expires elapsed statuses and returns the ticks that came due. */
  advance(nowMs: number): StatusTick[] {
    const ticks: StatusTick[] = [];
    for (const [id, list] of this.#active) {
      const kept: ActiveStatus[] = [];
      for (const status of list) {
        if (status.expiresAtMs <= nowMs) continue;
        const cadence = status.definition.tick?.everyMs;
        if (cadence !== undefined) {
          // Catch up rather than drop ticks, so a slow shard does not silently reduce
          // a damage-over-time's total output.
          while (status.nextTickAtMs <= nowMs) {
            ticks.push({
              statusId: id,
              sourceEntityId: status.sourceEntityId,
              stacks: status.stacks,
              potency: status.potency,
            });
            status.nextTickAtMs += cadence;
          }
        }
        kept.push(status);
      }
      if (kept.length === 0) this.#active.delete(id);
      else this.#active.set(id, kept);
    }
    return ticks;
  }

  /** What the actor may do, derived from whatever control statuses are present. */
  controlState(): ControlState {
    let canAct = true;
    let canMove = true;
    let canCastSpells = true;
    let movementMultiplier = 1;

    for (const status of this.all()) {
      switch (status.definition.control) {
        case "stun":
        case "knockdown":
          canAct = false;
          canMove = false;
          canCastSpells = false;
          movementMultiplier = 0;
          break;
        case "root":
          canMove = false;
          movementMultiplier = 0;
          break;
        case "snare":
          movementMultiplier = Math.min(movementMultiplier, SNARE_MULTIPLIER);
          break;
        case "silence":
          canCastSpells = false;
          break;
        default:
          break;
      }
    }

    return { canAct, canMove, canCastSpells, movementMultiplier };
  }
}

/**
 * Interrupt.
 *
 * Player combat spells are instant, so interrupts exist for *enemies*: readable windups
 * and channels are what give the ability tactical value. An interrupt that had nothing
 * to bite on would be a dead button, so this returns whether it actually landed.
 */
export interface InterruptibleAction {
  readonly abilityId: string;
  readonly startedAtMs: number;
  readonly completesAtMs: number;
  readonly interruptible: boolean;
}

export function interrupt(
  action: InterruptibleAction | null,
  nowMs: number,
): { readonly interrupted: boolean; readonly abilityId?: string } {
  if (!action || !action.interruptible) return { interrupted: false };
  if (action.completesAtMs <= nowMs) return { interrupted: false };
  return { interrupted: true, abilityId: action.abilityId };
}
