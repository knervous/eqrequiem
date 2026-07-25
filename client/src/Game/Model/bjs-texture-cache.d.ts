import type * as BJS from "@babylonjs/core";
export declare class BabylonTextureCache {
    static cache: Map<string, BJS.Texture>;
    static set(name: string, tex: BJS.Texture): void;
    static get(name: string): BJS.Texture | undefined;
    static clear(): void;
}
