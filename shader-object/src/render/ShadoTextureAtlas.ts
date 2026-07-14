import { BABYLON, type RawTexture2DArray, type Scene } from '../babylon';

export type ShadoAtlasRect = { u0: number; v0: number; u1: number; v1: number };
export type ShadoAtlasEntry = { layer: number; rect: ShadoAtlasRect };

export interface ShadoTextureAtlas {
  texture: RawTexture2DArray;
  entries: Record<string, ShadoAtlasEntry>;
  get(key: string): ShadoAtlasEntry;
  dispose(): void;
}

export type ShadoAtlasColor = readonly [number, number, number, number];

export function createSolidColorAtlas(
  scene: Scene,
  colors: Record<string, ShadoAtlasColor>,
  size = 4
): ShadoTextureAtlas {
  const keys = Object.keys(colors);
  if (!keys.length) {
    throw new Error('createSolidColorAtlas requires at least one color');
  }

  const layers = keys.length;
  const bytesPerLayer = size * size * 4;
  const data = new Uint8Array(bytesPerLayer * layers);
  const entries: Record<string, ShadoAtlasEntry> = {};

  for (let layer = 0; layer < layers; layer++) {
    const key = keys[layer];
    const [r, g, b, a] = colors[key];
    const rgba = [
      Math.max(0, Math.min(255, Math.round(r * 255))),
      Math.max(0, Math.min(255, Math.round(g * 255))),
      Math.max(0, Math.min(255, Math.round(b * 255))),
      Math.max(0, Math.min(255, Math.round(a * 255))),
    ];
    const off = layer * bytesPerLayer;
    for (let px = 0; px < size * size; px++) {
      data[off + px * 4 + 0] = rgba[0];
      data[off + px * 4 + 1] = rgba[1];
      data[off + px * 4 + 2] = rgba[2];
      data[off + px * 4 + 3] = rgba[3];
    }
    entries[key] = { layer, rect: { u0: 0, v0: 0, u1: 1, v1: 1 } };
  }

  const texture = new BABYLON.RawTexture2DArray(
    data,
    size,
    size,
    layers,
    BABYLON.Engine.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    BABYLON.Texture.NEAREST_SAMPLINGMODE,
    BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE
  );
  texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

  return {
    texture,
    entries,
    get(key: string): ShadoAtlasEntry {
      return entries[key] ?? entries[keys[0]];
    },
    dispose(): void {
      texture.dispose();
    },
  };
}
