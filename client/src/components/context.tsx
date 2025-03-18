import React, { useEffect, useState } from "react";
import {
  PermissionStatusTypes,
  usePermissions,
} from "sage-core/hooks/permissions";
import { setGlobals } from "sage-core/globals";
import {
  getEQFile,
  getFilesRecursively,
  getEQFileExists,
} from "sage-core/util/fileHandler";
import { EQFileHandle } from "sage-core/model/file-handle";

const MainContext = React.createContext({});

export const useMainContext = () => React.useContext(MainContext);

type ReactProps = {
  children: React.ReactNode;
};

export const MainProvider = (props: ReactProps) => {
  const [
    permissionStatus,
    onDrop,
    requestPermissions,
    rootFileSystemHandle,
    onFolderSelected,
  ] = usePermissions();
  const [ready, setReady] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);

  useEffect(() => {
    setStatusDialogOpen(permissionStatus !== PermissionStatusTypes.Ready);
  }, [permissionStatus]);

  useEffect(() => {
    if (permissionStatus !== PermissionStatusTypes.Ready) {
      return;
    }

    (async () => {
      const gameController = {
        rootFileSystemHandle,
      };
      window.gameController = gameController;
      const GlobalStore = {
        actions: {
          setLoading: () => {},
          setLoadingText: () => {},
          setLoadingTitle: () => {},
        },
      };

      /**
       * Globals
       */
      setGlobals({ gameController, GlobalStore, root: "eqrequiem" });

      /**
       * 
       * Window functions 
       */
      window.getJsBytes = async (inputString: string) => {
        console.log("Asking for bytes for", inputString);
        const path = inputString.split("/");
        let data = null;
        switch (path[0]) {
          case "eqrequiem":
            switch (path[1]) {
              case "objects":
              case "textures":
                case "sky":
                data = await getEQFile(path[1], path[2]);
                break;
              case "zones":
                const zoneName = path[2].split(".")[0];
                data = await getEQFile(path[1], path[2]);
                if (!data) {
                  const handles = [];
                  try {
                    for await (const fileHandle of getFilesRecursively(
                      rootFileSystemHandle,
                      "",
                      new RegExp(`^${zoneName}[_\\.].*`)
                    )) {
                      handles.push(await fileHandle.getFile());
                    }
                  } catch (e) {
                    console.warn("Error", e, handles);
                  }

                  const obj = new EQFileHandle(
                    zoneName,
                    handles,
                    rootFileSystemHandle,
                    {},
                    {
                      rawImageWrite: true,
                    }
                  );
                  await obj.initialize();
                  await obj.process();
                  data = await getEQFile(path[1], path[2]);
                }
                break;
              default:
                break;
            }
            break;
          default:
            break;
        }
        return data;
      };
      if (!(await getEQFileExists("sky", "sky1.glb"))) {
        const fh = await rootFileSystemHandle.getFileHandle("sky.s3d")?.then(f => f.getFile());

        const obj = new EQFileHandle(
          "sky",
          [fh],
          rootFileSystemHandle,
          {},
          {
            rawImageWrite: true,
          }
        );
        await obj.initialize();
        await obj.process();
      }
      setReady(true);
    })();
  }, [rootFileSystemHandle, permissionStatus]);

  return (
    <MainContext.Provider
      value={{
        statusDialogOpen,
        setStatusDialogOpen,
        rootFileSystemHandle,
        onDrop,
        requestPermissions,
        permissionStatus,
        onFolderSelected,
        ready
      }}
    >
      {props.children}
    </MainContext.Provider>
  );
};
