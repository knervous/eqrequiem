
export interface UiWindow {
  visible: boolean;
  collapsed: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  fixedWidth?: number;
  fixedHeight?: number;
  fixed?: boolean;
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
  loginWindow: UiWindow;
  playerWindow: UiWindow;
  settingsWindow: UiWindow;
  spellsWindow: UiWindow;
  topBarWindow: UiWindow;
  compassWindow: UiWindow;
  actionWindow: UiWindow;
  chatWindows: ChatWindow[];
  actionBarWindows: ActionBarWindow[];
};

export const initialUiState: UiState = {
  inventoryWindow: {
    ...defaultWindow,
  },
  loginWindow: {
    ...defaultWindow,
  },
  targetWindow: {
    ...defaultWindow,
    x: 300,
    y: 50,
  },
  playerWindow: {
    ...defaultWindow,
    x: 300,
    y: 450,
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
    fixed: true,
    x: 200,
    y: 50,
  },
  compassWindow: {
    ...defaultWindow,
    fixed: true,
    x: 200,
    y: 150,
  },
  actionWindow: {
    ...defaultWindow,
    x: 500,
    y: 550,
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
      },
    ],
};
