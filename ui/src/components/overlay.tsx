import React, { useEffect, useReducer } from "react";
import Box from "@mui/material/Box";
import { UiState, initialUiState } from "../state/initial-state";
import { uiReducer } from "../state/reducer";
import { ChatWindowsComponent } from "./chat/chat-windows";
import { ClientActionHandler, MainInvoker } from "../state/bridge";
import { UIContext } from "./context";
import { SxProps } from "@mui/material";
import { ActionBarWindowsComponent } from "./actionbar/action-bar-windows";
import { ImageCache } from "../util/image-cache";
import { TopBarWindowComponent } from "./topbar/topbar-window";
import { CompassWindowComponent } from "./topbar/compass-window";

import { Theme } from "./theme";
import { ActionWindowComponent } from "./actions/actions-window";
import { TargetWindowComponent } from "./target/target-window";
import { PlayerWindowComponent } from "./player/player-window";
import { SpellsWindowComponent } from "./spells/spells-window";

import "./overlay.css";


type MessagePayload = object & {
  type: string;
  payload: object;
};

// Create an interface for our custom message handler.
interface IMessageHandler {
  postMessage(message: object | string): void;
}

interface IMessageTarget {
  addEventListener(
    event: string,
    callback: (message: MessagePayload) => void
  ): void;
  removeEventListener(
    event: string,
    callback: (message: MessagePayload) => void
  ): void;
}

// Extend the Window type to include our handlers.
declare global {
  interface Window {
    godotBridge?: IMessageHandler & IMessageTarget;
    ipc?: IMessageHandler;
  }
}

const stateKey = "uiState";

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

  const [uiState, dispatcher] = useReducer(
    uiReducer,
    storedState as UiState | null ?? initialUiState,
  );
  
  useEffect(() => {
    try {
      localStorage.setItem(stateKey, JSON.stringify({ ...initialUiState, ...uiState }));
    } catch (e) {
      console.error("Failed to save state", e);
    }
  }, [uiState]);
  console.log('Hi render', window.godotBridge);
  useEffect(() => {

    if (!window.godotBridge) {
      console.error("No handler found");
      return;
    }

    MainInvoker.current = (action: object) => {
      try {
        window.godotBridge!.postMessage(action);
      } catch (e) {
        console.error(e);
      }
    };
    const cb = (message: MessagePayload) => {
      try {
        if (typeof message === 'string') {
          message = JSON.parse(message);
        }
        if (ClientActionHandler[message.type as string]) {
          ClientActionHandler[message.type as string](message.payload);
        }
      } catch (e) {
        console.error(e);
      }
    };
    window.godotBridge!.addEventListener("message", cb);
    return () => {
      window.godotBridge!.removeEventListener("message", cb);
    };
  }, []);

  return (
    <UIContext.Provider value={{ getEQFile: props.getEQFile, ui: uiState, dispatcher }}>
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
          <ChatWindowsComponent />
          <ActionBarWindowsComponent />
          <TopBarWindowComponent />
          <CompassWindowComponent />
          <ActionWindowComponent />
          <TargetWindowComponent />
          <PlayerWindowComponent />
          <SpellsWindowComponent />
        </Box>
      </Theme>
    </UIContext.Provider>
  );
};

export default Overlay;
