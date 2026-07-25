import type { DatabaseBackend } from "../db/backend.js";
import type { BackendEvent, BackendRequest, EmbeddedBackendContent, GameBackend } from "./contracts.js";
/**
 * Transport-neutral backend used by offline Worker transport and available to
 * Node transports. All gameplay mutations live here, never in a transport.
 */
export declare class EmbeddedGameBackend implements GameBackend {
    private readonly driver;
    private readonly content;
    private readonly sessions;
    private readonly zoneSessions;
    private readonly questManagers;
    private readonly database;
    private readonly contentPrefix;
    constructor(driver: DatabaseBackend, content: EmbeddedBackendContent);
    initialize(): Promise<void>;
    connect(sessionId: number): Promise<BackendEvent[]>;
    disconnect(sessionId: number): Promise<void>;
    handle(sessionId: number, request: BackendRequest): Promise<BackendEvent[]>;
    close(): Promise<void>;
    private deleteCharacter;
    private createCharacter;
    private resolveCharacterOrigin;
    private grantStartingItems;
    private seedCharacterSkillsAndLanguages;
    private enterWorld;
    private validateZoneSession;
    private changeZone;
    private gmCommand;
    private channelMessage;
    private questManager;
    private questEvents;
    private summonItem;
    private purgeItems;
    private gearUp;
    private moveItem;
    private deleteItem;
    private zoneBootstrap;
    private characterListEvent;
    private ensureSelectedCharacter;
    private session;
    private resolveZoneId;
    private inventoryRows;
    private inventoryItems;
    private inventoryAt;
    private getItem;
    private itemInstance;
    private itemAllowed;
    private characterCanEquip;
    private upsertItem;
    private prepareCanonicalDatabase;
    private guestAccountId;
    private character;
}
