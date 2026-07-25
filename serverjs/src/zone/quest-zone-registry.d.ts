import type { QuestDefinition } from "./quest-types.js";
import type { ZoneQuestRegistry } from "./quest-registry.js";
export declare function questRegistryForZone(zone: number | string): ZoneQuestRegistry | null;
export declare function questDefinitionsForZone(zone: number | string): readonly QuestDefinition[];
export declare function allZoneQuestDefinitions(): readonly QuestDefinition[];
