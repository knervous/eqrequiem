import React, { useEffect, useRef } from "react";
import { Box } from "@mui/material";

import { MainProvider, useMainContext } from "../components/context.tsx";
import { StatusDialog } from "../components/dialogs/status-dialog.tsx";

import GodotPlayer from "./player.tsx";
import { SplashScreen } from "./splash.tsx";

const bgMax = 1; //6;
const prefix = "electronAPI" in window ? "./" : "/";
const sessionBg = `center no-repeat url('requiem/bg${Math.ceil(
  Math.random() * bgMax
)}.png')`;


const GodotContainerComponent: React.FC = () => {
  const {
    statusDialogOpen,
    rootFileSystemHandle,
    onDrop,
    requestPermissions,
    permissionStatus,
    onFolderSelected,
    ready,
    splash,
    converting
  } = useMainContext();
  return (
    <Box      sx={{
        background: sessionBg,
        backgroundSize: "cover",
      }}>
        {splash && <SplashScreen files={converting} />}
      {statusDialogOpen && (
        <StatusDialog
          fsHandle={rootFileSystemHandle}
          onDrop={onDrop}
          permissionStatus={permissionStatus}
          open={true}
          requestPermissions={requestPermissions}
          onFolderSelected={onFolderSelected}
        />
      )}
      {ready ? <GodotPlayer /> : <h1 style={{width: '100vw', height: '100vh'}}>LOADING, PLEASE WAIT... (Sorry this looks ugly for now)</h1>}
    </Box>
  );
};

export const GodotContainer = () => {
 return  <MainProvider>
    <GodotContainerComponent />
  </MainProvider>;
};

export default GodotContainer;
