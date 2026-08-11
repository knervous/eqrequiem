import type { RumorDefinition } from "../quest-rumors.js";
import type { QuestWorldContext } from "../quest-types.js";
import { WORLD_SITUATION_FLAG_PREFIX } from "../quest-runtime.js";
import type { WorldSituationDefinition } from "../world-situations.js";
import { WORLD_SITUATIONS } from "./index.js";

/**
 * The channel that makes World Situations reachable by a player.
 *
 * Without this the director is a closed loop: it decides what the world is doing, writes
 * it to global state, and nobody can find out. Every situation already authors *how* it
 * would be noticed — `discovery` — so the rumor network is the natural consumer: the
 * player asks a watchman what is happening and hears the thing that is, in fact,
 * happening.
 *
 * Two properties matter and neither is free:
 *
 * - **Truth.** The rumor is available exactly while the occurrence is active, because
 *   the predicate reads the same published flag the situation writes. Nothing has to
 *   remember to retract it.
 * - **Recurrence without a reset.** The knowledge key carries the occurrence id, so
 *   hearing about tonight's ambush does not stop a player hearing about next week's.
 *   That is the whole difference between a living world and a daily quest board.
 */

interface ActiveOccurrence {
  readonly id: number;
  readonly data?: Readonly<Record<string, unknown>>;
}

function activeOccurrence(
  world: QuestWorldContext,
  situationKey: string,
): ActiveOccurrence | null {
  const flag = world.flags[`${WORLD_SITUATION_FLAG_PREFIX}${situationKey}`];
  if (!flag || typeof flag !== "object") return null;
  const occurrence = flag as ActiveOccurrence;
  return typeof occurrence.id === "number" ? occurrence : null;
}

/**
 * How loudly a given kind of discovery travels.
 *
 * Something people talk about spreads; something you would only know by looking at the
 * ground does not. This keeps the network from turning every trace and sound in the
 * world into tavern gossip.
 */
const TIER_BY_DISCOVERY = {
  rumor: "local",
  sight: "local",
  sound: "local",
  trace: "regional",
  encounter: "regional",
} as const;

/** One rumor per situation, true only while that situation is actually happening. */
export function situationRumors(
  situations: readonly WorldSituationDefinition[] = WORLD_SITUATIONS,
): RumorDefinition[] {
  return situations.map((situation) => ({
    key: `situation:${situation.key}`,
    text: situation.discovery.text,
    tier: TIER_BY_DISCOVERY[situation.discovery.kind],
    // Deliberately modest: a live situation should not crowd out the standing rumors
    // that carry the authored story.
    weight: 6,
    experience: "hint",
    when: (world) => activeOccurrence(world, situation.key) !== null,
    // Occurrence-scoped, so the next appearance is news again. Falls back to the plain
    // key when nothing is active, which only happens for a rumor that is not eligible.
    knowledge: (world) => {
      const occurrence = activeOccurrence(world, situation.key);
      return occurrence
        ? `rumor:situation:${situation.key}:${occurrence.id}`
        : `rumor:situation:${situation.key}`;
    },
  }));
}

/** The subset a given zone's sources would plausibly carry. */
export function situationRumorsForZone(
  zoneKey: string,
  situations: readonly WorldSituationDefinition[] = WORLD_SITUATIONS,
): RumorDefinition[] {
  return situationRumors(
    situations.filter((situation) => situation.key.startsWith(`${zoneKey}:`)),
  );
}
