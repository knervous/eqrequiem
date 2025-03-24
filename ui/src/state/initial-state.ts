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

export type UiState = {
  [key: string]: UiWindow | UiWindow[]; // allows both single windows and arrays of windows

  inventoryWindow: UiWindow;
  targetWindow: UiWindow;
  settingsWindow: UiWindow;
  spellsWindow: UiWindow;
  chatWindows: (UiWindow & ChatWindow)[];
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
  chatWindows: [
    {
      ...defaultWindow,
      x: 300,
      y: 300,
      name: "General",
      filters: [],
    },
  ],
};
