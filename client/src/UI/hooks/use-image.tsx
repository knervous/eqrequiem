import { useEffect, useMemo, useState } from "react";
import atlas from "../util/atlas";
import stoneAtlas from "../util/atlas-stone";
import sakAtlas from "../util/atlas-sak";
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
}

export const useSakImages = (paths: string[], crop: boolean = false): ImageEntry[] => {
  const entries = useMemo<AtlasEntry[]>(() => paths.map((path) => sakAtlas[path] || atlas[path]).filter(Boolean), [paths]);
  const [images, setImages] = useState<string[]>(new Array(entries.length).fill(null));

  useEffect(() => {
    if (entries.length === 0) {
      setImages(new Array(entries.length).fill(null));
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
    ).then(setImages);
  }, [entries, crop]);

  return entries.map((entry, index) => ({
    entry,
    image: images[index],
  }));
};

export const useStoneImages = (paths: string[], crop: boolean = false): ImageEntry[] => {
  const entries = useMemo<AtlasEntry[]>(() => paths.map((path) => stoneAtlas[path] || atlas[path]).filter(Boolean), [paths]);
  const [images, setImages] = useState<string[]>(new Array(entries.length).fill(null));

  useEffect(() => {
    if (entries.length === 0) {
      setImages(new Array(entries.length).fill(null));
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
    ).then(setImages);
  }, [entries, crop]);

  return entries.map((entry, index) => ({
    entry,
    image: images[index],
  }));
};


export const useSakImage = (path: string, crop: boolean = false): ImageEntry => {
  const entry = useMemo<AtlasEntry>(() => sakAtlas[path] || atlas[path], [path]);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!entry) {
      setImage(null);
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
    ).then(setImage);
  }, [entry, crop]);
  return {
    entry,
    image,
  };
};

export const useStoneImage = (path: string, crop: boolean = false): ImageEntry => {
  const entry = useMemo<AtlasEntry>(() => stoneAtlas[path] || atlas[path], [path]);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (!entry) {
      setImage(null);
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
    ).then(setImage);
  }, [entry, crop]);
  return {
    entry,
    image,
  };
};

export const useRawImage = (folder: string, path: string, type: string): string => {
  const [image, setImage] = useState<string>("");
  useEffect(() => {
    ImageCache.getRawImageUrl(
      folder,
      path,
      type,
    ).then(setImage);
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
