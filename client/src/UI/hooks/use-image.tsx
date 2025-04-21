import React, { useEffect, useMemo, useState } from "react";
import atlas from "../util/atlas";
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
