import React, { useEffect, useMemo, useReducer, useRef } from "react";
import Box from "@mui/material/Box";
import { UiState, initialUiState } from "../state/initial-state";
import { uiReducer } from "../state/reducer";
import { ClientActionHandler, MainInvoker } from "../state/bridge";
import { UIContext } from "./context";
import { SxProps } from "@mui/material";
import { ImageCache } from "../util/image-cache";
import { Theme } from "./theme";
import { MessagePayload, stateKey } from "./overlay-types";

import "./overlay.css";
import { LoginUIComponent } from "./login";
import { GameUIComponent } from "./game";
import { CharacterSelectUIComponent } from "./character-select";
import { StringTable } from "../util/string-table";

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
  getEQFile(folder: string, file: string): Promise<ArrayBuffer | null>;
};

export const Overlay: React.FC<Props> = (props: Props) => {
  ImageCache.getEQFile = props.getEQFile;
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
    StringTable.initialize(props.getEQFile);
    const clientCallback = (message: MessagePayload) => {
      try {
        if (typeof message === "string") {
          message = JSON.parse(message);
        }
        if (message.type === 'camp') {
          setMode('character-select');
          return;
        }
        if (ClientActionHandler[message.type as string]) {
          ClientActionHandler[message.type as string](message.payload);
        }
      } catch (e) {
        console.error(e);
      }
    };

    window.onGodotBridgeRegistered = () => {
      window.godotBridge!.addEventListener("message", clientCallback);
    };
    /**
     *
     * This is what the UI layer can call globally to send messages to Godot
     */
    console.log("Setting current");
    MainInvoker.current = (action: object) => {
      try {
        window.godotBridge!.postMessage(action);
        console.log("Invoking godot bridge", action);
      } catch (e) {
        console.log("Error in main invoker", e);
        console.error(e);
      }
    };
    /**
     *
     * This is when Godot client sends us a message to the UI layer
     */

    return () => {
      window.godotBridge?.removeEventListener("message", clientCallback);
    };
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
        getEQFile: props.getEQFile,
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
