import React, { useEffect, useState } from "react";
import { ChatWindowComponent } from "./chat-window";
import { State, useDispatch, useUIContext } from "../../context";
import { UIEvents } from "@ui/events/ui-events";

const chatWindowSelector = (state: State) => state.ui.chatWindows;

export const ChatWindowsComponent: React.FC = () => {
  const chatWindows = useUIContext(chatWindowSelector);
  const dispatcher = useDispatch();
  const [messageMap, setMessageMap] = useState<Array<string[]>>([]);
  useEffect(() => {
    UIEvents.on("chat", (msg: { type: number, line: string }) => {
      const windowIdx = chatWindows.findIndex(Boolean);
      if (windowIdx === -1) {
        return;
      }
      setMessageMap((prev) => {
        const newMap = [...prev];
        newMap[windowIdx] = [...(newMap[windowIdx] || []), msg.line];
        return newMap;
      });
    });
    return () => {
      UIEvents.off("chat");
    };
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
