import React, { useEffect, useRef } from "react";
import { Box } from "@mui/material";

import { MainProvider, useMainContext } from "../components/context.tsx";
import { StatusDialog } from "../components/dialogs/status-dialog.tsx";

import GodotPlayer from "./player.tsx";

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
  } = useMainContext();
  return (
    <Box      sx={{
        background: sessionBg,
        backgroundSize: "cover",
      }}>
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
      {rootFileSystemHandle && <GodotPlayer />}
    </Box>
  );
};

export const GodotContainer = () => {
 return  <MainProvider>
    <GodotContainerComponent />
  </MainProvider>;
};

export default GodotContainer;
