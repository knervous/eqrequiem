import type { DatabaseBackend } from '../db/backend.js';
import { BUILTIN_QUESTS } from '../zone/builtin-quests.js';
import { EmbeddedGameBackend } from './embedded-game-backend.js';
import {
  OFFLINE_GEAR_SETS,
  OFFLINE_ITEM_TEMPLATES,
} from './generated/offline-gear-catalog.js';

export interface OfflineZoneCatalogEntry {
  shortName: string;
  longName: string;
}

export function createOfflineGameBackend(
  database: DatabaseBackend,
  zones: Readonly<Record<string | number, OfflineZoneCatalogEntry>>,
  contentDatabasePath?: string,
): EmbeddedGameBackend {
  return new EmbeddedGameBackend(database, {
    items   : OFFLINE_ITEM_TEMPLATES,
    gearSets: OFFLINE_GEAR_SETS,
    zones   : Object.entries(zones).map(([id, zone]) => ({
      id       : Number(id),
      shortName: zone.shortName,
      longName : zone.longName,
      ...safePoint(Number(id)),
    })),
    quests: BUILTIN_QUESTS,
    ...(contentDatabasePath ? { contentDatabasePath } : {}),
  });
}

function safePoint(id: number): { safeX: number; safeY: number; safeZ: number } {
  const points: Record<number, readonly [number, number, number]> = {
    1: [-10, 5, 0],
    2: [-428, 3, -74],
    3: [0, 2, 0],
    4: [-508, 0, 83],
  };
  const [safeX, safeY, safeZ] = points[id] ?? [0, 0, 0];
  return { safeX, safeY, safeZ };
}
