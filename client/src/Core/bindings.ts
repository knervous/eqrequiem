import JSZip from 'jszip';
import {
  configureRootFileSystem,
  getRootEQFile,
  writeRootEQFile,
} from './opfs';
import { maybeDecompressGzip } from './compression';

type Options = {
  rootFileSystemHandle: FileSystemDirectoryHandle;
  setSplash: (visible: boolean) => void;
};

const baseUrl = 'https://eqrequiem.blob.core.windows.net/requiem';
const zippedPrefixes = ['eqrequiem/textures'];
const bundledAssetPaths = new Set([
  'eqrequiem/babylon/hum.babylon.gz',
  'eqrequiem/basis/hum.basis',
  'eqrequiem/basis/hum.json',
  'eqrequiem/vat/hum.bin.gz',
  'eqrequiem/vat/hum_32.bin.gz',
  'eqrequiem/vat/hum.json',
  'eqrequiem/babylon/huf.babylon.gz',
  'eqrequiem/basis/huf.basis',
  'eqrequiem/basis/huf.json',
  'eqrequiem/vat/huf.bin.gz',
  'eqrequiem/vat/huf_32.bin.gz',
  'eqrequiem/vat/huf.json',
]);
const REQUIEM_FILE_VERSION = '1.1.29';

async function deleteFolderRecursively(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file') {
      await handle.removeEntry(name);
    } else {
      await deleteFolderRecursively(entry);
      await handle.removeEntry(name, { recursive: true });
    }
  }
}

class FileSystemBindings {
  private assetPromises = new Map<string, Promise<ArrayBuffer | null>>();
  private fetchPromises = new Map<string, Promise<ArrayBuffer | null>>();
  private unzipPromises = new Map<string, Promise<void>>();
  public rootFileSystemHandle: FileSystemDirectoryHandle | null = null;

  async initialize({
    rootFileSystemHandle,
    setSplash,
  }: Options): Promise<void> {
    this.rootFileSystemHandle = rootFileSystemHandle;
    configureRootFileSystem(rootFileSystemHandle);
    window.setSplash = setSplash;

    const versionBuffer =
      (await getRootEQFile('eqrequiem', 'requiem_version.txt')) ??
      new ArrayBuffer(0);
    const storedVersion = new TextDecoder().decode(versionBuffer);
    if (storedVersion === REQUIEM_FILE_VERSION) return;

    const root = await rootFileSystemHandle.getDirectoryHandle('eqrequiem', {
      create: true,
    });
    const generatedFolders = [
      'data',
      'babylon',
      'basis',
      'vat',
      'items',
      'models',
      'objects',
      'zones',
    ];
    await Promise.all(
      generatedFolders.map(async (folder) => {
        const handle = await root
          .getDirectoryHandle(folder)
          .catch(() => undefined);
        if (!handle) return;
        await deleteFolderRecursively(handle).catch((error) => {
          console.error(`Error deleting folder ${folder}:`, error);
        });
      }),
    );
    await writeRootEQFile(
      'eqrequiem',
      'requiem_version.txt',
      new TextEncoder().encode(REQUIEM_FILE_VERSION),
    );
  }

  private async unzipToFilesystem(
    zipBuffer: ArrayBuffer,
    folderPath: string,
  ): Promise<void> {
    const zip = await JSZip.loadAsync(zipBuffer);
    await Promise.all(
      Object.values(zip.files).map(async (entry) => {
        if (entry.dir) return;
        const fileName = entry.name.split('/').pop();
        if (!fileName) return;
        const buffer = await entry.async('arraybuffer');
        const written = await writeRootEQFile(folderPath, fileName, buffer);
        if (!written) {
          throw new Error(`Unable to cache ${folderPath}/${fileName}`);
        }
      }),
    );
  }

  private fetchOnce(
    key: string,
    url: string,
  ): Promise<ArrayBuffer | null> {
    const existing = this.fetchPromises.get(key);
    if (existing) return existing;

    const request = fetch(url, { mode: 'cors' })
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
    const pathParts = folderPath.split('/');
    const zipFolder = pathParts.at(-1);
    if (!zipFolder) return null;
    const zipUrl = `${baseUrl}/${pathParts.slice(0, -1).join('/')}/${zipFolder}.zip`;
    const zipKey = zipUrl.toLowerCase();

    let extraction = this.unzipPromises.get(zipKey);
    if (!extraction) {
      extraction = (async () => {
        const zipBuffer = await this.fetchOnce(zipKey, zipUrl);
        if (!zipBuffer) return;
        await this.unzipToFilesystem(zipBuffer, folderPath);
      })().finally(() => {
        this.unzipPromises.delete(zipKey);
      });
      this.unzipPromises.set(zipKey, extraction);
    }
    await extraction;
    return (await getRootEQFile(folderPath, fileName)) ?? null;
  }

  async getOrFetch(
    folderPath: string,
    fileName: string,
  ): Promise<ArrayBuffer | null> {
    folderPath = folderPath.toLowerCase();
    fileName = fileName.toLowerCase();

    const cached = await getRootEQFile(folderPath, fileName);
    if (cached) {
      const decoded = maybeDecompressGzip(cached);
      if (decoded !== cached) {
        await writeRootEQFile(folderPath, fileName, decoded);
      }
      return decoded;
    }

    if (zippedPrefixes.some((prefix) => folderPath.startsWith(prefix))) {
      return this.getZippedFile(folderPath, fileName);
    }

    const assetPath = `${folderPath}/${fileName}`.toLowerCase();
    const assetBaseUrl = bundledAssetPaths.has(assetPath)
      ? import.meta.env.BASE_URL
      : `${baseUrl}/`;
    let normalizedPath = `${assetBaseUrl}${assetPath}`
      .replace(/\/+/g, '/')
      .replace(/^https:\/+/, 'https://')
      .replace(/\/$/, '')
      .toLowerCase();
    if (normalizedPath.endsWith('.glb')) {
      normalizedPath = `${normalizedPath}.gz`;
    } else if (normalizedPath.endsWith('.babylon')) {
      normalizedPath = `${normalizedPath}.gz`;
    }

    const existing = this.assetPromises.get(normalizedPath);
    if (existing) return existing;

    const load = (async () => {
      const responseBuffer = await this.fetchOnce(
        normalizedPath,
        normalizedPath,
      );
      if (!responseBuffer) return null;

      const buffer = maybeDecompressGzip(responseBuffer);
      const written = await writeRootEQFile(folderPath, fileName, buffer);
      return written ? buffer : null;
    })().finally(() => {
      this.assetPromises.delete(normalizedPath);
    });
    this.assetPromises.set(normalizedPath, load);
    return load;
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
