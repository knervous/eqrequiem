import { abilityById, abilitiesForClass } from "../combat/abilities/index.js";
import { ASPECTS_BY_CLASS, aspectNode, aspectsForClass } from "../combat/aspects/index.js";
import type { TechniqueRepository } from "./technique-repository.js";
import {
  availablePoints,
  canLearn,
  canPrepare,
  canSpendAspectPoint,
  LOADOUT,
  newlyLearnable,
  slotKind,
  trackDepth,
  type CharacterTechniqueState,
} from "./technique-progression.js";

/**
 * What a player may ask of their own progression, decided once for both runtimes.
 *
 * The rules already existed in `technique-progression.ts` and the writes in
 * `technique-repository.ts`; what was missing was anything that called them. This module
 * is that caller, and it lives here rather than in a backend because whether a character
 * may learn Shield Bash is a gameplay decision, not a delivery concern.
 *
 * Every request answers with a refusal string rather than throwing, because the client
 * turns refusals into a sentence the player reads.
 */

export type ProgressionRequest =
  | { readonly type: "learn_ability"; readonly abilityId: string }
  | { readonly type: "prepare_ability"; readonly abilityId: string; readonly slot: number }
  | { readonly type: "clear_slot"; readonly slot: number }
  | { readonly type: "spend_aspect_point"; readonly nodeId: string }
  | { readonly type: "respec_aspects" };

export type ProgressionRefusal =
  | "unknown_ability"
  | "wrong_class"
  | "level_too_low"
  | "already_known"
  | "missing_prerequisite_ability"
  | "missing_knowledge"
  | "not_taught_here"
  | "not_learned"
  | "invalid_slot"
  | "already_prepared"
  | "in_combat"
  | "unknown_node"
  | "no_points_remaining"
  | "track_too_shallow"
  | "already_taken";

export interface ProgressionIdentity {
  readonly characterId: number;
  readonly level: number;
  readonly classId: number;
  readonly knowledge: ReadonlySet<string>;
  /** Loadout changes are locked in combat; learning is not. */
  readonly inCombat: boolean;
}

export interface ProgressionResult {
  readonly ok: boolean;
  readonly refusal?: ProgressionRefusal;
  /** What changed, for the message the client shows. */
  readonly learned?: string;
  readonly spent?: string;
}

/**
 * Sources a trainer can teach.
 *
 * A technique whose acquisition is a class quest, a recovered manual or an Aspect node
 * is not refused here because the player lacks something — it is refused because this is
 * the wrong way to get it. Keeping that distinct from `level_too_low` is what lets the
 * UI say "the Watch captain will show you this" instead of "no".
 */
const TEACHABLE = new Set(["trainer", "advanced_trainer", "class_quest", "research"]);

export async function applyProgressionRequest(
  repository: TechniqueRepository,
  identity: ProgressionIdentity,
  request: ProgressionRequest,
): Promise<ProgressionResult> {
  return repository.transaction((transactionRepository) =>
    applyProgressionRequestInTransaction(transactionRepository, identity, request)
  );
}

/**
 * Validation belongs inside the transaction with the writes it authorizes. Besides
 * keeping learn-and-prepare and Aspect unlocks indivisible, this prevents the request
 * from acting on progression state that changed while it waited for the transaction.
 */
