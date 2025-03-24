import { UiState, UiWindow, initialUiState } from "./initial-state";

/**
 * Action Types & Action Creators with Optional Index for Deep Array Modification
 */
export const UiActionTypes = {
    SET_WINDOW: "SET_WINDOW",
    SET_WINDOW_VISIBILITY: "SET_WINDOW_VISIBILITY",
    SET_WINDOW_LOCKED: "SET_WINDOW_LOCKED",
    SET_WINDOW_COLLAPSED: "SET_WINDOW_COLLAPSED",
    SET_WINDOW_TRANSFORM: "SET_WINDOW_TRANSFORM",
  } as const;
  
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
  
  export type UiAction =
    | SetWindowAction
    | SetWindowVisibilityAction
    | SetWindowLockedAction
    | SetWindowCollapsedAction
    | SetWindowTransformAction;
  
  export const actions = {
    setWindow: (
      windowName: keyof UiState,
      window: UiWindow,
      index?: number
    ): SetWindowAction => ({
      type: UiActionTypes.SET_WINDOW,
      payload: { windowName, window, index },
    }),
    setWindowVisibility: (
      windowName: keyof UiState,
      visible: boolean,
      index?: number
    ): SetWindowVisibilityAction => ({
      type: UiActionTypes.SET_WINDOW_VISIBILITY,
      payload: { windowName, visible, index },
    }),
    setWindowLocked: (
      windowName: keyof UiState,
      locked: boolean,
      index?: number
    ): SetWindowLockedAction => ({
      type: UiActionTypes.SET_WINDOW_LOCKED,
      payload: { windowName, locked, index },
    }),
    setWindowCollapsed: (
      windowName: keyof UiState,
      collapsed: boolean,
      index?: number
    ): SetWindowCollapsedAction => ({
      type: UiActionTypes.SET_WINDOW_COLLAPSED,
      payload: { windowName, collapsed, index },
    }),
    setWindowTransform: (
      windowName: keyof UiState,
      x: number,
      y: number,
      width: number,
      height: number,
      index?: number
    ): SetWindowTransformAction => ({
      type: UiActionTypes.SET_WINDOW_TRANSFORM,
      payload: { windowName, x, y, width, height, index },
    }),
  };
  
  /**
   * Helper: Generalized update function
   *
   * This function takes the current state, a window name,
   * a partial update (updateProps), and an optional index.
   * If an index is provided and the targeted state is an array,
   * it updates only the element at that index.
   */
  function updateWindow<T extends keyof UiState>(
    state: UiState,
    windowName: T,
    updateProps: Partial<UiWindow>,
    index?: number
  ): UiState {
    const current = state[windowName];
    if (typeof index === "number" && Array.isArray(current)) {
      return {
        ...state,
        [windowName]: current.map((item, i) =>
          i === index ? { ...item, ...updateProps } : item
        ),
      };
    }
    return {
      ...state,
      [windowName]: {
        ...current,
        ...updateProps,
      },
    };
  }
  
  /**
   * Reducer using generalized update logic
   */
  export const uiReducer = (
    state: UiState = initialUiState,
    action: UiAction
  ): UiState => {
    console.log('ACTION', action)
    switch (action.type) {
      case UiActionTypes.SET_WINDOW:
        return updateWindow(
          state,
          action.payload.windowName,
          action.payload.window,
          action.payload.index
        );
  
      case UiActionTypes.SET_WINDOW_VISIBILITY:
        return updateWindow(
          state,
          action.payload.windowName,
          { visible: action.payload.visible },
          action.payload.index
        );
  
      case UiActionTypes.SET_WINDOW_LOCKED:
        return updateWindow(
          state,
          action.payload.windowName,
          { locked: action.payload.locked },
          action.payload.index
        );
  
      case UiActionTypes.SET_WINDOW_COLLAPSED:
        return updateWindow(
          state,
          action.payload.windowName,
          { collapsed: action.payload.collapsed },
          action.payload.index
        );
      case UiActionTypes.SET_WINDOW_TRANSFORM:
        return updateWindow(
          state,
          action.payload.windowName,
          {
            x: action.payload.x,
            y: action.payload.y,
            width: action.payload.width,
            height: action.payload.height,
          },
          action.payload.index
        );
      default:
        return state;
    }
  };