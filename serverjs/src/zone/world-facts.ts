/**
 * The world's global facts, in one place.
 *
 * This set is deliberately tiny. Character knowledge — what one person has learned,
 * seen or been told — carries almost all story detail; a global fact is only for
 * something every player in every shard must agree on, because changing one changes
 * what the world is currently doing. Adding a fact per quest branch would recreate the
 * flag soup this design exists to avoid.
 */

export const WORLD_FACTS = {
  /** Which chapter of the returning-magic story the world is in. Advanced by release. */
  storyEra: "story.era",
  /** 0–100. How aggressive Blackroot's raids are, and whether the road is dangerous. */
  blackrootPressure: "blackroot.pressure",
  /** Whether a caravan is currently expected along the Greymarch roads. */
  greymarchCaravanDue: "greymarch.caravan_due",
  /** What the Greenveil is doing: "calm" | "bloom" | "restless". */
  greenveilDisturbance: "greenveil.disturbance",
  /** 0–1. How strongly the Mournvault is answering the returning magic. */
  mournvaultResonance: "mournvault.resonance",
  /**
   * 0–100. How much relic traffic is moving through Lowharbor's docks.
   *
   * The one fact the harbour needs of its own: it is what makes a fence worth finding, a
   * handoff worth watching, and a foreign hull worth boarding — and it rises as the
   * Mournvault stirs, so the two ends of the story move together.
   */
  lowharborRelicTrade: "lowharbor.relic_trade",
} as const;

export type WorldFactKey = (typeof WORLD_FACTS)[keyof typeof WORLD_FACTS];

/**
 * Starting values for a fresh world. Written only when a key has never been persisted,
 * so a running world is never reset by a deploy.
 */
export const DEFAULT_WORLD_FACTS: Readonly<Record<WorldFactKey, unknown>> = {
  [WORLD_FACTS.storyEra]: 1,
  [WORLD_FACTS.blackrootPressure]: 35,
  [WORLD_FACTS.greymarchCaravanDue]: false,
  [WORLD_FACTS.greenveilDisturbance]: "calm",
  [WORLD_FACTS.mournvaultResonance]: 0.1,
  [WORLD_FACTS.lowharborRelicTrade]: 20,
};
