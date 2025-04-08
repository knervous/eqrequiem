import React from "react";
import { State, useUIContext } from "../../context";
import { ActionBarWindowComponent } from "./action-bar-window";

const actionBarWindowSelector = (state: State) => state.ui.actionBarWindows;

export const ActionBarWindowsComponent: React.FC = () => {
  const actionBarWindows = useUIContext(actionBarWindowSelector);

  return actionBarWindows.map((actionBarWindow, index) => (
    <ActionBarWindowComponent
      main={index === 0}
      key={`chat-window-${index}`}
      state={actionBarWindow}
      index={index}
    />
  ));
};
