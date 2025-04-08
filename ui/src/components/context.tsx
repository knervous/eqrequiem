import React from "react";
import { Context, createContext, useContextSelector } from "use-context-selector";
import { UiState } from "../state/initial-state";
import { UiAction } from "../state/reducer";

export type State = {
  ui: UiState;
  mode: string;
  setMode: React.Dispatch<React.SetStateAction<string>>;
  setSplash: React.Dispatch<React.SetStateAction<boolean>>;
  token: React.RefObject<string | null>;
  dispatcher: React.ActionDispatch<[Action: UiAction]>;
  getEQFile(path: string, file: string): Promise<ArrayBuffer | null>;
};

export const UIContext = createContext<State | undefined>(undefined);
export const useUIContext = <T,>(selector: (state: State) => T): T => {
  const actualSelector = selector ?? ((state: State) => state as unknown as T);
  return useContextSelector(UIContext as Context<State>, actualSelector);
};

export const useDispatch = () =>
  useUIContext((state: State) => state.dispatcher);
export const useGetEQFile = () =>
  useUIContext((state: State) => state.getEQFile);
