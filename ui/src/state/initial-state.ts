
export interface UiWindow {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
};

const defaultWindow: UiWindow = {
  visible: false,
  locked: false,
  collapsed: false,
  x: 10,
  y: 10,
  width: 200,
  height: 200,
};

export interface ChatWindow extends UiWindow {
  name: string;
  filters: string[];
};

export interface ActionBarWindow extends UiWindow {
  modifier?: string
}

export type UiState = {
  [key: string]: UiWindow | UiWindow[]; // allows both single windows and arrays of windows

  inventoryWindow: UiWindow;
  targetWindow: UiWindow;
  settingsWindow: UiWindow;
  spellsWindow: UiWindow;
  topBarWindow: UiWindow;
  compassWindow: UiWindow;
  chatWindows: ChatWindow[];
  actionBarWindows: ActionBarWindow[];
};

export const initialUiState: UiState = {
  inventoryWindow: {
    ...defaultWindow,
  },
  targetWindow: {
    ...defaultWindow,
    x: 300,
    y: 50,
  },
  settingsWindow: {
    ...defaultWindow,
    x: 10,
    y: 10,
  },
  spellsWindow: {
    ...defaultWindow,
    x: 200,
    y: 200,
  },
  topBarWindow: {
    ...defaultWindow,
    x: 200,
    y: 50,
    width: 300,
    height: 50
  },
  compassWindow: {
    ...defaultWindow,
    x: 200,
    y: 150,
    width: 200,
    height: 50,
  },
  chatWindows: [
    {
      ...defaultWindow,
      x: 300,
      y: 300,
      name: "General",
      filters: [],
    },
  ],
  actionBarWindows:
  [
    {
      ...defaultWindow,
      x: 100,
      y: 500,
    }
  ]
};
