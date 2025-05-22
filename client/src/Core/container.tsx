import React from "react";
import { Box } from "@mui/material";

import { MainProvider, useMainContext } from "../components/context.tsx";
import { StatusDialog } from "../components/dialogs/status-dialog.tsx";

import BabylonWrapper from "./babylon.tsx";
import { SplashScreen } from "./splash.tsx";
import { USE_SAGE } from "@game/Constants/constants.ts";

const bgMax = 1; //6;
const sessionBg = `center no-repeat url('requiem/bg${Math.ceil(
  Math.random() * bgMax,
)}.png')`;

const GameContainerComponent: React.FC = () => {
  const {
    statusDialogOpen,
    rootFileSystemHandle,
    onDrop,
    requestPermissions,
    permissionStatus,
    onFolderSelected,
    ready,
    splash,
    converting,
  } = useMainContext();
  return (
    <Box      sx={{
      background: sessionBg,
      backgroundSize: "cover",
    }}>
      {(splash || !ready) && <SplashScreen files={converting} />}
      {statusDialogOpen && USE_SAGE && (
        <StatusDialog
          fsHandle={rootFileSystemHandle}
          onDrop={onDrop}
          permissionStatus={permissionStatus}
          open={true}
          requestPermissions={requestPermissions}
          onFolderSelected={onFolderSelected}
        />
      )}
      {ready ? <BabylonWrapper splash={splash} /> : null}
    </Box>
  );
};

export const GameContainer = () => {
  return  <MainProvider>
    <GameContainerComponent />
  </MainProvider>;
};

export default GameContainer;
