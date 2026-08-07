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

export interface QuestManifestProblem {
  readonly questKey: string;
  readonly rule: string;
  readonly detail: string;
}

/**
 * Static checks over the generated manifest.
 *
 * Code-owned content has no schema to validate against, so this is the cheap safety net
 * the design asks for (§35): the failures it catches — a region bound but never defined,
 * an unclaimable one-time handler, a duplicate key — are all silent at runtime. Content
 * simply never fires, and nothing tells you.
 */
export function validateQuestContent(
  knownNpcNames?: ReadonlySet<string>,
): readonly QuestManifestProblem[] {
  const problems: QuestManifestProblem[] = [];
  const seen = new Set<string>();
  for (const registry of registries) {
    for (const scope of registry.scopes()) {
      const definition = scope.definition();
      const questKey = definition.id;
      if (seen.has(questKey)) {
        problems.push({ questKey, rule: "duplicate-quest-key", detail: questKey });
      }
      seen.add(questKey);

      const regions = new Set(definition.regions?.map((region) => region.key) ?? []);
      for (const handler of definition.handlers) {
        if (handler.regionKey && !regions.has(handler.regionKey)) {
          problems.push({
            questKey,
            rule: "region-not-defined",
            detail: `${handler.event} bound to '${handler.regionKey}'`,
          });
        }
        if (
          (handler.event === "proximity_enter" || handler.event === "proximity_leave")
          && handler.radius === undefined
        ) {
          problems.push({
            questKey,
            rule: "proximity-without-radius",
            detail: handler.npcName ?? "(zone)",
          });
        }
        // A positional once-claim breaks the moment a handler is inserted above it.
        if (handler.oncePerPlayer && !handler.onceKey) {
          problems.push({
            questKey,
            rule: "once-without-key",
            detail: `${handler.event} on ${handler.npcName ?? handler.regionKey ?? "(zone)"}`,
          });
        }
        if (
          knownNpcNames
          && handler.npcName
          && !knownNpcNames.has(normalizeKey("npc", handler.npcName))
        ) {
          problems.push({
            questKey,
            rule: "unknown-npc",
            detail: handler.npcName,
          });
        }
      }

      const band = definition.metadata?.recommendedLevel;
      if (band && band[0] > band[1]) {
        problems.push({
          questKey,
          rule: "impossible-level-band",
          detail: `${band[0]}-${band[1]}`,
        });
      }
      for (const binding of definition.bindings ?? []) {
        if (binding.visibility === "contextual" && !binding.requiresKnowledge?.length) {
          problems.push({
            questKey,
            rule: "contextual-without-knowledge",
            detail: `${binding.kind}:${binding.key}`,
          });
        }
        if (binding.kind === "region" && !regions.has(binding.key)) {
          problems.push({
            questKey,
            rule: "region-not-defined",
            detail: `binding '${binding.key}'`,
          });
        }
      }
    }
  }
  return problems;
}
