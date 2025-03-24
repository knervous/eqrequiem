import React, { useEffect, useReducer } from "react";
import Box from "@mui/material/Box";
import { initialUiState } from "../state/initial-state";
import { uiReducer } from "../state/reducer";
import { ChatWindowsComponent } from "./chat/chat-windows";
import { ClientActionHandler, MainInvoker } from "../state/bridge";
import { inEditor } from "../util/constants";


type MessagePayload = object  & {
  detail: string;
}

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
    godotBridge?: IMessageHandler;
    ipc?: IMessageHandler;
  }
}


const stateKey = "uiState";
const storedState = localStorage.getItem(stateKey);

type Props = {
  sx: object
}
export const Overlay: React.FC = (props: Props) => {
  const [uiState, dispatcher] = useReducer(uiReducer, storedState ? JSON.parse(storedState) : initialUiState);
  
  useEffect(() => {
    try {
      localStorage.setItem(stateKey, JSON.stringify(uiState));
    } catch (e) {
      console.error("Failed to save state", e);
    }
  }, [uiState]);

  useEffect(() => {
    const messageHandler: IMessageHandler = window.ipc ?? window.godotBridge!;
    const eventTarget: IMessageTarget = (window.godotBridge ?? document) as IMessageTarget;
    if (!messageHandler) {
      console.error("No handler found");  
      return;
    }
    MainInvoker.current = (action: object) => {
      try {
        // We also forward mouse/keyboard events so we need to differentiate for debug webview handler
        if (inEditor) {
          action = { type: 'data', action }
        }
        messageHandler.postMessage(inEditor ? JSON.stringify(action) : action);
      } catch(e) {
        console.error(e);
      }
    }
    const cb = (message: MessagePayload) => {
      try {
        const data = inEditor ? JSON.parse(message.detail) : message;
        if (ClientActionHandler[data.type as string]) {
          ClientActionHandler[data.type as string](data.payload);
        }
      } catch (e) {
        console.error(e);
      }
    }
    eventTarget.addEventListener("message", cb);
    return () => {
      eventTarget.removeEventListener("message", cb);
    }
  }, []);
  return (
    <Box
      id="requiem-ui"
      sx={{
        width: "100%",
        height: "100%",
        ...props.sx ?? {}
      }}
    >
      <ChatWindowsComponent
        chatWindows={uiState!.chatWindows}
        dispatcher={dispatcher}
      />

    </Box>
  );
};

export default Overlay;
