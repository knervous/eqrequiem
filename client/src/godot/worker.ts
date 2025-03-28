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
  console.log("Did call process", name);
  const fileHandles = await Promise.all(
    handles.map((handle) => handle.getFile()),
  );
  console.log("Process", rootFileHandle, handles);
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
    },
  );
  try {
    await obj.initialize();
    await obj.process();
  } catch (e) {
    console.log("Error processing EQFileHandle", e);
  }
};

Comlink.expose({
  process,
});
