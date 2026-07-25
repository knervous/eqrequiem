import React from 'react';
import { Context } from 'use-context-selector';
import { UiState } from '../state/initial-state';
import { UiAction } from '../state/reducer';
export type State = {
    ui: UiState;
    mode: string;
    setMode: React.Dispatch<React.SetStateAction<string>>;
    setSplash: React.Dispatch<React.SetStateAction<boolean>>;
    token: React.RefObject<string | null>;
    dispatcher: React.ActionDispatch<[Action: UiAction]>;
    getEQFile(path: string, file: string): Promise<ArrayBuffer | null>;
};
export declare const UIContext: Context<State | undefined>;
export declare const useUIContext: <T>(selector: (state: State) => T) => T;
export declare const useDispatch: () => React.ActionDispatch<[Action: UiAction]>;
export declare const useGetEQFile: () => (path: string, file: string) => Promise<ArrayBuffer | null>;
