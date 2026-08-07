import type { ZoneQuestRegistry } from "../../../quest-registry.js";

export function registerNpcQuests(_quests: ZoneQuestRegistry): void {
  // Ambient, quest-less NPC behavior for Qeynos Hills lives here.
  //
  // Authored content that owns persistent state belongs in its own scope instead —
  // see `missing-patrol.ts` — so its state, journal identity and bindings share one key.
}
