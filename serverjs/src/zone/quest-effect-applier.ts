import type {
  CharacterJournalNote,
  CharacterProgressRepository,
} from "../progression/character-progress-repository.js";
import type { QuestPersistenceBatch } from "./quest-manager.js";
import type { QuestJournalEntry } from "./quest-state.js";
import { isPersistentQuestEffect, type QuestEffect } from "./quest-types.js";

/**
 * What the applier needs from a shard. `QuestManager` satisfies it directly in-process;
 * the worker path supplies an adapter over the effects it posted across the thread
 * boundary, so both runtimes commit through exactly one implementation.
 */
export interface QuestEffectSource {
  journalFor(sessionId: number): readonly QuestJournalEntry[];
  drainPersistence(): readonly QuestPersistenceBatch[];
  character(sessionId: number): { readonly characterId: number | null } | null;
  setCharacterProgression(sessionId: number, experience: number, level: number): void;
  dispatchLevelUp(options: {
    readonly tick: number;
    readonly sessionId: number;
    readonly level: number;
    readonly previousLevel: number;
  }): readonly QuestEffect[];
}

export interface QuestClientDelivery {
  readonly sessionId: number;
  readonly type:
    | "journal_update"
    | "experience_update"
    | "level_update"
    | "channel_message";
  readonly value: Record<string, unknown>;
}

export interface QuestJournalPayload {
  readonly entries: readonly QuestJournalEntry[];
  /** What the player chose to keep, alongside what the world told them. */
  readonly notes: readonly CharacterJournalNote[];
  /** The lead that just changed, so the client can highlight it without diffing. */
  readonly changed: {
    readonly questKey: string;
    readonly leadKey: string;
    readonly reason: "discovered" | "resolved" | "archived";
  } | null;
}

/**
 * Commits the persistent side of quest effects and turns them into client deliveries.
 *
 * This is the defensive boundary the design asks for: handlers stay easy to write and
 * synchronous, while every persistent consequence lands here exactly once, in one place,
 * with the progression service as the only writer of experience and level.
 */
export class QuestEffectApplier {
  constructor(
    private readonly repository: CharacterProgressRepository,
    private readonly options: {
      readonly onLog?: (questId: string, message: string) => void;
    } = {},
  ) {}

  async apply(
    manager: QuestEffectSource,
    effects: readonly QuestEffect[],
    context: { readonly tick: number } = { tick: 0 },
  ): Promise<readonly QuestClientDelivery[]> {
    const deliveries: QuestClientDelivery[] = [];
    const journalDirty = new Map<number, QuestJournalPayload["changed"]>();
    const experienceBySession = new Map<number, number>();

    for (const effect of effects) {
      if (effect.type === "log") {
        this.options.onLog?.(effect.questId, effect.message);
        continue;
      }
      if (!isPersistentQuestEffect(effect)) continue;
      switch (effect.type) {
        case "journal_discover":
          journalDirty.set(effect.sessionId, {
            questKey: effect.questKey,
            leadKey: effect.leadKey,
            reason: "discovered",
          });
          break;
        case "journal_resolve":
          journalDirty.set(effect.sessionId, {
            questKey: effect.questKey,
            leadKey: effect.leadKey,
            reason: "resolved",
          });
          break;
        case "journal_archive":
          journalDirty.set(effect.sessionId, {
            questKey: effect.questKey,
            leadKey: "",
            reason: "archived",
          });
          break;
        case "award_xp":
          if (effect.characterId === null) break;
          experienceBySession.set(
            effect.sessionId,
            (experienceBySession.get(effect.sessionId) ?? 0) + effect.amount,
          );
          break;
        default:
          break;
      }
    }

    for (const [sessionId, amount] of experienceBySession) {
      deliveries.push(...await this.commitExperience(manager, sessionId, amount, context.tick));
    }

    for (const [sessionId, changed] of journalDirty) {
      const characterId = manager.character(sessionId)?.characterId ?? null;
      deliveries.push({
        sessionId,
        type: "journal_update",
        value: {
          entries: manager.journalFor(sessionId),
          notes: characterId === null ? [] : await this.repository.notes(characterId),
          changed,
        } satisfies QuestJournalPayload as unknown as Record<string, unknown>,
      });
    }

    for (const batch of manager.drainPersistence()) {
      await this.repository.commit(batch);
    }

    return deliveries;
  }

  /** Pushes the current meter state without awarding anything (zone entry, respawn). */
  async snapshot(
    manager: QuestEffectSource,
    sessionId: number,
    characterId: number,
  ): Promise<readonly QuestClientDelivery[]> {
    const progress = await this.repository.progress(characterId);
    if (!progress) return [];
    manager.setCharacterProgression(sessionId, progress.experience, progress.level);
    return [
      {
        sessionId,
        type: "experience_update",
        value: {
          experience: progress.experience,
          level: progress.level,
          intoLevel: progress.intoLevel,
          forLevel: progress.forLevel,
          gained: 0,
          leveled: false,
          source: "sync",
        },
      },
      {
        sessionId,
        type: "journal_update",
        value: {
          entries: manager.journalFor(sessionId),
          notes: await this.repository.notes(characterId),
          changed: null,
        } satisfies QuestJournalPayload as unknown as Record<string, unknown>,
      },
    ];
  }

  private async commitExperience(
    manager: QuestEffectSource,
    sessionId: number,
    amount: number,
    tick: number,
  ): Promise<readonly QuestClientDelivery[]> {
    const characterId = manager.character(sessionId)?.characterId;
    if (characterId === undefined || characterId === null) return [];
    const result = await this.repository.awardExperience(characterId, amount);
    if (!result) return [];
    manager.setCharacterProgression(sessionId, result.experience, result.level);
    const deliveries: QuestClientDelivery[] = [{
      sessionId,
      type: "experience_update",
      value: {
        experience: result.experience,
        level: result.level,
        intoLevel: result.intoLevel,
        forLevel: result.forLevel,
        gained: result.gained,
        leveled: result.leveled,
        source: "award",
      },
    }];
    if (!result.leveled) return deliveries;
    deliveries.push({
      sessionId,
      type: "level_update",
      value: { level: result.level, exp: result.intoLevel },
    });
    // A level-up is itself an authored hook; content may react to it immediately.
    const followUp = manager.dispatchLevelUp({
      tick,
      sessionId,
      level: result.level,
      previousLevel: result.previousLevel,
    });
    if (followUp.length > 0) {
      deliveries.push(...await this.apply(manager, followUp, { tick }));
    }
    return deliveries;
  }
}
