import type { QuestDefinition, QuestEffect, QuestEvent, QuestNpcSnapshot, QuestPlayerSnapshot } from "./quest-types.js";
/** Deterministic per-shard quest runtime. Public entity methods emit through its zone boundary. */
export declare class QuestManager {
    private readonly zoneId;
    private readonly instanceId;
    private readonly shortName;
    private definitions;
    private readonly cursors;
    private readonly npcSnapshots;
    private readonly playerSnapshots;
    private readonly variables;
    private revision;
    constructor(zoneId: number, instanceId?: number, shortName?: string | null);
    hydrate(state: {
        npcs?: readonly QuestNpcSnapshot[];
        players?: readonly QuestPlayerSnapshot[];
        variables?: Readonly<Record<string, unknown>>;
    }): void;
    removePlayer(sessionId: number): void;
    dispatchCustom(name: string, data?: unknown, options?: {
        tick?: number;
        actor?: QuestPlayerSnapshot | QuestNpcSnapshot;
        receiver?: QuestNpcSnapshot;
    }): QuestEffect[];
    replace(definitions: readonly QuestDefinition[], revision: number): void;
    get status(): {
        revision: number;
        questCount: number;
    };
    dispatch(event: QuestEvent): QuestEffect[];
    private context;
    private remember;
    private reduceAction;
}
