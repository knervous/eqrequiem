import type * as BJS from '@babylonjs/core';
export type LightData = {
    x: number;
    y: number;
    z: number;
    r: number;
    g: number;
    b: number;
};
export declare class LightManager {
    private kdRoot;
    private prevSet;
    private nextSet;
    private zoneLights;
    private debugGlowLayer;
    private playerLight;
    private previousLights;
    private lastPosition;
    private accumTime;
    private debug;
    private debugMat;
    dispose(): void;
    detectMaxLights(engine: BJS.Engine): Promise<number>;
    loadLights(container: BJS.Node, scene: BJS.Scene, zoneLights: LightData[], zoneName: string): Promise<void>;
    updateLights(delta: number): void;
}
