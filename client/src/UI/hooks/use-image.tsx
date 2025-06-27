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
const sakCache = {};

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
    if (sakCache[path]) {
      setImage(sakCache[path]);
      return;
    }
    ImageCache.getImageUrl(
      "uifiles/sakui",
      entry.texture,
      crop,
      entry.left,
      entry.top,
      entry.width,
      entry.height,
    )
      .then((img) => {
        sakCache[path] = img;
        return img;
      })
      .then(setImage);
  }, [entry, crop, path]);
  return {
    entry,
    image,
  };
};

export const useSakImages = (
  paths: string[],
  crop: boolean = false,
): ImageEntry[] => {
  const entries = useMemo<AtlasEntry[]>(
    () => paths.map((path) => sakAtlas[path] || atlas[path]).filter(Boolean),
    [paths],
  );
  const [images, setImages] = useState<string[]>(
    new Array(entries.length).fill(null),
  );

  useEffect(() => {
    if (entries.length === 0) {
      setImages(new Array(entries.length).fill(null));
      return;
    }
    if (entries.every((entry) => sakCache[entry.texture])) {
      setImages(entries.map((entry) => sakCache[entry.texture]));
      return;
    }
    Promise.all(
      entries.map((entry) =>
        ImageCache.getImageUrl(
          "uifiles/sakui",
          entry.texture,
          crop,
          entry.left,
          entry.top,
          entry.width,
          entry.height,
        ),
      ),
    )
      .then((imgs) => {
        imgs.forEach((img, index) => {
          sakCache[entries[index].texture] = img;
        });
        return imgs;
      })
      .then(setImages);
  }, [entries, crop]);

  return entries.map((entry, index) => ({
    entry,
    image: images[index],
  }));
};

const stoneCache = {};
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
    if (stoneCache[path]) {
      setImage(stoneCache[path]);
      return;
    }
    ImageCache.getImageUrl(
      "uifiles/stone",
      entry.texture,
      crop,
      entry.left,
      entry.top,
      entry.width,
      entry.height,
    )
      .then((img) => {
        stoneCache[path] = img;
        return img;
      })
      .then(setImage);
  }, [entry, crop, path]);
  return {
    entry,
    image,
  };
};

export const useStoneImages = (
  paths: string[],
  crop: boolean = false,
): ImageEntry[] => {
  const entries = useMemo<AtlasEntry[]>(
    () => paths.map((path) => stoneAtlas[path] || atlas[path]).filter(Boolean),
    [paths],
  );
  const [images, setImages] = useState<string[]>(
    new Array(entries.length).fill(null),
  );

  useEffect(() => {
    if (entries.length === 0) {
      setImages(new Array(entries.length).fill(null));
      return;
    }
    if (entries.every((entry) => stoneCache[entry.texture])) {
      setImages(entries.map((entry) => stoneCache[entry.texture]));
      return;
    }
    Promise.all(
      entries.map((entry) =>
        ImageCache.getImageUrl(
          "uifiles/stone",
          entry.texture,
          crop,
          entry.left,
          entry.top,
          entry.width,
          entry.height,
        ),
      ),
    )
      .then((img) => {
        img.forEach((image, index) => {
          stoneCache[entries[index].texture] = image;
        });
        return img;
      })
      .then(setImages);
  }, [entries, crop]);

  return entries.map((entry, index) => ({
    entry,
    image: images[index],
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
