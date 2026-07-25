export interface UiWindow {
    visible?: boolean;
    collapsed?: boolean;
    locked?: boolean;
    x: number;
    y: number;
    width?: number;
    height?: number;
    fixedWidth?: number;
    fixedHeight?: number;
    fixed?: boolean;
}
export interface ChatWindow extends UiWindow {
    name: string;
    filters: string[];
}
export interface ActionBarWindow extends UiWindow {
    modifier?: string;
}
export type UiState = {
    [key: string]: UiWindow | UiWindow[];
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
    actionBarWindows: ActionBarWindow[];
};
export declare const initialUiState: UiState;
