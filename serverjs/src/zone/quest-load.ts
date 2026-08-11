import { QuestManager } from "./quest-manager.js";
import type { QuestDefinition, QuestVector3 } from "./quest-types.js";

/**
 * Synthetic quest content, sized to what the demo is heading for rather than what it
 * has today.
 *
 * The shipped content is currently 3 quests and 7 handlers, so every hot path in the
 * engine looks free. The checklist targets 8–12 World Situations plus story threads
 * across six zones, which is roughly an order of magnitude more — and `dispatch` walks
 * every handler of every quest for every event. This module exists so the shape of that
 * curve is measurable now, while changing it is still cheap.
 *
 * Shared by the load test and the standalone harness so both drive identical content.
 */

export interface QuestLoadShape {
  readonly quests: number;
  readonly handlersPerQuest: number;
  /** Regions the manager must point-test on every position update. */
  readonly regions: number;
  /** NPC proximity watchers, likewise tested per position update. */
  readonly watchers: number;
}

export const DEMO_TARGET_LOAD: QuestLoadShape = {
  quests: 60,
  handlersPerQuest: 5,
  regions: 40,
  watchers: 60,
};

/**
 * Builds content whose handlers mostly *do not* match the event being dispatched.
 *
 * That is the honest case: a zone full of quests is a zone full of handlers waiting on
 * events that are not this one, so the cost that matters is the miss path. Content where
 * everything fires would measure the handler bodies instead of the engine.
 */
export function buildQuestLoad(shape: QuestLoadShape, zoneId = 2): QuestDefinition[] {
  const events = [
    "say", "npc_death", "item_turn_in", "region_enter", "proximity_enter",
    "level_up", "timer", "npc_tick",
  ] as const;
  const definitions: QuestDefinition[] = [];
  for (let questIndex = 0; questIndex < shape.quests; questIndex++) {
    const handlers = [];
    for (let index = 0; index < shape.handlersPerQuest; index++) {
      const event = events[(questIndex + index) % events.length]!;
      handlers.push({
        event,
        // Narrow the match so most handlers miss, the way authored content does.
        ...(event === "say" ? { npcName: `Watchman_${questIndex}` } : {}),
        ...(event === "npc_death" ? { npcName: `a_target_${questIndex}` } : {}),
        actions: [],
        handler: () => undefined,
      });
    }
    definitions.push({
      id: `load:${questIndex}`,
      zoneIds: [zoneId],
      handlers: handlers as QuestDefinition["handlers"],
    });
  }
  return definitions;
}

export interface LoadedQuestZone {
  readonly manager: QuestManager;
  readonly npcNames: readonly string[];
  readonly sessionIds: readonly number[];
}

/** A manager hydrated with synthetic content, players, regions and watchers. */
export function loadQuestZone(
  shape: QuestLoadShape,
  playerCount: number,
  zoneId = 2,
): LoadedQuestZone {
  const manager = new QuestManager(zoneId, 0, "talioscrownward");
  const definitions = buildQuestLoad(shape, zoneId);

  // Regions and proximity watchers are what `updatePlayerPosition` walks. They are
  // registered as ordinary content so the load runs through the same registration path
  // real quests use.
  const npcNames = Array.from({ length: shape.watchers }, (_, i) => `a_watched_${i}`);

  // Registered through ordinary content so the load exercises the same registration the
  // engine does for authored quests: regions come from a quest's `regions`, and a
  // proximity watcher exists because some handler asked for `proximity_enter`.
  const worldQuest: QuestDefinition = {
    id: "load:world",
    zoneIds: [zoneId],
    regions: Array.from({ length: shape.regions }, (_, index) => ({
      key: `region:${index}`,
      shape: {
        kind: "sphere" as const,
        center: { x: index * 40, y: 0, z: 0 },
        radius: 25,
      },
    })),
    handlers: npcNames.map((npcName) => ({
      event: "proximity_enter" as const,
      npcName,
      radius: 20,
      actions: [],
      handler: () => undefined,
    })),
  } as unknown as QuestDefinition;

  manager.replace([...definitions, worldQuest], 1);

  // `updateNpcPositions` only moves NPCs the manager already knows, so introduce them
  // the way the world does — through an event that carries the NPC as the receiver.
  npcNames.forEach((name, index) => {
    manager.dispatch({
      type: "npc_tick",
      tick: 0,
      receiver: {
        kind: "npc",
        id: index + 1,
        name,
        level: 5,
        position: { x: index * 30, y: 0, z: 0 },
      },
    } as never);
  });
  manager.updateNpcPositions(
    npcNames.map((name, index) => ({
      name,
      position: { x: index * 30, y: 0, z: 0 },
    })),
  );

  const sessionIds = Array.from({ length: playerCount }, (_, i) => i + 1);
  for (const sessionId of sessionIds) {
    manager.attachCharacter(sessionId, {
      characterId: sessionId,
      name: `Player${sessionId}`,
      level: 5,
      experience: 0,
      quests: {},
      knowledge: {},
      inventory: [],
    });
    // `attachCharacter` populates the character record; the *snapshot* the engine reads
    // during proximity comes from `remember`, which only happens on an event carrying an
    // actor. Both runtimes send `player_enter` on join for exactly this reason, and
    // without it `syncProximity` throws rather than skipping the session.
    manager.dispatch({
      type: "player_enter",
      tick: 0,
      sessionId,
      actorName: `Player${sessionId}`,
      actor: {
        kind: "player",
        sessionId,
        name: `Player${sessionId}`,
        level: 5,
        position: walkPosition(sessionId, 0),
      },
    } as never);
  }
  return { manager, npcNames, sessionIds };
}

/** A deterministic walk, so every run of the load drives the same geometry. */
export function walkPosition(sessionId: number, step: number): QuestVector3 {
  const t = (sessionId * 37 + step * 11) % 1600;
  return { x: t, y: 0, z: (t * 0.5) % 800 };
}
