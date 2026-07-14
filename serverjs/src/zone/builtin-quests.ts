import { allZoneQuestDefinitions } from './quest-zone-registry.js';

/** Compatibility export for transports/catalogs; ownership lives in per-zone registries. */
export const BUILTIN_QUESTS = allZoneQuestDefinitions();
