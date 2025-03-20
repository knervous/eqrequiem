import { Dispatch } from "react";
import { setGlobals } from "sage-core/globals";
import { EQFileHandle } from "sage-core/model/file-handle";
import {
  getEQFile,
  getEQFileExists,
  getRootFiles,
} from "sage-core/util/fileHandler";

type Models = {
  [key: string]: number[] | string[];
};

type Options = {
  rootFileSystemHandle: FileSystemHandle;
  setLoading: Dispatch<React.SetStateAction<boolean>>;
  setLoadingText: Dispatch<React.SetStateAction<string>>;
  setLoadingTitle: Dispatch<React.SetStateAction<string>>;
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
      (candidateArray) => !candidateArray.includes(bestCandidate)
    );
  }

  return Array.from(selected);
}

class GodotBindings {
  models: Models = {};
  rootFileSystemHandle: FileSystemHandle | null = null;
  queue: number[] = [];
  candidates: number[][] = [];
  async initialize(options: Options) {
    const {
      rootFileSystemHandle,
      setLoading,
      setLoadingText,
      setLoadingTitle,
    } = options;
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
    /**
     * Globals
     */
    setGlobals({ gameController, GlobalStore, root: "eqrequiem" });
    this.models = await fetch("/models.json").then((r) => r.json());
  }
  queueRunning = false;
  queuePromise: Promise<void> | null = null;

  flushQueue = async () => {
    await this.queuePromise;
    let resolver: (value: void) => void = () => {};
    this.queuePromise = new Promise((res) => {
      resolver = () => {
        this.candidates = [];
        res();
      };
    });
    this.queue = selectMinimalFiles(this.candidates);
    const minimalFiles = this.queue
      .map((fileId) => this.models.stringTable[fileId])
      .filter(Boolean) as string[];

    if (!minimalFiles.length) {
      console.log("No minimal files to load", this.candidates);
      resolver();
      return;
    }
    const handles = await Promise.all(
      await (
        await getRootFiles((name: string) => minimalFiles.includes(name))
      ).map((f: FileSystemFileHandle) => f.getFile())
    );

    const obj = new EQFileHandle(
      minimalFiles[0].replace(".s3d", "").replace(".eqg", ""),
      handles,
      this.rootFileSystemHandle,
      {
        forceReload: true,
      },
      {
        rawImageWrite: true,
        skipSubload: true,
      }
    );
    await obj.initialize();
    await obj.process();

    resolver();
  };

  enqueueFile = (candidates: number[]) => {
    candidates = candidates.filter(i => {
      // NO LUCLIN MODELS ALLOWED
      if (/global[a-z]+_/.test(this.models.stringTable[i] as string)) {
        return false;
      }

      return true;
    });
    this.candidates.push(candidates);
    return new Promise((res) => {
      const exec = () => {
        setTimeout(() => {
          this.flushQueue();
          res(this.queuePromise);
        }, 200);
      };

      if (this.queuePromise) {
        if (this.queue.some((q) => candidates.includes(q))) {
          this.queuePromise.then(res);
        } else {
          this.queuePromise.then(() => {
            exec();
          });
        }
      } else {
        exec();
      }
    });
  };

  getJsBytes = async (
    inputString: string,
    isRetry = false
  ): Promise<ArrayBuffer> => {
    console.log("Asking for bytes for", inputString);
    const path = inputString.split("/");
    let data = null;
    switch (path[0]) {
      case "eqrequiem":
        switch (path[1]) {
          case "objects":
          case "textures":
          case "models":
          case "sky":
            data = await getEQFile(path[1], path[2]);

            if (!data && (path[1] === "models") || path[1] === "objects") {
              if (isRetry) {
                console.log("Failed to load after retry", path[2]);
              } else {
                const matches = this.models[path[2].replace(".glb", "")];
                if (matches.length) {
                  await this.enqueueFile(matches as number[]);
                  return this.getJsBytes(inputString, true);
                }
              }
            }

            break;
          case "zones": {
            const zoneName = path[2].split(".")[0];
            data = await getEQFile(path[1], path[2]);
            if (!data) {
              const handles = [];
              if (await getEQFileExists("root", `${zoneName}.s3d`)) {
                {
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

                const obj = new EQFileHandle(
                  zoneName,
                  handles,
                  this.rootFileSystemHandle,
                  {},
                  {
                    rawImageWrite: true,
                    skipSubload: true,
                  }
                );
                await obj.initialize();
                await obj.process();
                data = await getEQFile(path[1], path[2]);
              }
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
  };
}

export const godotBindings = new GodotBindings();
