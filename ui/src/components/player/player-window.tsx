// src/components/ChatWindowComponent.tsx
import React, { useEffect, useMemo, useCallback } from "react";
import { Box, Stack, Typography } from "@mui/material";

import { UiWindowComponent } from "../../common/ui-window";
import { useUIContext } from "../context";
import { UiBarComponent } from "../../common/ui-bar";


export const PlayerWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.playerWindow);
  const doClose = () => {};
 
  return (
    <UiWindowComponent
      state={{ ...state, fixed: true, fixedWidth: 150, fixedHeight: 200 }}
      //title="Target"
      windowName="playerWindow"
      closable
      doClose={doClose}
    >
      <Typography sx={{ textAlign: 'center' }}>Soandso</Typography>
      <Stack direction="column" sx={{ width: '100%', padding: "10px 20px", textAlign: 'center', overflow: "hidden", alignContent: 'center'  }}>
    
        <br/>
        <UiBarComponent />
        <br />
        <UiBarComponent />
        <br />
        <UiBarComponent />
      </Stack>
    </UiWindowComponent>
  );
};
