import React, { useEffect, useState } from "react";
import { ChatWindow } from "../../state/initial-state";
import { UiAction } from "../../state/reducer";
import { ChatWindowComponent } from "./chat-window";
import { ClientActionHandler } from "../../state/bridge";

type Props = {
  chatWindows: ChatWindow[];
  dispatcher: React.ActionDispatch<[action: UiAction]>;
};
export const ChatWindowsComponent: React.FC<Props> = (props: Props) => {
  const { chatWindows, dispatcher } = props;
  const [messageMap, setMessageMap] = useState<Array<string[]>>([]);
  useEffect(() => {
    ClientActionHandler["chat"] = (msg: { type: number, line: string }) => {
      // Will be filtering logic based on type later
      const windowIdx = chatWindows.findIndex(Boolean);
      if (windowIdx === -1) {
        return;
      }
      console.log('mesg', msg)
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
