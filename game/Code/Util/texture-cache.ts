import { Texture2D } from "godot";

export class TextureCache {
  static cache = new Map<string, Texture2D>();

  static set(name: string, tex: Texture2D): void {
    TextureCache.cache.set(name, tex);
  }

  static get(name: string): Texture2D | undefined {
    return TextureCache.cache.get(name);
  }

  static clear(): void {
    TextureCache.clear();
  }
}
