// src/components/ChatWindowComponent.tsx
import React from "react";
import { Box } from "@mui/material";

import { UiWindowComponent } from "../../../common/ui-window";
import { useUIContext } from "../../context";


export const SpellsWindowComponent: React.FC = () => {
  const state = useUIContext((state) => state.ui.spellsWindow);
  const doClose = () => { };

  return (
    <UiWindowComponent
      state={state}
      //title="Target"
      windowName="spellsWindow"
      closable
      doClose={doClose}
    >

      <Box sx={{ padding: " 10px 20px", textAlign: 'center', overflow: "hidden" }}>
        Spells
      </Box>
    </UiWindowComponent>
  );
};
