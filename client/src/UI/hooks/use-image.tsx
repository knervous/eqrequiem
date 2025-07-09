import { useEffect, useMemo, useState } from "react";
import atlas from "../util/atlas.json";
import stoneAtlas from "../util/atlas-stone.json";
import sakAtlas from "../util/atlas-sak.json";
import { ImageCache } from "../util/image-cache";

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

//––– SAK CACHE (promises) –––
const sakCache: Record<string, Promise<string>> = {};

export const useSakImage = (
  path: string,
  crop: boolean = false,
): ImageEntry => {
  const entry = useMemo<AtlasEntry>(
    () => sakAtlas[path] || atlas[path],
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
        "uifiles/sakui",
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
          "uifiles/sakui",
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

//––– STONE CACHE (promises) –––
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
        "uifiles/stone",
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
          "uifiles/stone",
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
export const useRawImage = (
  folder: string,
  path: string,
  type: string,
): string => {
  const [image, setImage] = useState<string>("");
  useEffect(() => {
    ImageCache.getRawImageUrl(folder, path, type).then(setImage);
  }, [folder, path, type]);
  return image || "";
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
      "uifiles/default",
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
