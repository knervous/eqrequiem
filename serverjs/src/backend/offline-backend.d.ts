import type { DatabaseBackend } from '../db/backend.js';
import { EmbeddedGameBackend } from './embedded-game-backend.js';
export interface OfflineZoneCatalogEntry {
    shortName: string;
    longName: string;
}
export declare function createOfflineGameBackend(database: DatabaseBackend, zones: Readonly<Record<string | number, OfflineZoneCatalogEntry>>, contentDatabasePath?: string): EmbeddedGameBackend;