export async function applyProgressionRequestInTransaction(
  repository: TechniqueRepository,
  identity: ProgressionIdentity,
  request: ProgressionRequest,
): Promise<ProgressionResult> {
  const state = await loadState(repository, identity);

  switch (request.type) {
    case "learn_ability": {
      const ability = abilityById(request.abilityId);
      if (!ability) return { ok: false, refusal: "unknown_ability" };
      if (!TEACHABLE.has(ability.acquisition.source)) {
        return { ok: false, refusal: "not_taught_here" };
      }
      const refusal = canLearn(request.abilityId, state);
      if (refusal) return { ok: false, refusal };
      await repository.learn(
        identity.characterId,
        request.abilityId,
        state,
        ability.acquisition.source,
      );
      // A newly learned technique goes straight to the first free slot. Learning
      // something and then finding it nowhere is a worse first impression than any
      // loadout decision is worth, and the player can move it immediately.
      const free = firstFreeSlot(state);
      if (free !== null && !identity.inCombat) {
        await repository.prepare(
          identity.characterId,
          request.abilityId,
          free,
          { ...state, learned: new Set([...state.learned, request.abilityId]) },
          false,
        );
      }
      return { ok: true, learned: request.abilityId };
    }

    case "prepare_ability": {
      const refusal = canPrepare(
        request.abilityId,
        request.slot,
        state,
        identity.inCombat,
      );
      if (refusal) return { ok: false, refusal };
      await repository.prepare(
        identity.characterId,
        request.abilityId,
        request.slot,
        state,
        identity.inCombat,
      );
      return { ok: true };
    }

    case "clear_slot": {
      if (identity.inCombat) return { ok: false, refusal: "in_combat" };
      if (slotKind(request.slot) === null) return { ok: false, refusal: "invalid_slot" };
      await repository.clearSlot(identity.characterId, request.slot, identity.inCombat);
      return { ok: true };
    }

    case "spend_aspect_point": {
      const refusal = canSpendAspectPoint(request.nodeId, state);
      if (refusal) return { ok: false, refusal };
      await repository.spendAspectPoint(identity.characterId, request.nodeId, state);
      // An active node's ability becomes known the moment the point is spent, so the
      // unlock is a technique the player owns rather than a passive they cannot see.
      const node = aspectNode(request.nodeId);
      if (node?.unlocks) {
        const after = await loadState(repository, identity);
        await repository.learn(identity.characterId, node.unlocks, after, "aspect");
        const free = firstFreeSlot(after);
        if (free !== null && !identity.inCombat) {
          await repository.prepare(
            identity.characterId,
            node.unlocks,
            free,
            { ...after, learned: new Set([...after.learned, node.unlocks]) },
            false,
          );
        }
      }
      return { ok: true, spent: request.nodeId };
    }

    case "respec_aspects": {
      await repository.respecAspects(identity.characterId);
      // Techniques an unlock granted stay known — a respec changes emphasis, never
      // knowledge — but they stop being usable, which the gate already enforces because
      // the node no longer exists to grant them.
      return { ok: true };
    }
  }
}

function firstFreeSlot(state: CharacterTechniqueState): number | null {
  for (let slot = 0; slot < LOADOUT.primarySlots; slot++) {
    if (!state.prepared.has(slot)) return slot;
  }
  return null;
}

async function loadState(
  repository: TechniqueRepository,
  identity: ProgressionIdentity,
): Promise<CharacterTechniqueState> {
  return repository.load(
    identity.characterId,
    { level: identity.level, classId: identity.classId },
    identity.knowledge,
  );
}

// ---------------------------------------------------------------------------
// The snapshot the UI draws
// ---------------------------------------------------------------------------

export interface ProgressionAbilityView {
  readonly abilityId: string;
  readonly name: string;
  readonly kind: string;
  readonly minLevel: number;
  readonly cooldownMs: number;
  readonly recoveryMs: number;
  readonly resource: string | null;
  readonly resourceAmount: number;
  readonly targetKind: string;
  readonly rangeMetres: number;
  readonly acquisition: string;
  readonly tags: readonly string[];
  readonly known: boolean;
  /** Learnable right now from a trainer. */
  readonly learnable: boolean;
  /** Why it is not learnable, when it is not. */
  readonly refusal: ProgressionRefusal | null;
}

