import React, { useEffect, useState } from "react";
import { ChatWindowComponent } from "./chat-window";
import { ClientActionHandler } from "../../state/bridge";
import { State, useDispatch, useUIContext } from "../context";

const chatWindowSelector = (state: State) => state.ui.chatWindows;

export const ChatWindowsComponent: React.FC = () => {
  const chatWindows = useUIContext(chatWindowSelector);
  const dispatcher = useDispatch();
  const [messageMap, setMessageMap] = useState<Array<string[]>>([]);
  useEffect(() => {
    ClientActionHandler["chat"] = (msg: { type: number, line: string }) => {
      // Will be filtering logic based on type later
      const windowIdx = chatWindows.findIndex(Boolean);
      if (windowIdx === -1) {
        return;
      }
      setMessageMap((prev) => {
        const newMap = [...prev];
        newMap[windowIdx] = [...(newMap[windowIdx] || []), msg.line];
        return newMap;
      });
    }
  }, [chatWindows]);
  return chatWindows.map((chatWindow, index) => (
    <ChatWindowComponent
      main={index === 0}
      key={`chat-window-${index}`}
      state={chatWindow}
      messages={messageMap[index] || []}
      dispatcher={dispatcher}
      index={index}
    />
  ));
};
