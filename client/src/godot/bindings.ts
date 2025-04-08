import { Dispatch } from "react";
import { setGlobals } from "sage-core/globals";
import { EQFileHandle } from "sage-core/model/file-handle";
import { PFSArchive } from "sage-core/pfs/pfs";
import {
  getEQFile,
  getEQFileExists,
  getRootFiles,
} from "sage-core/util/fileHandler";
import * as Comlink from "comlink";

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

class GodotBindings {
  private debounceTimeout: number | null = null;
  private debounceDelay = 200;
  private pendingTasks: Map<string, {
    candidates: number[];
    promises: { resolve: (value: any) => void; reject: (reason?: any) => void }[];
  }> = new Map();
  private processedResults: Map<string, CacheEntry> = new Map(); // Cache for processed data
  private models: Models = {};
  private rootFileSystemHandle: FileSystemHandle | null = null;
  private queue: number[] = [];
  private candidates: number[][] = [];
  private wrappedWorker: Comlink.Remote<unknown> | null = null;
  private setConverting: Dispatch<React.SetStateAction<{ name: string }[]>> | null =
    null;

  private updateProcessedResults = (data: {[key: string]: ArrayBuffer}) => {
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
    window.getJsBytes = this.getJsBytes;
    window.setSplash = setSplash;
    /**
     * Globals
     */
    setGlobals({ gameController, GlobalStore, root: "eqrequiem" });
    this.models = await fetch("/models.json").then((r) => r.json());
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const wrappedWorker = Comlink.wrap(worker);
    this.wrappedWorker = wrappedWorker;
    setInterval(() => {
      this.cleanUpProcessedResults();
    }, 60000);
  }
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
    if (this.queue.includes(this.models.stringTable.indexOf('global_chr.s3d'))) {
      console.log("Adding global3_chr to queue");
      minimalFiles.push('global3_chr.s3d');
      minimalFiles.push('global4_chr.s3d');
    }
    const handles = await Promise.all(
      await getRootFiles((name: string) => minimalFiles.includes(name)),
    );
    const handleNames = handles.map((h: FileSystemFileHandle) => ({
      name: h.name,
    }));
    
    this.setConverting?.(handleNames);
    console.log("--- Processing Handles ---", handleNames);

    try {
      const data = await this.wrappedWorker?.process(
        minimalFiles[0].replace(".s3d", "").replace(".eqg", ""),
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
      const pathParts = path.split('/');
      const fileName = pathParts[pathParts.length - 1];
      if (this.processedResults.has(fileName)) {
        const data = this.getProcessedResult(fileName);
        task.promises.forEach(({ resolve }) => resolve(data));
        this.pendingTasks.delete(path);
      }
      // If no data matches, task remains pending
    }
  };

  private rejectPendingTasks = (reason: any) => {
    for (const [, task] of this.pendingTasks) {
      task.promises.forEach(({ reject }) => reject(reason));
    }
    this.pendingTasks.clear();
  };

  enqueueFile = (path: string, candidates: number[]) => {
    // Filter candidates
    candidates = candidates.filter((i) => {
      if (/global[a-z]+_/.test(this.models.stringTable[i] as string)) {
        return false;
      }
      return true;
    });

    if (!candidates.length) {
      return Promise.resolve(null);
    }

    // Check if we already have the result
    const pathParts = path.split('/');
    const fileName = pathParts[pathParts.length - 1];
    if (this.processedResults.has(fileName)) {
      return Promise.resolve(this.getProcessedResult(fileName));
    }

    this.candidates.push(candidates);

    return new Promise((resolve, reject) => {
      // Add to existing task or create new one based on path
      if (this.pendingTasks.has(path)) {
        this.pendingTasks.get(path)!.promises.push({ resolve, reject });
      } else {
        this.pendingTasks.set(path, {
          candidates,
          promises: [{ resolve, reject }],
        });
      }

      // Clear existing timeout
      if (this.debounceTimeout !== null) {
        clearTimeout(this.debounceTimeout);
      }

      // Set new debounced execution
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

  private pfsArchives: { [key: string]: PFSArchive } = {};
  private pfsArchivePromises: { [key: string]: Promise<void> } = {};

  getJsBytes = async (
    inputString: string,
    innerFile: string,
  ): Promise<ArrayBuffer | null> => {
    try {
      if (!inputString) {
        console.log("No input string");
        return null;
      }
      const path = inputString.split("/");
      let data = null;
      if (inputString.endsWith(".s3d") || inputString.endsWith(".eqg")) {
        if (!this.pfsArchives[inputString]) {
          this.pfsArchives[inputString] = new PFSArchive();
          this.pfsArchivePromises[inputString] = new Promise(async (res) => {
            this.pfsArchives[inputString].openFromFile(
              await getEQFile("root", inputString),
            );
            res();
          });
        }
        await this.pfsArchivePromises[inputString];
        for (const [key] of this.pfsArchives[inputString].files.entries()) {
          if (key.split(".")[0].toLowerCase() === innerFile.toLowerCase()) {
            return this.pfsArchives[inputString].getFile(key);
          }
        }
      }
      switch (path[0]) {
        case "eqrequiem":
          switch (path[1]) {
            case "objects":
            case "textures":
            case "models":
            case "sky":
              data = this.getProcessedResult(path[2]) || await getEQFile(path[1], path[2]);
              if (!data && (path[1] === "models" || path[1] === "objects")) {
                const matches = this.models[path[2].replace(".glb", "")];
                if (matches.length) {
                  let didSet = false;
                  if (matches.some((m) => this.models.stringTable[m].includes('global'))) {
                    didSet = true;
                    window?.setSplash(true);
                  }
                  const data = await this.enqueueFile(inputString, matches as number[]);
                  if (didSet) {
                    window?.setSplash(false);
                  }
                  return data ? data : null;
                }
              }
              break;
            case "zones": {
              const zoneName = path[2].split(".")[0];
              data = await getEQFile(path[1], path[2]);
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
                    rawImageWrite: true,
                    skipSubload: true,
                  },
                );
                await obj.initialize();
                await obj.process();
                data = await getEQFile(path[1], path[2]);
              }
              break;
            }
            default:
              break;
          }
          break;
        default:
          break;
      }
      return data;
    } catch (e) {
      console.log("Error getting bytes", e);
      return null;
    }
  };
}

export const godotBindings = new GodotBindings();
