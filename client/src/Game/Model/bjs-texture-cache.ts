import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";

export class BabylonTextureCache {
  static cache = new Map<string, BJS.Texture>();

  static async set(name: string, tex: BJS.Texture): Promise<void> {
    BabylonTextureCache.cache.set(name, tex);
    await new Promise((resolve) => {
      if (tex!.isReady()) {
        resolve(null);
      } else {
              tex!.onLoadObservable.addOnce(() => resolve(null));
      }
    });
  }

  static get(name: string): BJS.Texture | undefined {
    return BabylonTextureCache.cache.get(name);
  }

  static clear(): void {
    BabylonTextureCache.clear();
  }
}
