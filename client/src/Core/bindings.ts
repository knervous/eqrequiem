import { Dispatch } from "react";
import { setGlobals } from "sage-core/globals";
import { EQFileHandle } from "sage-core/model/file-handle";
import {
  getEQFile,
  getEQFileExists,
  getRootFiles,
  getRootEQFile,
  writeRootEQFile,
} from "sage-core/util/fileHandler";
import * as Comlink from "comlink";
import { USE_SAGE } from "@game/Constants/constants";
import JSZip from "jszip";


async function deleteFolderRecursively(handle) {
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file') {
      await handle.removeEntry(name);
    } else if (entry.kind === 'directory') {
      await deleteFolderRecursively(entry);
      await handle.removeEntry(name, { recursive: true });
    }
  }
}

type Models = {
  [key: string]: number[] | string[];
};

type Options = {
  rootFileSystemHandle: FileSystemHandle;
  setLoading: Dispatch<React.SetStateAction<boolean>>;
  setLoadingText: Dispatch<React.SetStateAction<string>>;
  setLoadingTitle: Dispatch<React.SetStateAction<string>>;
  setConverting: Dispatch<React.SetStateAction<{ name: string }[]>>;
  setSplash: Dispatch<React.SetStateAction<boolean>>;
};

type CacheEntry = {
  value: ArrayBuffer;
  lastAccess: number;
};

const baseUrl = "https://eqrequiem.blob.core.windows.net/requiem";
const zippedPrefixes = ["eqrequiem/textures"];
const REQUIEM_FILE_VERSION = '1.1.20';

function selectMinimalFiles(candidateArrays: number[][]): number[] {
  let remaining = candidateArrays.slice();
  const selected = new Set<number>();

  while (remaining.length > 0) {
    const frequency = new Map();
    for (const candidateArray of remaining) {
      for (const fileId of candidateArray) {
        frequency.set(fileId, (frequency.get(fileId) || 0) + 1);
      }
    }

    let bestCandidate = null;
    let bestCount = 0;
    for (const [fileId, count] of frequency.entries()) {
      if (count > bestCount) {
        bestCandidate = fileId;
        bestCount = count;
      }
    }

    if (bestCandidate === null) {
      break;
    }

    selected.add(bestCandidate);

    remaining = remaining.filter(
      (candidateArray) => !candidateArray.includes(bestCandidate),
    );
  }

  return Array.from(selected);
}

class FileSystemBindings {
  private debounceTimeout: number | null = null;
  private debounceDelay = 200;
  private pendingTasks: Map<
    string,
    {
      candidates: number[];
      promises: {
        resolve: (value: any) => void;
        reject: (reason?: any) => void;
      }[];
    }
  > = new Map();
  private processedResults: Map<string, CacheEntry> = new Map(); // Cache for processed data
  private fetchPromises: Map<string, Promise<Uint8Array | null>> = new Map(); // Cache for pending fetch promises
  private unzipPromises: Map<string, Promise<void>> = new Map(); // New: Track ongoing unzip operations
  private models: Models = {};
  public rootFileSystemHandle: FileSystemHandle | null = null;
  private queue: number[] = [];
  private candidates: number[][] = [];
  private wrappedWorker: Comlink.Remote<unknown> | null = null;
  private setConverting: Dispatch<
    React.SetStateAction<{ name: string }[]>
  > | null = null;

  private updateProcessedResults = (data: { [key: string]: ArrayBuffer }) => {
    if (!data) return;
    for (const [key, value] of Object.entries(data)) {
      this.processedResults.set(key, { value, lastAccess: Date.now() });
    }
  };

  private getProcessedResult = (fileName: string): ArrayBuffer | undefined => {
    const entry = this.processedResults.get(fileName);
    if (entry) {
      entry.lastAccess = Date.now();
      return entry.value;
    }
    return undefined;
  };

  private cleanUpProcessedResults = (maxAge: number = 60000) => {
    const now = Date.now();
    for (const [key, { lastAccess }] of this.processedResults.entries()) {
      if (now - lastAccess > maxAge) {
        this.processedResults.delete(key);
      }
    }
  };

