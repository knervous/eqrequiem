/// <reference lib="dom" />

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
  devWindow: UiWindow;
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
  devWindow: {
    ...defaultWindow,
    x: 5,
    y: 5,
    collapsed: true,
    width: 300,
    height: 200,
    //x: window.
  },
  targetWindow: {
    ...defaultWindow,
    width: 200,
    height: 100,
    x: (window.innerWidth / 2) - 75,
    y: window.innerHeight - 310,
    
  },
  playerWindow: {
    ...defaultWindow,
    x: window.innerWidth - 310,
    y: window.innerHeight - 220,
    width: 150,
    height: 215,
  },
  settingsWindow: {
    ...defaultWindow,
    x: 10,
    y: 10,
  },
  spellsWindow: {
    ...defaultWindow,
    width: 85,
    height: 235,
    x: 5,
    y: 205,
  },
  topBarWindow: {
    ...defaultWindow,
    fixed: true,
    fixedHeight: 25,
    fixedWidth: 250,
    x: (window.innerWidth / 2) - 125,
    y: 5,
  },
  compassWindow: {
    ...defaultWindow,
    fixed: true,
    fixedHeight: 24,
    fixedWidth: 98,
    x: (window.innerWidth / 2) - 49,
    y: 50,
  },
  actionWindow: {
    ...defaultWindow,
    x: window.innerWidth - 155,
    y: window.innerHeight - 220,
    width: 150,
    height: 215,
  },
  chatWindows: [
    {
      ...defaultWindow,
      width: 400,
      height: 200,
      x: (window.innerWidth / 2) - 200,
      y: window.innerHeight - 210,
      name: "General",
      filters: [],
    },
  ],
  actionBarWindows:
    [
      {
        ...defaultWindow,
        width: 100,
        height: 200,
        x: 5,
        y: window.innerHeight - 205,
      },
    ],
};
