import React, { useEffect } from "react";
import { Box, Typography } from "@mui/material";

import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";
import { UiBarComponent } from "../../../common/ui-bar";
import Player from "@game/Player/player";
import { Spawn } from "@game/Net/internal/api/capnp/common";


export const TargetWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.targetWindow);
  const doClose = () => { };
  const [name, setName] = React.useState<string>('');
  useEffect(() => {
    if (!Player.instance) {
      console.log('No instance!');
      return;
     
    }
    const observer = (target: Spawn | undefined) => {
      setName(target?.name ?? '');

    };
    Player.instance.addObserver('target', observer);

    return () => {
      if (!Player.instance) {
        return;
      }

      Player.instance.removeObserver('target', observer);
    };
  }, []);
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
