import { CLERIC_ASPECTS } from "./cleric.js";
import { DRUID_ASPECTS } from "./druid.js";
import { MONK_ASPECTS } from "./monk.js";
import { RANGER_ASPECTS } from "./ranger.js";
import {
  resolveAspectModifiers,
  type AspectModifierSet,
} from "./modifiers.js";
import type { AspectNode, AspectTrack, ClassAspects } from "./types.js";
import { WARRIOR_ASPECTS } from "./warrior.js";
import { WIZARD_ASPECTS } from "./wizard.js";

/**
 * Every class's Aspect tracks, and the indices the rest of the server reads.
 *
 * This module knows nothing about abilities on purpose: `abilities/index.ts` imports
 * `ASPECT_UNLOCKS` from here to prove every unlock exists, and if the dependency ran the
 * other way the two files could not check each other at all.
 */

export const ASPECTS_BY_CLASS: readonly ClassAspects[] = [
  WARRIOR_ASPECTS,
  CLERIC_ASPECTS,
  RANGER_ASPECTS,
  DRUID_ASPECTS,
  MONK_ASPECTS,
  WIZARD_ASPECTS,
];

const NODE_INDEX = new Map<string, AspectNode>();
const TRACK_OF_NODE = new Map<string, AspectTrack>();
const CLASS_OF_NODE = new Map<string, number>();

for (const aspects of ASPECTS_BY_CLASS) {
  for (const track of aspects.tracks) {
    for (const node of track.nodes) {
      NODE_INDEX.set(node.id, node);
      TRACK_OF_NODE.set(node.id, track);
      CLASS_OF_NODE.set(node.id, aspects.classId);
    }
  }
}

/** Ability ids that exist only because a node grants them. */
export const ASPECT_UNLOCKS: ReadonlySet<string> = new Set(
  [...NODE_INDEX.values()]
    .map((node) => node.unlocks)
    .filter((id): id is string => Boolean(id)),
);

export function aspectsForClass(classId: number): ClassAspects | null {
  return ASPECTS_BY_CLASS.find((entry) => entry.classId === classId) ?? null;
}

export function aspectNode(nodeId: string): AspectNode | null {
  return NODE_INDEX.get(nodeId) ?? null;
}

export function trackOfNode(nodeId: string): AspectTrack | null {
  return TRACK_OF_NODE.get(nodeId) ?? null;
}

export function classOfNode(nodeId: string): number | null {
  return CLASS_OF_NODE.get(nodeId) ?? null;
}

/** The modifier set for a character's spent points, resolved against authored nodes. */
export function modifiersFor(
  aspectPoints: ReadonlyMap<string, number>,
): AspectModifierSet {
  return resolveAspectModifiers(aspectPoints, aspectNode);
}

/**
 * Static checks on the authored trees.
 *
 * The arithmetic check is the one that matters: if both tracks together cost no more
 * than the points a level-25 character holds, there is no decision in the system and
 * every Warrior ends up identical.
 */
export function validateAspects(
  entries: readonly ClassAspects[] = ASPECTS_BY_CLASS,
  pointsAtCap = 24,
): void {
  const seen = new Set<string>();
  for (const aspects of entries) {
    let classTotal = 0;
    for (const track of aspects.tracks) {
      if (track.nodes.length === 0) throw new Error(`${track.id} has no nodes`);
      let depth = 0;
      for (const node of track.nodes) {
        if (seen.has(node.id)) throw new Error(`duplicate aspect node: ${node.id}`);
        seen.add(node.id);
        if (node.cost < 1) throw new Error(`${node.id} costs nothing`);
        if (node.requiresTrackDepth < 0) throw new Error(`${node.id} has a negative gate`);
        if (node.requiresTrackDepth > depth) {
          throw new Error(
            `${node.id} gates at depth ${node.requiresTrackDepth} but only ${depth} points `
            + "are reachable above it, so it can never be taken",
          );
        }
        depth += node.cost;
        classTotal += node.cost;

        const active = node.kind === "active";
        if (active && !node.unlocks) {
          throw new Error(`${node.id} is an active node that unlocks nothing`);
        }
        if (!active && node.unlocks) {
          throw new Error(`${node.id} unlocks an ability but is not an active node`);
        }
        // A node with neither an unlock nor a modifier is prose. That was the old state
        // of this whole system and is exactly what must not come back.
        if (!node.unlocks && (node.modifiers?.length ?? 0) === 0) {
          throw new Error(
            `${node.id} has no mechanical content; give it modifiers or make it an unlock`,
          );
        }
        if (node.modifies && !(node.modifiers ?? []).some(
          (modifier) => "abilityId" in modifier && modifier.abilityId === node.modifies,
        )) {
          // `modifies` drives the UI's "this changes Brace" line, so it has to agree with
          // what the node actually does.
          const touchesStatus = (node.modifiers ?? []).some(
            (modifier) => modifier.kind === "status_duration",
          );
          if (!touchesStatus) {
            throw new Error(
              `${node.id} claims to modify ${node.modifies} but no modifier mentions it`,
            );
          }
        }
      }
    }
    if (classTotal <= pointsAtCap) {
      throw new Error(
        `class ${aspects.classId} offers ${classTotal} points of nodes against ${pointsAtCap} `
        + "available at the level cap; with nothing given up there is no decision to make",
      );
    }
  }
}

export { aspectPointsForLevel } from "./types.js";
export type { AspectModifierSet, AspectReaction } from "./modifiers.js";
export type { AspectModifier, AspectNode, AspectNodeKind, AspectTrack, ClassAspects } from "./types.js";
