import React, { useCallback, useEffect, useState } from "react";
import {
  PermissionStatusTypes,
  usePermissions,
} from "sage-core/hooks/permissions";
import {
  getEQFileExists,
} from "sage-core/util/fileHandler";
import { EQFileHandle } from "sage-core/model/file-handle";
import { godotBindings } from "../godot/bindings";

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

  const [_loading, setLoading] = useState(false);
  const [_loadingText, setLoadingText] = useState("");
  const [_loadingTitle, setLoadingTitle] = useState("");
  const [splash, setSplashValue] = useState(false);
  const [splashCounter, setSplashCounter] = useState(0);
  const [converting, setConverting] = useState<string[]>([]);
  useEffect(() => {
    setStatusDialogOpen(permissionStatus !== PermissionStatusTypes.Ready);
  }, [permissionStatus]);

  const setSplash = useCallback((val: boolean) => {
    if (val) {
      setSplashCounter((prev) => prev + 1);
    } else {
      setSplashCounter((prev) => Math.max(0, prev - 1));
    }
    setSplashValue(val);
  }, []);

  useEffect(() => {
    if (permissionStatus !== PermissionStatusTypes.Ready) {
      return;
    }
    (async () => {
      await godotBindings.initialize({
        rootFileSystemHandle,
        setLoading,
        setLoadingText,
        setLoadingTitle,
        setSplash,
        setConverting,
      });
      // Going to split these out into dependencies and services in a class
      if (!(await getEQFileExists("sky", "sky1.glb"))) {
        const fh = await rootFileSystemHandle
          .getFileHandle("sky.s3d")
          ?.then((f: FileSystemFileHandle) => f.getFile());

        const obj = new EQFileHandle(
          "sky",
          [fh],
          rootFileSystemHandle,
          {},
          {
            rawImageWrite: true,
          },
        );
        await obj.initialize();
        await obj.process();
      }
      setReady(true);
    })();
  }, [rootFileSystemHandle, permissionStatus, setSplash, setConverting]);
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
        ready,
        splash: splashCounter > 0,
        setSplash,
        converting, setConverting,
      }}
    >
      {props.children}
    </MainContext.Provider>
  );
};
