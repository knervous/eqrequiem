import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export class BabylonTextureCache {
  static cache = new Map<string, BJS.Texture>();

  static set(name: string, tex: BJS.Texture): void {
    BabylonTextureCache.cache.set(name, tex);
  }

  static get(name: string): BJS.Texture | undefined {
    return BabylonTextureCache.cache.get(name);
  }

  static clear(): void {
    BabylonTextureCache.clear();
  }
}
