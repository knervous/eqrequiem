import { useEffect, useMemo, useState } from 'react';
import { ImageCache } from '../util/image-cache';

export type AtlasEntry = {
  texture: string; // Path to the texture file (e.g., "uifiles/default/atlas.tga")
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ImageEntry = {
  entry: AtlasEntry;
  image: string | null;
};

type Atlas = Record<string, AtlasEntry>;
type AtlasKind = 'default' | 'sak' | 'stone';
const EMPTY_ATLAS_ENTRY: AtlasEntry = Object.freeze({
  texture: '',
  left: 0,
  top: 0,
  width: 0,
  height: 0,
});

const atlasLoaders: Record<AtlasKind, () => Promise<Atlas>> = {
  default: () =>
    import('../util/atlas.json').then((module) => module.default as Atlas),
  sak: () =>
    import('../util/atlas-sak.json').then((module) => module.default as Atlas),
  stone: () =>
    import('../util/atlas-stone.json').then((module) => module.default as Atlas),
};
const atlasPromises = new Map<AtlasKind, Promise<Atlas>>();
const imagePromises = new Map<string, Promise<string>>();
const DEFAULT_ATLASES = ['default'] as const;
const SAK_ATLASES = ['sak', 'stone', 'default'] as const;
const SAK_MULTI_ATLASES = ['sak', 'default'] as const;
const STONE_ATLASES = ['stone', 'default'] as const;

function loadAtlas(kind: AtlasKind): Promise<Atlas> {
  let promise = atlasPromises.get(kind);
  if (!promise) {
    promise = atlasLoaders[kind]();
    atlasPromises.set(kind, promise);
  }
  return promise;
}

async function resolveAtlasEntry(
  path: string,
  kinds: readonly AtlasKind[],
): Promise<AtlasEntry | undefined> {
  for (const kind of kinds) {
    const entry = (await loadAtlas(kind))[path];
    if (entry) return entry;
  }
  return undefined;
}

function useAtlasImages(
  paths: string[],
  kinds: readonly AtlasKind[],
  folder: string,
  crop: boolean,
): ImageEntry[] {
  const pathKey = paths.join('\u0000');
  const [resolved, setResolved] = useState<
    Array<{ path: string; entry: AtlasEntry }>
  >([]);
  const [images, setImages] = useState<(string | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    const requestedPaths = pathKey ? pathKey.split('\u0000') : [];
    void Promise.all(
      requestedPaths.map(async (path) => ({
        path,
        entry: await resolveAtlasEntry(path, kinds),
      })),
    ).then((next) => {
      if (cancelled) return;
      setResolved(
        next.filter(
          (item): item is { path: string; entry: AtlasEntry } =>
            Boolean(item.entry),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [kinds, pathKey]);

  useEffect(() => {
    let cancelled = false;
    if (!resolved.length) {
      setImages([]);
      return;
    }
    void Promise.all(
      resolved.map(({ path, entry }) => {
        const cacheKey = `${folder}:${path}:${crop ? 1 : 0}`;
        let promise = imagePromises.get(cacheKey);
        if (!promise) {
          promise = ImageCache.getImageUrl(
            folder,
            entry.texture,
            crop,
            entry.left,
            entry.top,
            entry.width,
            entry.height,
          );
          imagePromises.set(cacheKey, promise);
        }
        return promise;
      }),
    ).then((next) => {
      if (!cancelled) setImages(next);
    });
    return () => {
      cancelled = true;
    };
  }, [crop, folder, resolved]);

  return resolved.map(({ entry }, index) => ({
    entry,
    image: images[index] ?? null,
  }));
}

export const useSakImage = (
  path: string,
  crop: boolean = false,
): ImageEntry =>
  useAtlasImages([path], SAK_ATLASES, 'uifiles/sakui', crop)[0] ?? {
    entry: EMPTY_ATLAS_ENTRY,
    image: null,
  };

export const useSakImages = (
  paths: string[],
  crop: boolean = false,
): ImageEntry[] =>
  useAtlasImages(paths, SAK_MULTI_ATLASES, 'uifiles/sakui', crop);

export const useStoneImage = (
  path: string,
  crop: boolean = false,
): ImageEntry =>
  useAtlasImages([path], STONE_ATLASES, 'uifiles/stone', crop)[0] ?? {
    entry: EMPTY_ATLAS_ENTRY,
    image: null,
  };

export const useStoneImages = (
  paths: string[],
  crop: boolean = false,
): ImageEntry[] =>
  useAtlasImages(paths, STONE_ATLASES, 'uifiles/stone', crop);

const rawCache: Record<string, Promise<string>> = {};
export const useRawImage = (
  folder: string,
  path: string,
  type: string,
): string => {
  const [image, setImage] = useState<string>('');
  useEffect(() => {
    if (!path) {
      setImage('');
      return;
    }
    // Check if the image is already cached
    let promise = rawCache[path];
    if (!promise) {
      // If not cached, create a new promise to fetch the image
      promise = ImageCache.getRawImageUrl(folder, path, type);
      rawCache[path] = promise;
    }
    
    promise.then((imgUrl) => {
      setImage(imgUrl);
    });

  }, [folder, path, type]);
  return image || '';
};

export const useImage = (path: string, crop: boolean = false): ImageEntry => {
  return (
    useAtlasImages([path], DEFAULT_ATLASES, 'uifiles/default', crop)[0] ?? {
      entry: EMPTY_ATLAS_ENTRY,
      image: null,
    }
  );
};


type AtlasType ={
  texture: string; // Path to the texture file (e.g., "uifiles/default/atlas.tga")
  x: number; // X coordinate of the sprite in the atlas
  y: number; // Y coordinate of the sprite in the atlas
  cellSize: number; // Size of each cell in the atlas
} 
const loadAtlasItem =
  (prefix, padStart, base, gridItems, columns, cellSize) => (id): AtlasType => {
    const itemId = id - base;
    const fileIndex = Math.floor(itemId / gridItems) + 1;

    const spriteIndex = itemId % gridItems;

    const row = Math.floor(spriteIndex / columns);
    const col = spriteIndex % columns;

    const x = row * cellSize;
    const y = col * cellSize;

    return {
      texture: `${prefix}${fileIndex.toString().padStart(padStart, '0')}.webp`,
      x,
      y,
      cellSize,
    };
  };

export const loadItemIcon = loadAtlasItem('dragitem', 0, 500, 36, 6, 40);
export const loadSpellIcon = loadAtlasItem('Spells', 2, 0, 36, 6, 40);
export const loadGemIcon = loadAtlasItem('gemicons', 2, 0, 100, 10, 24);

export const useItemImage = (id: number): string => {
  const atlasItem = useMemo(() => id === -1 ? null : loadItemIcon(id), [id]);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!atlasItem) {
      setImage(null);
      return;
    }
    ImageCache.getImageUrl(
      'uifiles/default',
      atlasItem.texture,
      true,
      atlasItem.x,
      atlasItem.y,
      atlasItem.cellSize,
      atlasItem.cellSize,
    ).then(setImage);
  }, [atlasItem]);
  return image || '';
};
