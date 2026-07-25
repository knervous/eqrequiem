import type { QuestDefinition, QuestHandlerDefinition } from "./quest-types.js";
export interface ZoneQuestIdentity {
    readonly id: number;
    readonly shortName: string;
}
/**
 * Code-owned quest registrations for one zone, mirroring Go's
 * ZoneQuestInterface. A fresh registry is constructed for every zone module.
 */
export declare class ZoneQuestRegistry {
    #private;
    readonly zone: ZoneQuestIdentity;
    constructor(zone: ZoneQuestIdentity);
    registerZone(...handlers: readonly QuestHandlerDefinition<any>[]): this;
    registerNpc(name: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this;
    registerItem(id: number, ...handlers: readonly QuestHandlerDefinition<any>[]): this;
    registerCustom(name: string, ...handlers: readonly QuestHandlerDefinition<any>[]): this;
    definition(): QuestDefinition;
    private register;
}
