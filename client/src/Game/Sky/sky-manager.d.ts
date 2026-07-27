import type * as BJS from "@babylonjs/core";
import type { ZoneManager } from "@game/Zone/zone-manager";
import type { RequiemSkyMotionSettings } from "./sky-motion";
export default class DayNightSkyManager {
    #private;
    scale: number;
    timeOfDay: number;
    skyContainer: BJS.AssetContainer | null;
    parent: ZoneManager;
    constructor(parent: any);
    get dayLengthSeconds(): number;
    set dayLengthSeconds(value: number);
    get motionSettings(): Readonly<RequiemSkyMotionSettings>;
    setMotionSettings(partial: Partial<RequiemSkyMotionSettings>): Readonly<RequiemSkyMotionSettings>;
    createSky(name: any, noWorldEnv?: boolean): Promise<void>;
    dispose(): void;
    tick(delta: any): void;
    setTimeOfDay(time: any): void;
    get biome(): string;
    setBiome(name: string, transitionMs?: number): boolean;
}
