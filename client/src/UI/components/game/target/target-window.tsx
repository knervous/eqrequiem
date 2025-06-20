import React, { useEffect } from "react";
import { Box, Typography } from "@mui/material";

import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";
import { UiBarComponent } from "../../../common/ui-bar";
import Player from "@game/Player/player";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import { useTarget } from "@game/Events/event-hooks";


export const TargetWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.targetWindow);
  const doClose = () => { };
  const target = useTarget();
  const name = target?.spawn?.name ?? '';
  return (
    <UiWindowComponent
      state={{ ...state, fixed: true, fixedWidth: 150, fixedHeight: 80 }}
      windowName="targetWindow"
      closable
      doClose={doClose}
    >
      <Typography sx={{ textAlign: 'center' }}>Target</Typography>
      <Typography sx={{ textAlign: 'center', minHeight: '20px' }}>{name?.replace('_', ' ')}</Typography>
      <Box sx={{ padding: " 10px 20px", textAlign: 'center', overflow: "hidden" }}>
        <UiBarComponent />
      </Box>
    </UiWindowComponent>
  );
};
