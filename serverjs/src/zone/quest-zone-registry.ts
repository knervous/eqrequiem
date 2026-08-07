import type { QuestBinding, QuestDefinition } from "./quest-types.js";
import type { QuestManifestEntry, ZoneQuestRegistry } from "./quest-registry.js";
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
  return questRegistryForZone(zone)?.definitions() ?? [];
}

export function allZoneQuestDefinitions(): readonly QuestDefinition[] {
  return registries.flatMap((registry) => registry.definitions());
}

/**
 * The generated content manifest. Authored TypeScript stays the single source of truth;
 * this is the introspectable index the rest of the game and dev tooling query instead of
 * a hand-maintained `quest_bindings` table that would inevitably drift.
 */
export function questManifest(): readonly QuestManifestEntry[] {
  return registries.flatMap((registry) => registry.manifest());
}

export interface QuestSourceBinding extends QuestBinding {
  readonly questKey: string;
  readonly zoneId: number;
  readonly recommendedLevel: readonly [number, number] | null;
}

/** "Which authored content references this NPC/region/item?" — derived, never authored. */
export function questBindingsForSource(
  kind: QuestBinding["kind"],
  key: string,
  zone?: number | string,
): readonly QuestSourceBinding[] {
  const normalized = normalizeKey(kind, key);
  const entries = zone === undefined
    ? questManifest()
    : questRegistryForZone(zone)?.manifest() ?? [];
  return entries.flatMap((entry) =>
    entry.bindings
      .filter((binding) => binding.kind === kind && normalizeKey(kind, binding.key) === normalized)
      .map((binding) => ({
        ...binding,
        questKey: entry.questKey,
        zoneId: entry.zoneId,
        recommendedLevel: entry.metadata.recommendedLevel ?? null,
      })),
  );
}

/**
 * The cheap answer to "does this NPC have discoverable content?" without making a lossy
 * boolean the source of truth. Hidden bindings deliberately never surface.
 */
export function npcDiscoveryHint(
  npcName: string,
  zone: number | string,
  knownKnowledge: ReadonlySet<string> = new Set(),
): "none" | "subtle" | "contextual" {
  let hint: "none" | "subtle" | "contextual" = "none";
  for (const binding of questBindingsForSource("npc", npcName, zone)) {
    if (binding.visibility === "subtle") hint = "subtle";
    if (binding.visibility === "contextual") {
      const required = binding.requiresKnowledge ?? [];
      // Contextual marks only connect information the character has already learned.
      if (required.length > 0 && required.every((key) => knownKnowledge.has(key))) {
        return "contextual";
      }
    }
  }
  return hint;
}

function normalizeKey(kind: QuestBinding["kind"], key: string): string {
  return kind === "npc"
    ? key.trim().replaceAll(" ", "_").toLowerCase()
    : key.trim().toLowerCase();
}
