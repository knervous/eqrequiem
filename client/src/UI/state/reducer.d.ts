import { UiState, UiWindow } from "./initial-state";
/**
 * Action Types & Action Creators with Optional Index for Deep Array Modification
 */
export declare const UiActionTypes: {
    readonly SET_WINDOW: "SET_WINDOW";
    readonly SET_WINDOW_VISIBILITY: "SET_WINDOW_VISIBILITY";
    readonly SET_WINDOW_LOCKED: "SET_WINDOW_LOCKED";
    readonly SET_WINDOW_COLLAPSED: "SET_WINDOW_COLLAPSED";
    readonly SET_WINDOW_TRANSFORM: "SET_WINDOW_TRANSFORM";
};
export type SetWindowAction = {
    type: typeof UiActionTypes.SET_WINDOW;
    payload: {
        windowName: keyof UiState;
        window: UiWindow;
        index?: number;
    };
};
export type SetWindowTransformAction = {
    type: typeof UiActionTypes.SET_WINDOW_TRANSFORM;
    payload: {
        windowName: keyof UiState;
        x: number;
        y: number;
        width: number;
        height: number;
        index?: number;
    };
};
export type SetWindowVisibilityAction = {
    type: typeof UiActionTypes.SET_WINDOW_VISIBILITY;
    payload: {
        windowName: keyof UiState;
        visible: boolean;
        index?: number;
    };
};
export type SetWindowLockedAction = {
    type: typeof UiActionTypes.SET_WINDOW_LOCKED;
    payload: {
        windowName: keyof UiState;
        locked: boolean;
        index?: number;
    };
};
export type SetWindowCollapsedAction = {
    type: typeof UiActionTypes.SET_WINDOW_COLLAPSED;
    payload: {
        windowName: keyof UiState;
        collapsed: boolean;
        index?: number;
    };
};
export type UiAction = SetWindowAction | SetWindowVisibilityAction | SetWindowLockedAction | SetWindowCollapsedAction | SetWindowTransformAction;
export declare const actions: {
    setWindow: (windowName: keyof UiState, window: UiWindow, index?: number) => SetWindowAction;
    setWindowVisibility: (windowName: keyof UiState, visible: boolean, index?: number) => SetWindowVisibilityAction;
    setWindowLocked: (windowName: keyof UiState, locked: boolean, index?: number) => SetWindowLockedAction;
    setWindowCollapsed: (windowName: keyof UiState, collapsed: boolean, index?: number) => SetWindowCollapsedAction;
    setWindowTransform: (windowName: keyof UiState, x: number, y: number, width: number, height: number, index?: number) => SetWindowTransformAction;
};
/**
   * Reducer using generalized update logic
   */
export declare const uiReducer: (state: UiState | undefined, action: UiAction) => UiState;
