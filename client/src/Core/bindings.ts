import JSZip from "jszip";
import { maybeDecompressGzip } from "./compression";

type Options = {
  setSplash: (visible: boolean) => void;
};

const baseUrl = "https://eqrequiem.blob.core.windows.net/requiem";
const zippedPrefixes = ["eqrequiem/textures"];
const bundledAssetPaths = new Set([
  "eqrequiem/babylon/hum.babylon.gz",
  "eqrequiem/basis/hum.basis",
  "eqrequiem/basis/hum.json",
  "eqrequiem/vat/hum.bin.gz",
  "eqrequiem/vat/hum_32.bin.gz",
  "eqrequiem/vat/hum.json",
  "eqrequiem/babylon/huf.babylon.gz",
  "eqrequiem/basis/huf.basis",
  "eqrequiem/basis/huf.json",
  "eqrequiem/vat/huf.bin.gz",
  "eqrequiem/vat/huf_32.bin.gz",
  "eqrequiem/vat/huf.json",
  "eqrequiem/sky/requiem-sky.glb",
  "eqrequiem/sky/requiem-sky.glb.gz",
  "eqrequiem/sky/requiem-sky.json",
  "eqrequiem/sky/textures/cloud-field.webp",
  "eqrequiem/sky/textures/star-field.webp",
  "eqrequiem/sky/textures/sun-photosphere.webp",
  "eqrequiem/sky/textures/moon-surface.webp",
  "eqrequiem/scenes/requiem-character-select.glb",
  "eqrequiem/scenes/requiem-character-select.glb.gz",
  "eqrequiem/scenes/requiem-character-select.json",
]);

class FileSystemBindings {
  private readonly fetchPromises = new Map<
    string,
    Promise<ArrayBuffer | null>
  >();
  private readonly zipPromises = new Map<string, Promise<JSZip | null>>();

  initialize({ setSplash }: Options): void {
    window.setSplash = setSplash;
  }

  private fetchOnce(key: string, url: string): Promise<ArrayBuffer | null> {
    const existing = this.fetchPromises.get(key);
    if (existing) return existing;

    const request = fetch(url, {
      mode: "cors",
      cache: "default",
    })
      .then(async (response) => {
        if (response.status === 404) {
          console.warn(`File not found: ${url}`);
          return null;
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching ${url}`);
        }
        return response.arrayBuffer();
      })
      .catch((error) => {
        console.error(`Error fetching ${url}:`, error);
        return null;
      })
      .finally(() => {
        this.fetchPromises.delete(key);
      });
    this.fetchPromises.set(key, request);
    return request;
  }

  private async getZippedFile(
    folderPath: string,
    fileName: string,
  ): Promise<ArrayBuffer | null> {
    const pathParts = folderPath.split("/");
    const zipFolder = pathParts.at(-1);
    if (!zipFolder) return null;
    const zipUrl = `${baseUrl}/${pathParts.slice(0, -1).join("/")}/${zipFolder}.zip`;
    const zipKey = zipUrl.toLowerCase();

    let archive = this.zipPromises.get(zipKey);
    if (!archive) {
      archive = this.fetchOnce(zipKey, zipUrl).then((buffer) =>
        buffer ? JSZip.loadAsync(buffer) : null,
      );
      this.zipPromises.set(zipKey, archive);
    }
    const zip = await archive;
    if (!zip) return null;

    const normalizedName = fileName.toLowerCase();
    const entry = Object.values(zip.files).find((candidate) => {
      if (candidate.dir) return false;
      return candidate.name.split("/").at(-1)?.toLowerCase() === normalizedName;
    });
    if (!entry) {
      console.warn(`File not found in ${zipUrl}: ${fileName}`);
      return null;
    }
    return maybeDecompressGzip(await entry.async("arraybuffer"));
  }

  async getOrFetch(
    folderPath: string,
    fileName: string,
  ): Promise<ArrayBuffer | null> {
    folderPath = folderPath.toLowerCase();
    fileName = fileName.toLowerCase();

    if (zippedPrefixes.some((prefix) => folderPath.startsWith(prefix))) {
      return this.getZippedFile(folderPath, fileName);
    }

    const assetPath = `${folderPath}/${fileName}`
      .replace(/^\/+/, "")
      .toLowerCase();
    const assetBaseUrl = bundledAssetPaths.has(assetPath)
      ? import.meta.env.BASE_URL
      : `${baseUrl}/`;
    let normalizedPath = `${assetBaseUrl}${assetPath}`
      .replace(/\/+/g, "/")
      .replace(/^https:\/+/, "https://")
      .replace(/\/$/, "")
      .toLowerCase();
    if (
      normalizedPath.endsWith(".glb") ||
      normalizedPath.endsWith(".babylon")
    ) {
      normalizedPath = `${normalizedPath}.gz`;
    }

    const response = await this.fetchOnce(normalizedPath, normalizedPath);
    return response ? maybeDecompressGzip(response) : null;
  }

  getFile = async (
    folderPath: string,
    fileName: string,
  ): Promise<ArrayBuffer | null> => {
    try {
      return await this.getOrFetch(folderPath, fileName);
    } catch (error) {
      console.error(`Error getting ${folderPath}/${fileName}:`, error);
      return null;
    }
  };
}

export const fsBindings = new FileSystemBindings();
