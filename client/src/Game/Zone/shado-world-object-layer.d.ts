import type * as BJS from "@babylonjs/core";
import { type ShadoWorldSpatialPackage } from "@knervous/shado/world";
import ObjectCache from "@/Game/Model/object-cache";
export declare class ShadoWorldObjectLayer {
    readonly world: ShadoWorldSpatialPackage;
    private readonly coordinator;
    private readonly objectCache;
    private readonly scene;
    private elapsedMs;
    private updatePending;
    private readonly visibleStampRows;
    private constructor();
    static load(zoneName: string, objectCache: ObjectCache, scene: BJS.Scene): Promise<ShadoWorldObjectLayer | null>;
    dispose(): void;
    tick(deltaMs: number): void;
    private refreshVisibility;
    private hasBatchChanged;
}
