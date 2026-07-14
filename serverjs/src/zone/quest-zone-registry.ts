import type { QuestDefinition } from "./quest-types.js";
import type { ZoneQuestRegistry } from "./quest-registry.js";
import { registerZone as registerQeynos } from "./quests/zones/qeynos/index.js";
import { registerZone as registerQeynos2 } from "./quests/zones/qeynos2/index.js";

type ZoneQuestConstructor = () => ZoneQuestRegistry;

const constructors: readonly ZoneQuestConstructor[] = [registerQeynos, registerQeynos2];
const registries = constructors.map((construct) => construct());
const byId = new Map(registries.map((registry) => [registry.zone.id, registry]));
const byName = new Map(registries.map((registry) => [registry.zone.shortName, registry]));

export function questRegistryForZone(zone: number | string): ZoneQuestRegistry | null {
  return typeof zone === "number"
    ? byId.get(zone) ?? null
    : byName.get(zone.trim().toLowerCase()) ?? null;
}

export function questDefinitionsForZone(zone: number | string): readonly QuestDefinition[] {
  const registry = questRegistryForZone(zone);
  return registry ? [registry.definition()] : [];
}

export function allZoneQuestDefinitions(): readonly QuestDefinition[] {
  return registries.map((registry) => registry.definition());
}
