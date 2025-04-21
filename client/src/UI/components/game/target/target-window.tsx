import React from "react";
import { Box, Typography } from "@mui/material";

import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";
import { UiBarComponent } from "../../../common/ui-bar";


export const TargetWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.targetWindow);
  const doClose = () => { };

  return (
    <UiWindowComponent
      state={{ ...state, fixed: true, fixedWidth: 150, fixedHeight: 80 }}
      windowName="targetWindow"
      closable
      doClose={doClose}
    >
      <Typography sx={{ textAlign: 'center' }}>Target</Typography>
      <Box sx={{ padding: " 10px 20px", textAlign: 'center', overflow: "hidden" }}>
        <UiBarComponent />
      </Box>
    </UiWindowComponent>
  );
};
