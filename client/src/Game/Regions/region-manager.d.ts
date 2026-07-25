import type * as BJS from '@babylonjs/core';
import type GameManager from '@game/Manager/game-manager';
import { type ZonePoint } from '@game/Net/messages';
import type { ZoneMetadata } from '@game/Zone/zone-types';
import type { ShadoWorldSpatialPackage } from '@knervous/shado/world';
export declare class RegionManager {
    private gameManager;
    private aabbTree?;
    private inside;
    private zonePoints;
    private regions;
    private scene?;
    private teleportEffects;
    private active;
    private transitionPending;
    private readonly beforeRender;
    constructor(gameManager: GameManager);
    private createTeleportEffect;
    instantiateRegions(scene: BJS.Scene, metadata: ZoneMetadata, _zonePoints?: ZonePoint[]): void;
    instantiateShadoRegions(scene: BJS.Scene, world: ShadoWorldSpatialPackage, zonePoints?: ZonePoint[]): void;
    private instantiateRegionData;
    private update;
    private buildTree;
    private queryTree;
    dispose(): void;
}
