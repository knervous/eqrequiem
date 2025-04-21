import React, { useEffect, useMemo, useReducer, useRef } from "react";
import Box from "@mui/material/Box";
import { UiState, initialUiState } from "../state/initial-state";
import { uiReducer } from "../state/reducer";
import { UIContext } from "./context";
import { SxProps } from "@mui/material";
import { ImageCache } from "../util/image-cache";
import { Theme } from "./theme";
import {  stateKey } from "./overlay-types";
import { LoginUIComponent } from "./login";
import { GameUIComponent } from "./game";
import { CharacterSelectUIComponent } from "./character-select";
import { StringTable } from "../util/string-table";

import "./overlay.css";
import { godotBindings } from "@/godot/bindings";

let storedState: UiState | string | null = localStorage.getItem(stateKey);
if (storedState) {
  try {
    storedState = JSON.parse(storedState);
    storedState = { ...initialUiState, ...(storedState as object)! };
  } catch (e) {
    console.error("Failed to parse stored state", e);
    storedState = null;
  }
}
type Props = {
  sx?: SxProps;
};

export const Overlay: React.FC<Props> = (props: Props) => {
  const [mode, setMode] = React.useState<string>("login");
  const token = useRef<string | null>("");
  const [uiState, dispatcher] = useReducer(
    uiReducer,
    (storedState as UiState | null) ?? initialUiState,
  );


  useEffect(() => {
    try {
      localStorage.setItem(
        stateKey,
        JSON.stringify({ ...initialUiState, ...uiState }),
      );
    } catch (e) {
      console.error("Failed to save state", e);
    }
  }, [uiState]);

  useEffect(() => {
    StringTable.initialize();
  }, []);

  const component = useMemo(() => {
    switch (mode) {
      case "character-select":
        return <CharacterSelectUIComponent />;
      case "game":
        return <GameUIComponent />;
      default:
      case "login":
        return <LoginUIComponent />;
    }
  }, [mode]);
  return (
    <UIContext.Provider
      value={{
        getEQFile: godotBindings.getFile,
        ui: uiState,
        dispatcher,
        mode,
        setMode,
        token,
      }}
    >
      <Theme>
        <Box
          className="requiem-ui"
          id="requiem-ui"
          sx={{
            width: "100%",
            height: "100%",
            ...(props.sx ?? {}),
          }}
        >
          {component}
        </Box>
      </Theme>
    </UIContext.Provider>
  );
};

export default Overlay;
