import type { CharacterProgressRepository } from "../progression/character-progress-repository.js";
import { toItemInstance } from "../backend/item-instance.js";
import { QuestManager } from "./quest-manager.js";
import { combatExperience, splitGroupExperience } from "./quest-progression.js";
import {
  questDefinitionsForZone,
  questRegistryForZone,
} from "./quest-zone-registry.js";
import type {
  QuestDefinition,
  QuestEffect,
  QuestPersistentEffect,
  QuestPlayerSnapshot,
} from "./quest-types.js";
import { worldHourAt } from "./world-clock.js";
import type { WorldStateSnapshot } from "./world-state-types.js";

/**
 * Shard construction and the gameplay rules that must not differ between the offline
 * SQLite backend and the live worker-backed server.
 *
 * Anything that decides *what happens* — which quests load, what a kill is worth, what a
 * note write does — belongs here. Each runtime keeps only its own transport and threading
 * concerns. See `serverjs/CLAUDE.md` for the rule this module exists to enforce.
 */

export interface ZoneQuestManagerOptions {
  readonly zoneId: number;
  readonly instanceId: number;
  readonly tickRateHz?: number;
  /** Catalog/JSON quests to merge with the zone's code-owned definitions. */
  readonly extraDefinitions?: readonly QuestDefinition[];
  readonly revision?: number;
  /** Global world state as of shard construction, if it has been published yet. */
  readonly world?: WorldStateSnapshot;
}

export function dispatchPlayerEnter(
  manager: QuestManager,
  tick: number,
  player: QuestPlayerSnapshot,
): QuestEffect[] {
  return manager.dispatch({
    type: "player_enter",
    tick,
    sessionId: player.sessionId,
    actorName: player.name,
    actor: player,
  });
}

export function dispatchPlayerSay(
  manager: QuestManager,
  input: {
    readonly tick: number;
    readonly sessionId: number;
    readonly actorName: string;
    readonly npcName: string;
    readonly message: string;
    readonly channel: number;
  },
): QuestEffect[] {
  const message = input.message.trim();
  const npcName = input.npcName.trim();
  if (
    input.channel !== 0
    || !message
    || !npcName
    || !manager.hasPlayer(input.sessionId)
    || !manager.hasNpc(npcName)
  ) return [];
  return manager.dispatch({
    type: "say",
    tick: input.tick,
    sessionId: input.sessionId,
    actorName: input.actorName,
    npcName,
    message,
  });
}

export function advanceQuestPlayerPosition(
  manager: QuestManager,
  sessionId: number,
  position: { readonly x: number; readonly y: number; readonly z: number },
  tick: number,
): QuestEffect[] {
  return [
    ...manager.updatePlayerPosition(sessionId, position, tick),
    ...manager.advanceTimers(tick),
  ];
}

/**
 * Builds a shard's quest manager. Code-owned definitions win over catalog entries with
 * the same key, because `BUILTIN_QUESTS` is derived from them and would otherwise run
 * every handler twice.
 */
export function createZoneQuestManager(
  options: ZoneQuestManagerOptions,
): QuestManager {
  const manager = new QuestManager(
    options.zoneId,
    options.instanceId,
    questRegistryForZone(options.zoneId)?.zone.shortName ?? null,
    { tickRateHz: options.tickRateHz ?? 10 },
  );
  manager.replace(
    mergeQuestDefinitions(options.zoneId, options.extraDefinitions ?? []),
    options.revision ?? 1,
  );
  refreshWorldContext(manager, Date.now(), options.world);
  return manager;
}

export function mergeQuestDefinitions(
  zoneId: number,
  extra: readonly QuestDefinition[],
): readonly QuestDefinition[] {
  const definitions = new Map(
    questDefinitionsForZone(zoneId).map((definition) => [definition.id, definition]),
  );
  for (const definition of extra) {
    if (!definitions.has(definition.id)) definitions.set(definition.id, definition);
  }
  return [...definitions.values()];
}

/**
 * Keeps the shard's world context current. Cheap; safe to call every tick.
 *
 * The world snapshot is optional because a shard can run before the world state has
 * been published to it — a handler then sees no flags rather than stale ones, which is
 * the safe direction: authored availability predicates fail closed.
 */
export function refreshWorldContext(
  manager: QuestManager,
  nowMs = Date.now(),
  world?: WorldStateSnapshot,
): void {
  manager.setWorldContext({
    timeOfDay: worldHourAt(nowMs),
    ...(world ? { flags: worldContextFlags(world) } : {}),
  });
}

/**
 * Flattens a world snapshot into the flat `world.flags` bag handlers read.
 *
 * Active occurrences are exposed under a reserved prefix so a handler can ask "is this
 * situation happening right now, and which one" without the quest engine having to know
 * what a situation is.
 */
