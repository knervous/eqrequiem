import React, { useEffect, useRef } from "react";
import { Box } from "@mui/material";

import { MainProvider, useMainContext } from "../components/context.tsx";
import { StatusDialog } from "../components/dialogs/status-dialog.tsx";

import styles from './container.module.css';
import UnityPlayer from "./player.tsx";

const bgMax = 1; //6;
const prefix = "electronAPI" in window ? "./" : "/";
const sessionBg = `center no-repeat url('requiem/bg${Math.ceil(
  Math.random() * bgMax,
)}.png')`;


const UnityContainerComponent: React.FC = () => {
  const {
    statusDialogOpen,
    rootFileSystemHandle,
    onDrop,
    requestPermissions,
    permissionStatus,
    onFolderSelected,
  } = useMainContext();
  return (
    <Box className={styles.app}      sx={{
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
      {rootFileSystemHandle && <UnityPlayer />}
    </Box>
  );
};

export const UnityContainer = () => {
  return  <MainProvider>
    <UnityContainerComponent />
  </MainProvider>;
};

export default UnityContainer;
