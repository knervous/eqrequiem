import { use, useEffect, useMemo, useState } from 'react';
import sakAtlas from '../util/atlas-sak.json';
import stoneAtlas from '../util/atlas-stone.json';
import atlas from '../util/atlas.json';
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

// ––– SAK CACHE (promises) –––
const sakCache: Record<string, Promise<string>> = {};

export const useSakImage = (
  path: string,
  crop: boolean = false,
): ImageEntry => {
  const entry = useMemo<AtlasEntry>(
    () => sakAtlas[path] || stoneAtlas[path] || atlas[path],
    [path],
  );
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) {
      setImage(null);
      return;
    }

    // get or create the promise
    let promise = sakCache[path];
    if (!promise) {
      promise = ImageCache.getImageUrl(
        'uifiles/sakui',
        entry.texture,
        crop,
        entry.left,
        entry.top,
        entry.width,
        entry.height,
      );
      sakCache[path] = promise;
    }

    promise.then(setImage);

  }, [entry, crop, path]);

  return { entry, image };
};

export const useSakImages = (
  paths: string[],
  crop: boolean = false,
): ImageEntry[] => {
  // first resolve entries for each path
  const entries = useMemo(
    () => paths
      .map((p) => sakAtlas[p] || atlas[p])
      .filter((e): e is AtlasEntry => Boolean(e)),
    [paths],
  );

  const [images, setImages] = useState<(string | null)[]>(
    new Array(entries.length).fill(null),
  );

  useEffect(() => {
    if (entries.length === 0) {
      setImages([]);
      return;
    }

    // build or grab each promise
    const promises = entries.map((entry, i) => {
      const path = paths[i];
      let promise = sakCache[path];
      if (!promise) {
        promise = ImageCache.getImageUrl(
          'uifiles/sakui',
          entry.texture,
          crop,
          entry.left,
          entry.top,
          entry.width,
          entry.height,
        );
        sakCache[path] = promise;
      }
      return promise;
    });

    Promise.all(promises).then((imgs) => {
      setImages(imgs);
    });
  }, [paths, crop, entries]);

  return entries.map((entry, i) => ({
    entry,
    image: images[i],
  }));
};

// ––– STONE CACHE (promises) –––
const stoneCache: Record<string, Promise<string>> = {};

export const useStoneImage = (
  path: string,
  crop: boolean = false,
): ImageEntry => {
  const entry = useMemo<AtlasEntry>(
    () => stoneAtlas[path] || atlas[path],
    [path],
  );
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!entry) {
      setImage(null);
      return;
    }

    let promise = stoneCache[path];
    if (!promise) {
      promise = ImageCache.getImageUrl(
        'uifiles/stone',
        entry.texture,
        crop,
        entry.left,
        entry.top,
        entry.width,
        entry.height,
      );
      stoneCache[path] = promise;
    }

    promise.then(setImage);
  }, [entry, crop, path]);

  return { entry, image };
};

export const useStoneImages = (
  paths: string[],
  crop: boolean = false,
): ImageEntry[] => {
  const entries = useMemo(
    () => paths
      .map((p) => stoneAtlas[p] || atlas[p])
      .filter((e): e is AtlasEntry => Boolean(e)),
    [paths],
  );

  const [images, setImages] = useState<(string | null)[]>(
    new Array(entries.length).fill(null),
  );

  useEffect(() => {
    if (entries.length === 0) {
      setImages([]);
      return;
    }

    const promises = entries.map((entry, i) => {
      const path = paths[i];
      let promise = stoneCache[path];
      if (!promise) {
        promise = ImageCache.getImageUrl(
          'uifiles/stone',
          entry.texture,
          crop,
          entry.left,
          entry.top,
          entry.width,
          entry.height,
        );
        stoneCache[path] = promise;
      }
      return promise;
    });

    Promise.all(promises).then(setImages);
  }, [paths, crop, entries]);

  return entries.map((entry, i) => ({
    entry,
    image: images[i],
  }));
};

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
  const entry = useMemo<AtlasEntry>(() => atlas[path], [path]);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!entry) {
      setImage(null);
      return;
    }
    ImageCache.getImageUrl(
      'uifiles/default',
      entry.texture,
      crop,
      entry.left,
      entry.top,
      entry.width,
      entry.height,
    ).then(setImage);
  }, [entry, crop]);
  return {
    entry,
    image,
  };
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
