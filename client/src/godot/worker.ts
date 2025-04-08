import * as Comlink from "comlink";
import { EQFileHandle } from "sage-core/model/file-handle";
import { setGlobals } from "sage-core/globals";

if (typeof window === "undefined") {
  self.window = self;
}

const process = async (
  name: string,
  rootFileHandle: FileSystemDirectoryHandle,
  ...handles: FileSystemFileHandle[]
) => {
  self.gameController = {
    rootFileSystemHandle: rootFileHandle,
  };
  setGlobals({
    gameController: self.gameController,
    GlobalStore: {
      actions: {
        setLoading: () => {},
        setLoadingText: () => {},
        setLoadingTitle: () => {},
      },
    },
    root: "eqrequiem",
  });
  const fileHandles = await Promise.all(
    handles.map((handle) => handle.getFile()),
  );
  let data = {} as Record<string, ArrayBuffer>;
  const obj = new EQFileHandle(
    name,
    fileHandles,
    rootFileHandle,
    {
      forceReload: true,
    },
    {
      rawImageWrite: true,
      skipSubload: true,
      deferWrite: true,
    },
  );
  try {
    await obj.initialize();
    data = await obj.process();
  } catch (e) {
    console.log("Error processing EQFileHandle", e);
  }
  return Object.entries(data).reduce((acc, [key, value]: [string, ArrayBuffer]) => {
    return {
      ...acc,
      [key]: Comlink.transfer(value, [value]),
    };
  }, {});
};

Comlink.expose({
  process,
});