export function worldContextFlags(
  snapshot: WorldStateSnapshot,
): Readonly<Record<string, unknown>> {
  const flags: Record<string, unknown> = { ...snapshot.facts };
  for (const occurrence of snapshot.occurrences) {
    if (occurrence.state !== "active") continue;
    flags[`${WORLD_SITUATION_FLAG_PREFIX}${occurrence.situationKey}`] = {
      id: occurrence.id,
      seed: occurrence.seed,
      startedAtMs: occurrence.startedAtMs,
      endsAtMs: occurrence.endsAtMs,
      data: occurrence.data,
    };
  }
  return flags;
}

export const WORLD_SITUATION_FLAG_PREFIX = "situation:";

/**
 * Loads a character's persisted record into the shard and returns whether it attached.
 * Handlers must never observe a character whose state has not been loaded and migrated.
 */
export async function attachQuestCharacter(
  manager: QuestManager,
  repository: CharacterProgressRepository,
  sessionId: number,
  characterId: number,
): Promise<boolean> {
  const snapshot = await repository.load(characterId);
  if (!snapshot) return false;
  manager.attachCharacter(sessionId, snapshot);
  return true;
}

export interface SlainNpc {
  readonly id?: number;
  readonly name: string;
  readonly level: number;
  readonly npcIndex?: number;
  readonly position?: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * The one definition of what a kill is worth, and who it is worth it to.
 *
 * Credit is whatever participant set the combat system supplied — never the killing
 * blow — and it produces ordinary award effects so combat commits through the same
 * progression path as a discovery or a quest beat.
 */
export function combatExperienceEffects(
  manager: QuestManager,
  npc: SlainNpc,
  creditSessionIds: readonly number[],
): readonly QuestPersistentEffect[] {
  const credited = creditSessionIds.filter(
    (sessionId) => manager.character(sessionId)?.characterId != null,
  );
  if (credited.length === 0) return [];
  const effects: QuestPersistentEffect[] = [];
  for (const sessionId of credited) {
    const character = manager.character(sessionId);
    if (!character?.characterId) continue;
    const amount = splitGroupExperience(
      combatExperience(npc.level, character.level),
      credited.length,
    );
    if (amount <= 0) continue;
    effects.push({
      type: "award_xp",
      sessionId,
      characterId: character.characterId,
      questKey: `combat:${npc.name}`,
      amount,
      source: "combat",
      sourceKey: npc.name,
      awardKey: null,
    });
  }
  return effects;
}

/** Sessions on this shard that hold a loaded character, for credit sets. */
export function creditableSessions(
  manager: QuestManager,
  sessionIds: Iterable<number>,
): number[] {
  return [...sessionIds].filter((sessionId) => manager.character(sessionId) !== null);
}

export function npcDeathQuestEffects(
  manager: QuestManager,
  input: {
    readonly tick: number;
    readonly npc: {
      readonly id: number;
      readonly name: string;
      readonly level: number;
      readonly npcIndex?: number;
      readonly position?: { readonly x: number; readonly y: number; readonly z: number };
    };
    readonly creditSessionIds: Iterable<number>;
  },
): { readonly credited: readonly number[]; readonly effects: readonly QuestEffect[] } {
  const credited = creditableSessions(manager, input.creditSessionIds);
  const effects = [
    ...manager.dispatchNpcDeath({
      tick: input.tick,
      npc: { kind: "npc", ...input.npc },
      creditSessionIds: credited,
    }),
    ...combatExperienceEffects(manager, input.npc, credited),
  ];
  return { credited, effects };
}

/**
 * Turns a stored grant into the `add_item` payload the client expects. Both runtimes
 * call this so an offline player and a live player receive byte-identical items.
 */
export async function grantedItemEvent(
  repository: CharacterProgressRepository,
  stored: { readonly slot: number; readonly bag: number; readonly itemId: number },
  quantity: number,
): Promise<Record<string, unknown> | null> {
  const row = await repository.itemRow(stored.itemId);
  if (!row) return null;
  return toItemInstance(row, stored.slot, stored.bag, quantity);
}

export interface JournalNoteIntent {
  readonly action: "add" | "remove" | "pin";
  readonly body?: string;
  readonly source?: string;
  readonly noteId?: number;
  readonly pinned?: boolean;
  readonly withPosition?: boolean;
}

/**
 * Applies a player's note intent. Validation, limits and placement live here so an
 * offline client and a live client cannot end up with different journals.
 */
export async function applyJournalNote(
  repository: CharacterProgressRepository,
  characterId: number,
  intent: JournalNoteIntent,
): Promise<void> {
  if (intent.action === "add") {
    const body = (intent.body ?? "").trim();
    if (!body) return;
    await repository.addNote(characterId, {
      body,
      source: intent.source ?? "",
      place: intent.withPosition ? await repository.position(characterId) : null,
    });
    return;
  }
  if (!intent.noteId) return;
  if (intent.action === "remove") {
    await repository.removeNote(characterId, intent.noteId);
    return;
  }
  await repository.pinNote(characterId, intent.noteId, intent.pinned === true);
}
