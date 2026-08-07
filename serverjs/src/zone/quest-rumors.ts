import { isHail, mentions } from "./quest-dialogue.js";
import { onQuest } from "./quest-types.js";
import type {
  QuestHandlerDefinition,
  QuestLeadKind,
  QuestLeadPlace,
  QuestPlayer,
  QuestWorldContext,
} from "./quest-types.js";

/**
 * Rumors: the diegetic answer to "I don't know what to do".
 *
 * Not a quest board. A rumor is a piece of discoverable world information that
 * circulates through socially obvious channels — gate guards, innkeepers, guildmasters,
 * merchants — because something is actually true in the world, and stops circulating
 * when it stops being true. Hearing one gives the player a thread worth pulling: a fact
 * they now know, sometimes a lead worth writing down. Never a destination marker.
 *
 * This is an authoring layer, not an engine feature: it compiles down to ordinary `say`
 * handlers over the existing event surface.
 */

export type RumorTier = "local" | "faction" | "profession" | "regional" | "secret";

export interface RumorLead {
  readonly leadKey: string;
  readonly questKey?: string;
  readonly kind?: QuestLeadKind;
  /** Defaults to the rumor text. */
  readonly text?: string;
  readonly title?: string;
  readonly place?: QuestLeadPlace;
}

export interface RumorDefinition {
  readonly key: string;
  /** The default phrasing. Individual sources may say it their own way. */
  readonly text: string;
  readonly tier?: RumorTier;
  /** Relative likelihood of being the one told. Higher travels further. */
  readonly weight?: number;
  /** The fact the character learns by hearing it; defaults to `rumor:<key>`. */
  readonly knowledge?: string;
  readonly lead?: RumorLead;
  /** The world condition that makes this rumor true. Absent means always. */
  readonly when?: (world: QuestWorldContext) => boolean;
  /** Once true the rumor is stale and no one repeats it. */
  readonly expiresWhen?: (world: QuestWorldContext) => boolean;
  /** Per-source phrasing, keyed by NPC name. */
  readonly variants?: Readonly<Record<string, string>>;
  /** One-time experience for learning something genuinely new. */
  readonly experience?: number;
}

export interface RumorSourceOptions {
  /** Which tiers this source is plausibly party to. Defaults to local only. */
  readonly tiers?: readonly RumorTier[];
  /** Said when the source knows nothing the character has not already heard. */
  readonly quiet?: string;
  /** Extra phrasings that count as asking for news. */
  readonly aliases?: readonly string[];
}

const ASK_PHRASES = [
  "news",
  "rumor",
  "rumors",
  "what news",
  "gossip",
  "happening",
  "heard",
  "talk",
] as const;

/** A source's stock of rumors, resolved against the world and the character. */
export class RumorNetwork {
  readonly #rumors = new Map<string, RumorDefinition>();

  define(...rumors: readonly RumorDefinition[]): this {
    for (const rumor of rumors) this.#rumors.set(rumor.key, rumor);
    return this;
  }

  get rumors(): readonly RumorDefinition[] {
    return [...this.#rumors.values()];
  }

  /**
   * Rumors that are currently true, that this source would plausibly carry, and that
   * the character has not already heard. Eligibility is causal, never a quota.
   */
  eligible(
    world: QuestWorldContext,
    tiers: readonly RumorTier[],
    player: QuestPlayer,
  ): readonly RumorDefinition[] {
    return this.rumors.filter((rumor) => {
      if (!tiers.includes(rumor.tier ?? "local")) return false;
      if (rumor.when && !rumor.when(world)) return false;
      if (rumor.expiresWhen?.(world)) return false;
      return !player.knowledge.has(knowledgeKey(rumor));
    });
  }

  /**
   * Deterministic weighted pick. Two characters asking the same guard need not hear the
   * same thing, but the same character asking twice in the same state always does.
   */
  select(
    eligible: readonly RumorDefinition[],
    seed: string,
  ): RumorDefinition | null {
    if (eligible.length === 0) return null;
    const ordered = [...eligible].sort((left, right) =>
      (right.weight ?? 5) - (left.weight ?? 5) || left.key.localeCompare(right.key));
    const total = ordered.reduce((sum, rumor) => sum + Math.max(1, rumor.weight ?? 5), 0);
    let cursor = hash(seed) % total;
    for (const rumor of ordered) {
      cursor -= Math.max(1, rumor.weight ?? 5);
      if (cursor < 0) return rumor;
    }
    return ordered[0] ?? null;
  }

  /** Builds the `say` handler that turns one NPC into a rumor source. */
  sourceHandler(
    npcName: string,
    options: RumorSourceOptions = {},
  ): QuestHandlerDefinition<"say"> {
    const tiers = options.tiers ?? ["local"];
    const quiet = options.quiet ?? "Nothing worth repeating, friend.";
    const asks = [...ASK_PHRASES, ...(options.aliases ?? [])];
    return onQuest("say", {}, ({ initiator, npc, message, zone }) => {
      if (initiator.kind !== "player") return;
      const player = initiator as QuestPlayer;
      // A hail is not a request for news; the player has to actually ask.
      if (isHail(message) || !mentions(message, ...asks)) return;
      const eligible = this.eligible(zone.world, tiers, player);
      const heard = player.knowledge.keys().filter((key) => key.startsWith("rumor:")).length;
      const rumor = this.select(eligible, `${player.characterId ?? 0}:${heard}`);
      if (!rumor) {
        npc.say(quiet);
        return;
      }
      npc.say(rumor.variants?.[npcName] ?? rumor.text);
      player.knowledge.learn(knowledgeKey(rumor));
      if (rumor.lead) {
        player.journal.discover(rumor.lead.leadKey, {
          kind: rumor.lead.kind ?? "rumor",
          text: rumor.lead.text ?? rumor.text,
          ...(rumor.lead.title === undefined ? {} : { title: rumor.lead.title }),
          ...(rumor.lead.place === undefined ? {} : { place: rumor.lead.place }),
          ...(rumor.lead.questKey === undefined ? {} : { questKey: rumor.lead.questKey }),
        });
      }
      if (rumor.experience) {
        player.progression.awardXpOnce(`rumor:${rumor.key}`, rumor.experience, {
          source: "discovery",
        });
      }
    });
  }
}

export function rumorKnowledgeKey(rumor: RumorDefinition | string): string {
  return typeof rumor === "string" ? `rumor:${rumor}` : knowledgeKey(rumor);
}

function knowledgeKey(rumor: RumorDefinition): string {
  return rumor.knowledge ?? `rumor:${rumor.key}`;
}

/** Small stable string hash; deterministic across processes and restarts. */
function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}
