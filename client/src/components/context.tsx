import React, { useCallback, useEffect, useState } from "react";
import {
  PermissionStatusTypes,
  usePermissions,
} from "sage-core/hooks/permissions";
import { godotBindings } from "../godot/bindings";
import { USE_SAGE } from "@game/Constants/constants";

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
  ] = USE_SAGE ? usePermissions() : [];
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
    let fsHandle;
    if (import.meta.env.VITE_USE_SAGE === "true") {
      if (permissionStatus !== PermissionStatusTypes.Ready) {
        return;
      }
      fsHandle = rootFileSystemHandle;
    } 
    (async () => {
      if (!fsHandle) {
        fsHandle = await navigator.storage.getDirectory();
      }
      if (!fsHandle) {
        console.error("No file system handle");
        alert('No file system available, please use a compatible browser');
        return;
      }
      await godotBindings.initialize({
        rootFileSystemHandle: fsHandle,
        setLoading,
        setLoadingText,
        setLoadingTitle,
        setSplash,
        setConverting,
      });
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
