/**
 * Threat policy.
 *
 * Storage already exists: `NpcEngagementSystem` owns the hate list. This module decides
 * *how much* threat an action is worth and what Taunt means, and returns a plan the
 * engagement system applies. Keeping the two apart means there is still exactly one
 * hate list, and that tuning threat does not require touching pursuit or pathing.
 *
 * The important semantic is Taunt (design §18). It is not a large number — a number can
 * be out-damaged by accident a second later. It is a *position*: raise the taunter just
 * above the current leader, then briefly force attention. That makes a Warrior's hold
 * reliable without making threat meaningless for everyone else.
 */

export interface HateEntry {
  readonly entityId: number;
  readonly hate: number;
}

/** The read side this policy needs. `NpcEngagementSystem` satisfies it. */
export interface HateView {
  hateOf(npcId: number, actorId: number): number;
  /**
   * The highest-hate actor, optionally ignoring one.
   *
   * Taunt needs the exclusion: "raise above the current leader" means the leader the
   * taunter has to overtake. Without it, a Warrior who already holds the enemy would
   * taunt themselves higher on every use and inflate the list indefinitely.
   */
  leader(npcId: number, excludeEntityId?: number): HateEntry | null;
}

export interface ThreatPlan {
  readonly npcId: number;
  readonly actorId: number;
  /** Hate to add. May be zero when the plan is purely forced attention. */
  readonly addHate: number;
  /** Milliseconds of forced attention, for Taunt-like effects. */
  readonly forceAttentionMs?: number;
  readonly reason: "damage" | "healing" | "taunt" | "ability" | "proximity";
}

export interface ThreatRules {
  /** Threat per point of damage. */
  readonly damageMultiplier: number;
  /** Healing generates threat on everything already engaged, at a discount. */
  readonly healingMultiplier: number;
  /** How far above the current leader a taunt places the taunter. */
  readonly tauntMarginPermille: number;
  /** Floor so a taunt on an empty list still establishes the taunter. */
  readonly tauntMinimum: number;
}

export const DEFAULT_THREAT_RULES: ThreatRules = Object.freeze({
  damageMultiplier: 1,
  // Deliberately below damage: a healer should climb the list, but a Warrior who is
  // doing their job should still out-threat a Cleric who is doing theirs.
  healingMultiplier: 0.5,
  tauntMarginPermille: 100,
  tauntMinimum: 10,
});

export function damageThreat(
  npcId: number,
  actorId: number,
  damage: number,
  rules: ThreatRules = DEFAULT_THREAT_RULES,
): ThreatPlan {
  return {
    npcId,
    actorId,
    addHate: Math.max(1, Math.round(Math.max(0, damage) * rules.damageMultiplier)),
    reason: "damage",
  };
}

/**
 * Healing threat spreads across everything currently engaged with the healer's group,
 * which is why it takes a list of NPCs rather than one.
 */
export function healingThreat(
  npcIds: readonly number[],
  actorId: number,
  healing: number,
  rules: ThreatRules = DEFAULT_THREAT_RULES,
): ThreatPlan[] {
  const amount = Math.max(1, Math.round(Math.max(0, healing) * rules.healingMultiplier));
  return npcIds.map((npcId) => ({
    npcId,
    actorId,
    addHate: amount,
    reason: "healing" as const,
  }));
}

/** Explicit threat from an ability's authored `threat` formula. */
export function abilityThreat(
  npcId: number,
  actorId: number,
  amount: number,
): ThreatPlan {
  return {
    npcId,
    actorId,
    addHate: Math.max(0, Math.round(amount)),
    reason: "ability",
  };
}

/**
 * Taunt: move to just above the current leader, then hold attention briefly.
 *
 * Returns the *delta* to add rather than an absolute value, so the engagement system's
 * additive `addHate` stays the only way hate ever changes — one write path, no
 * divergence between "set" and "add" semantics.
 */
export function tauntPlan(
  view: HateView,
  npcId: number,
  actorId: number,
  forceAttentionMs: number,
  rules: ThreatRules = DEFAULT_THREAT_RULES,
): ThreatPlan {
  const leader = view.leader(npcId, actorId);
  const mine = view.hateOf(npcId, actorId);
  // `tauntMarginPermille` is the margin *above* the leader: 100 puts the taunter at
  // 110% of their hate. Reading it as a bare multiplier would place the taunter at a
  // tenth of the leader's threat — a Taunt that reliably fails to taunt.
  const target = leader
    ? Math.max(leader.hate * (1 + rules.tauntMarginPermille / 1000), rules.tauntMinimum)
    : rules.tauntMinimum;
  // Already ahead: the taunt still forces attention, but does not inflate the list.
  const addHate = Math.max(0, Math.ceil(target - mine));
  return { npcId, actorId, addHate, forceAttentionMs, reason: "taunt" };
}

/**
 * Forced attention, tracked per NPC.
 *
 * Bosses reduce the duration rather than ignoring it, so a Warrior's tools still do
 * something against the content where holding is hardest.
 */
export class ForcedAttention {
  readonly #until = new Map<number, { entityId: number; untilMs: number }>();

  force(npcId: number, entityId: number, untilMs: number): void {
    const current = this.#until.get(npcId);
    if (current && current.untilMs > untilMs) return;
    this.#until.set(npcId, { entityId, untilMs });
  }

  /** The entity an NPC must attack right now, or null to use the hate list. */
  target(npcId: number, nowMs: number): number | null {
    const entry = this.#until.get(npcId);
    if (!entry) return null;
    if (entry.untilMs <= nowMs) {
      this.#until.delete(npcId);
      return null;
    }
    return entry.entityId;
  }

  clear(npcId: number): void {
    this.#until.delete(npcId);
  }
}

/** Applies a boss's resistance to being told what to look at. */
export function reducedAttention(
  forceAttentionMs: number,
  reductionPermille: number,
): number {
  const kept = 1 - Math.max(0, Math.min(1000, reductionPermille)) / 1000;
  return Math.max(0, Math.round(forceAttentionMs * kept));
}