  async initialize(options: Options) {
    const {
      rootFileSystemHandle,
      setLoading,
      setLoadingText,
      setLoadingTitle,
      setSplash,
      setConverting,
    } = options;
    this.setConverting = setConverting;
    const gameController = {
      rootFileSystemHandle,
    };
    this.rootFileSystemHandle = rootFileSystemHandle;
    window.gameController = gameController;
    const GlobalStore = {
      actions: {
        setLoading,
        setLoadingText,
        setLoadingTitle,
      },
    };
    window.setSplash = setSplash;
    const requiemFileVersion = (await getRootEQFile('eqrequiem', 'requiem_version.txt')) ?? new ArrayBuffer(0);
    // this was an arraybuffer i want to decode and read it to string
    const stringFileVersion = new TextDecoder('utf-8').decode(requiemFileVersion);
    console.log('Str', stringFileVersion);
    if (stringFileVersion !== REQUIEM_FILE_VERSION) {
      const root = await this.rootFileSystemHandle.getDirectoryHandle('eqrequiem', { create: true });
      for (const folder of ['data', 'babylon', 'basis', 'vat', 'items', 'models', 'objects', 'zones']) {
        const handle = await root.getDirectoryHandle(folder, { create: false }).catch(() => {});
        if (!handle) continue;
        await deleteFolderRecursively(handle).catch((e) => {
          console.error(`Error deleting folder ${folder}:`, e);
        });
      }
      console.log('Deleted old files, writing new version', REQUIEM_FILE_VERSION);
      await writeRootEQFile('eqrequiem', 'requiem_version.txt', new TextEncoder().encode(REQUIEM_FILE_VERSION));
    }
    /**
     * Globals
     */
    setGlobals({ gameController, GlobalStore, root: "eqrequiem" });
    this.models = await fetch(`models.json`, { mode: 'cors' })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch models.json: ${r.status}`);
        return r.json();
      })
      .catch((e) => {
        console.error("Error fetching models.json:", e);
        throw e;
      });
    if (USE_SAGE) {
      console.log("Using Sage Worker");
      const worker = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
      const wrappedWorker = Comlink.wrap(worker);
      this.wrappedWorker = wrappedWorker;
    }

    setInterval(() => {
      this.cleanUpProcessedResults();
    }, 60000);
  }
  processFiles = async (rootName: string, files: string[]) => {
    const handles = await Promise.all(
      await getRootFiles((name: string) => files.includes(name)),
    );
    const handleNames = handles.map((h: FileSystemFileHandle) => ({
      name: h.name,
    }));

    this.setConverting?.(handleNames);
    console.log("--- Processing Handles ---", handleNames);
    const canvas = document.createElement("canvas");
    const offScreen = canvas.transferControlToOffscreen();
    try {
      const data = await this.wrappedWorker?.process(
        rootName,
        Comlink.transfer(offScreen, [offScreen]),
        this.rootFileSystemHandle,
        ...handles,
      );

      return data;
    } catch (e) {
      console.log("Error processing", e);
      throw e;
    }
  };

  flushQueue = async () => {
    if (!this.candidates.length) return;

    const currentCandidates = [...this.candidates];
    this.candidates = [];

    this.queue = selectMinimalFiles(currentCandidates);

    const minimalFiles = this.queue
      .map((fileId) => this.models.stringTable[fileId])
      .filter(Boolean) as string[];

    if (!minimalFiles.length) {
      console.log("No minimal files to load");
      return;
    }
    if (
      this.queue.includes(this.models.stringTable.indexOf("global_chr.s3d"))
    ) {
      console.log("Adding global3_chr to queue");
      minimalFiles.push("global3_chr.s3d");
      minimalFiles.push("global4_chr.s3d");
    }
    const handles = await Promise.all(
      await getRootFiles((name: string) => minimalFiles.includes(name)),
    );
    const handleNames = handles.map((h: FileSystemFileHandle) => ({
      name: h.name,
    }));

    this.setConverting?.(handleNames);
    console.log("--- Processing Handles ---", handleNames);
    const canvas = document.createElement("canvas");
    const offScreen = canvas.transferControlToOffscreen();
    try {
      const data = await this.wrappedWorker?.process(
        minimalFiles[0].replace(".s3d", "").replace(".eqg", ""),
        Comlink.transfer(offScreen, [offScreen]),
        this.rootFileSystemHandle,
        ...handles,
      );
      this.updateProcessedResults(data);
      this.checkPendingTasks();
      return data;
    } catch (e) {
      console.log("Error processing", e);
      this.rejectPendingTasks(e);
      throw e;
    }
  };

  private checkPendingTasks = () => {
    for (const [path, task] of this.pendingTasks) {
      const pathParts = path.split("/");
      const fileName = pathParts[pathParts.length - 1];
      if (this.processedResults.has(fileName)) {
        const data = this.getProcessedResult(fileName);
        task.promises.forEach(({ resolve }) => resolve(data));
        this.pendingTasks.delete(path);
      }
    }
  };

  private rejectPendingTasks = (reason: any) => {
    for (const [, task] of this.pendingTasks) {
      task.promises.forEach(({ reject }) => reject(reason));
    }
    this.pendingTasks.clear();
  };

  enqueueFile = (path: string, candidates: number[]) => {
    candidates = candidates.filter((i) => {
      if (/global[a-z]+_/.test(this.models.stringTable[i] as string)) {
        return false;
      }
      return true;
    });

    if (!candidates.length) {
      return Promise.resolve(null);
    }

    const pathParts = path.split("/");
    const fileName = pathParts[pathParts.length - 1];
    if (this.processedResults.has(fileName)) {
      return Promise.resolve(this.getProcessedResult(fileName));
    }

    this.candidates.push(candidates);

    return new Promise((resolve, reject) => {
      if (this.pendingTasks.has(path)) {
        this.pendingTasks.get(path)!.promises.push({ resolve, reject });
      } else {
        this.pendingTasks.set(path, {
          candidates,
          promises: [{ resolve, reject }],
        });
      }

      if (this.debounceTimeout !== null) {
        clearTimeout(this.debounceTimeout);
      }

      this.debounceTimeout = setTimeout(async () => {
        try {
          await this.flushQueue();
        } catch (error) {
          // Error is handled by rejectPendingTasks
        }
        this.debounceTimeout = null;
      }, this.debounceDelay) as any;
    });
  };

  // New: Unzip a zip file to OPFS
  private async unzipToFilesystem(zipBuffer: ArrayBuffer, folderPath: string) {
    const zip = await JSZip.loadAsync(zipBuffer);
    const writePromises: Promise<void>[] = [];

    for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
      if (zipEntry.dir) continue; // Skip directories

      const fileName = relativePath.split("/").pop()!;
      const buffer = await zipEntry.async("arraybuffer");

      // Write to OPFS
      writePromises.push(
        writeRootEQFile(folderPath, fileName, buffer).catch((e) => {
          console.error(`Error writing ${fileName} to OPFS:`, e);
          throw e;
        }),
      );
    }

    await Promise.all(writePromises);
  }

  async getOrFetch(folderPath: string, fileName: string): Promise<ArrayBuffer | null> {
    folderPath = folderPath.toLowerCase();
    fileName = fileName.toLowerCase();
  
    // Check if the file exists in OPFS
    const data = await getRootEQFile(folderPath, fileName);
    if (data) {
      return data;
    }
  
    // Non-zipped file handling
    if (USE_SAGE) {
      return null;
    }
  
    // Check if the path matches a zipped prefix (e.g., eqrequiem/textures)
    const isZippedPrefix = zippedPrefixes.some((prefix) =>
      folderPath.startsWith(prefix),
    );
  
    if (isZippedPrefix) {
      // Extract the subfolder (e.g., qeynos2 from eqrequiem/textures/qeynos2)
      const pathParts = folderPath.split("/");
      const zipFolder = pathParts[pathParts.length - 1]; // e.g., qeynos2
      const zipPath = `${baseUrl}/${pathParts.slice(0, -1).join("/")}/${zipFolder}.zip`;
      const zipKey = zipPath.toLowerCase();
  
      // Check if there's an ongoing unzip operation for this zip
      if (this.unzipPromises.has(zipKey)) {
        await this.unzipPromises.get(zipKey)!;
        // Retry fetching the file from OPFS
        const retryData = await getRootEQFile(folderPath, fileName);
        return retryData || null;
      }
  
      // Check if there's an ongoing fetch for the zip
      if (this.fetchPromises.has(zipKey)) {
        const zipBuffer = await this.fetchPromises.get(zipKey)!;
        if (!zipBuffer) {
          console.error(`Failed to fetch ${zipKey}`);
          return null;
        }
      } else {
        // Create a new fetch and unzip promise
        const fetchPromise = (async () => {
          try {
            const response = await fetch(zipPath, { mode: "cors" });
            if (response.status === 404) {
              console.warn(`Zip file not found: ${zipPath}`);
              return null; // Explicitly handle 404
            }
            if (!response.ok) {
              throw new Error(`HTTP error fetching ${zipPath}: ${response.status}`);
            }
            const buffer = new Uint8Array(await response.arrayBuffer());
            return buffer;
          } catch (e) {
            console.error(`Error fetching zip ${zipPath}:`, e);
            return null;
          } finally {
            this.fetchPromises.delete(zipKey);
          }
        })();
  
        this.fetchPromises.set(zipKey, fetchPromise);
  
        const unzipPromise = (async () => {
          try {
            const zipBuffer = await fetchPromise;
            if (!zipBuffer) {
              throw new Error(`Failed to fetch zip ${zipPath}`);
            }
            await this.unzipToFilesystem(zipBuffer, folderPath);
          } catch (e) {
            console.error(`Error unzipping ${zipPath}:`, e);
            throw e;
          } finally {
            this.unzipPromises.delete(zipKey);
          }
        })();
  
        this.unzipPromises.set(zipKey, unzipPromise);
        await unzipPromise;
      }
  
      // Try to fetch the file from OPFS again
      const finalData = await getRootEQFile(folderPath, fileName);
      return finalData || null;
    }
  
    // Non-zipped file fetch
    let normalizedPath = `${baseUrl}/${folderPath}/${fileName}`
      .replace(/\/+/g, "/")
      .replace(/^https:\/+/, "https://")
      .toLowerCase();
    if (normalizedPath.endsWith("/")) {
      normalizedPath = normalizedPath.slice(0, -1);
    }
    if (normalizedPath.endsWith(".glb")) {
      fileName = fileName.toLowerCase();
      normalizedPath = normalizedPath.replace(".glb", ".glb.gz").toLowerCase();
    }
    if (normalizedPath.endsWith(".babylon")) {
      fileName = fileName.toLowerCase();
      normalizedPath = normalizedPath.replace(".babylon", ".babylon.gz").toLowerCase();
    }
  
    if (this.fetchPromises.has(normalizedPath)) {
      return this.fetchPromises.get(normalizedPath)!;
    }
  
    const fetchPromise = (async () => {
      try {
        const response = await fetch(normalizedPath, { mode: "cors" });
        if (response.status === 404) {
          console.warn(`File not found: ${normalizedPath}`);
          return null; // Explicitly handle 404
        }
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        await writeRootEQFile(folderPath, fileName, buffer);
        return buffer.buffer;
      } catch (e) {
        console.error(`Error fetching file from ${normalizedPath}:`, e);
        return null;
      } finally {
        this.fetchPromises.delete(normalizedPath);
      }
    })();
  
    this.fetchPromises.set(normalizedPath, fetchPromise);
    return fetchPromise;
  }

  getFile = async (
    folderPath: string,
    fileName: string,
  ): Promise<ArrayBuffer | null> => {
    try {
      const path = folderPath.split("/");
      let data = await this.getOrFetch(folderPath, fileName);
      if (!USE_SAGE) {
        return data;
      }
      if (path[0] !== "eqrequiem") {
        data = await this.getOrFetch(folderPath, fileName);
      } else {
        switch (path[1]) {
          case "textures": {
            data = await this.getOrFetch(folderPath, fileName);
            break;
          }
          case "sky": {
            data =
              this.getProcessedResult(fileName) ||
              (await getEQFile(path[1], fileName));
            if (!data && (path[1] === "models" || path[1] === "sky")) {
              const handles = [
                {
                  name: `sky.s3d`,
                  arrayBuffer() {
                    return getEQFile("root", `sky.s3d`);
                  },
                },
              ];
              this.setConverting?.(
                handles.map((h: FileSystemFileHandle) => ({
                  name: h.name,
                })),
              );
              const obj = new EQFileHandle(
                "sky",
                handles,
                this.rootFileSystemHandle,
                {},
                {
                  embedWebP: true,
                  skipSubload: true,
                },
              );
              await obj.initialize();
              await obj.process();
              data = await getEQFile(path[1], fileName);
            }
            break;
          }
          case "objects":
          case "models":
            data =
              this.getProcessedResult(fileName) ||
              (await getEQFile(path[1], fileName));
            if (!data && (path[1] === "models" || path[1] === "objects")) {
              const matches =
                this.models[fileName.replace(".glb", "").toLowerCase()];
              if (matches.length) {
                let didSet = false;
                if (
                  matches.some((m) =>
                    this.models.stringTable[m].includes("global"),
                  )
                ) {
                  didSet = true;
                  window?.setSplash(true);
                }
                const data = await this.enqueueFile(
                  folderPath,
                  matches as number[],
                );
                if (didSet) {
                  window?.setSplash(false);
                }
                return data ? data : null;
              }
            }
            break;
          case "zones": {
            const zoneName = fileName.split(".")[0];
            data = await getEQFile(path[1], fileName);
            if (!data) {
              const handles = [];
              if (await getEQFileExists("root", `${zoneName}.s3d`)) {
                handles.push({
                  name: `${zoneName}.s3d`,
                  arrayBuffer() {
                    return getEQFile("root", `${zoneName}.s3d`);
                  },
                });
              }
              if (await getEQFileExists("root", `${zoneName}.eqg`)) {
                handles.push({
                  name: `${zoneName}.eqg`,
                  arrayBuffer() {
                    return getEQFile("root", `${zoneName}.eqg`);
                  },
                });
              }
              this.setConverting?.(
                handles.map((h: FileSystemFileHandle) => ({
                  name: h.name,
                })),
              );
              const obj = new EQFileHandle(
                zoneName,
                handles,
                this.rootFileSystemHandle,
                {},
                {
                  embedWebP: true,
                  skipSubload: true,
                },
              );
              await obj.initialize();
              await obj.process();
              data = await getEQFile(path[1], fileName);
            }
            break;
          }
          default:
            break;
        }
      }

      return data;
    } catch (e) {
      console.log("Error getting bytes", e);
      return null;
    }
  };
}

export const fsBindings = new FileSystemBindings();