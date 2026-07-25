import type * as BJS from "@babylonjs/core";
import type { ZoneManager } from "@game/Zone/zone-manager";
export default class DayNightSkyManager {
    #private;
    private readonly domeGradientTable;
    scale: number;
    scrollSpeed: number;
    dayLengthSeconds: number;
    timeOfDay: number;
    skyContainer: BJS.AssetContainer | null;
    parent: ZoneManager;
    constructor(parent: any);
    createSky(name: any, noWorldEnv?: boolean): Promise<void>;
    worldTick(): void;
    dispose(): void;
    tick(delta: any): void;
    setTimeOfDay(time: any): void;
}
