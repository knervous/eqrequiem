import React, { useEffect, useMemo, useReducer, useRef } from "react";
import Box from "@mui/material/Box";
import { UiState, initialUiState } from "../state/initial-state";
import { uiReducer } from "../state/reducer";
import { UIContext } from "./context";
import { SxProps } from "@mui/material";
import { Theme } from "./theme";
import {  stateKey } from "./overlay-types";
import { LoginUIComponent } from "./login";
import { GameUIComponent } from "./game";
import { CharacterSelectUIComponent } from "./character-select";
import { StringTable } from "../util/string-table";
import { godotBindings } from "@/godot/bindings";
import { UIEvents } from "@ui/events/ui-events";

import "./overlay.css";


let storedState: UiState | string | null = localStorage.getItem(stateKey);
if (storedState) {
  try {
    storedState = JSON.parse(storedState);
    storedState = { ...initialUiState, ...(storedState as object)! };
  } catch (e) {
    console.error("Failed to parse stored state", e);
    storedState = null;
  }

  storedState = initialUiState;
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
    if (mode === 'game') {
      UIEvents.emit("chat", { type: 0, line: 'Welcome to EQ Requiem!', color: '#ddd' });
      UIEvents.emit("chat", { type: 0, line: 'This is currently a demo sandbox with development features.', color: '#ddd' });
      UIEvents.emit("chat", { type: 0, line: 'Type /help to get started.', color: '#ddd' });
    }

  }, [mode]);

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