export interface ProgressionNodeView {
  readonly nodeId: string;
  readonly name: string;
  readonly effect: string;
  readonly kind: string;
  readonly cost: number;
  readonly requiresTrackDepth: number;
  readonly modifies: string | null;
  readonly unlocks: string | null;
  readonly points: number;
  readonly affordable: boolean;
  readonly refusal: ProgressionRefusal | null;
}

export interface ProgressionTrackView {
  readonly trackId: string;
  readonly name: string;
  readonly focus: string;
  readonly depth: number;
  readonly nodes: readonly ProgressionNodeView[];
}

export interface ProgressionState {
  readonly level: number;
  readonly classId: number;
  readonly slots: {
    readonly primary: number;
    readonly reaction: number;
    readonly consumable: number;
  };
  readonly prepared: readonly { readonly slot: number; readonly abilityId: string }[];
  readonly abilities: readonly ProgressionAbilityView[];
  readonly aspectPointsAvailable: number;
  readonly aspectPointsSpent: number;
  readonly tracks: readonly ProgressionTrackView[];
  readonly neverLost: readonly string[];
}

/**
 * Everything the Abilities and Aspects panels need, in one push.
 *
 * Sent whole rather than as deltas: it is a few kilobytes, it is only sent when
 * something changed, and a panel that reconstructs itself from a complete picture cannot
 * drift out of sync with the server the way an incremental one can.
 */
export async function progressionState(
  repository: TechniqueRepository,
  identity: ProgressionIdentity,
): Promise<ProgressionState> {
  const state = await loadState(repository, identity);
  const learnableNow = new Set(newlyLearnable(state).map((ability) => ability.id));
  const aspects = aspectsForClass(identity.classId)
    ?? ASPECTS_BY_CLASS.find((entry) => entry.classId === identity.classId);
  const available = availablePoints(state);

  return {
    level: identity.level,
    classId: identity.classId,
    slots: {
      primary: LOADOUT.primarySlots,
      reaction: LOADOUT.reactionSlots,
      consumable: LOADOUT.consumableSlots,
    },
    prepared: [...state.prepared.entries()].map(([slot, abilityId]) => ({ slot, abilityId })),
    abilities: abilitiesForClass(identity.classId).map((ability) => {
      const known = state.learned.has(ability.id);
      const refusal = known ? null : canLearn(ability.id, state);
      const teachable = TEACHABLE.has(ability.acquisition.source);
      return {
        abilityId: ability.id,
        name: ability.name,
        kind: ability.kind,
        minLevel: ability.minLevel,
        cooldownMs: ability.cooldownMs,
        recoveryMs: ability.recoveryMs,
        resource: ability.resource?.type ?? null,
        resourceAmount: ability.resource?.amount ?? 0,
        targetKind: ability.target.kind,
        rangeMetres: ability.target.rangeMetres ?? 0,
        acquisition: ability.acquisition.source,
        tags: ability.tags ?? [],
        known,
        learnable: !known && teachable && learnableNow.has(ability.id),
        refusal: known ? null : teachable ? refusal : "not_taught_here",
      };
    }),
    aspectPointsAvailable: available,
    aspectPointsSpent: [...state.aspectPoints.values()].reduce((sum, n) => sum + n, 0),
    tracks: (aspects?.tracks ?? []).map((track) => ({
      trackId: track.id,
      name: track.name,
      focus: track.focus,
      depth: trackDepth(track.id, state.aspectPoints),
      nodes: track.nodes.map((node) => {
        const points = state.aspectPoints.get(node.id) ?? 0;
        const refusal = points > 0 ? null : canSpendAspectPoint(node.id, state);
        return {
          nodeId: node.id,
          name: node.name,
          effect: node.effect,
          kind: node.kind,
          cost: node.cost,
          requiresTrackDepth: node.requiresTrackDepth,
          modifies: node.modifies ?? null,
          unlocks: node.unlocks ?? null,
          points,
          affordable: refusal === null,
          refusal,
        };
      }),
    })),
    neverLost: aspects?.neverLost ?? [],
  };
}
