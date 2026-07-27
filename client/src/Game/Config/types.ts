
// File: client/src/Game/Config/types.ts
import { ActionButtonData } from '@ui/components/game/action-button/constants';

export interface KeyBindings {
  moveForward: string;
  moveBackward: string;
  turnLeft: string;
  turnRight: string;
  hail: string;
  consider: string;
  jump: string;
  sitStand: string;
  targetNearest: string;
  targetPrevious: string;
  inventory: string;
  spells: string;
  autoAttack: string;
  options: string;
  reply: string;
  autoRun: string;
  // Hotkeys
  hotkey1: string;
  hotkey2: string;
  hotkey3: string;
  hotkey4: string;
  hotkey5: string;
  hotkey6: string;
  hotkey7: string;
  hotkey8: string;
  hotkey9: string;
  hotkey10: string;
}

export interface Settings {
  particles: boolean;
  sound: boolean;
  music: boolean;
  musicVolume: number;
  renderScale: number;
}

export type HudWindowId =
  | 'player'
  | 'target'
  | 'compass'
  | 'minimap'
  | 'chat'
  | 'commands';

export interface HudWindowPlacement {
  /** Viewport-relative origin; dimensions are unscaled logical CSS pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export interface UISettings {
  theme: string;
  fontSize: number;
  showTooltips: boolean;
  uiScale: number;
  hudLocked: boolean;
  hudWindows: Record<HudWindowId, HudWindowPlacement>;
}

export type ActionButtonRecord = Record<number, ActionButtonData>;

export interface ActionButtonsConfig {
  hotButtons: ActionButtonRecord;
  combatButtons: ActionButtonRecord;
  socialButtons: ActionButtonRecord;
  abilityButtons: ActionButtonRecord;
}

export type Config = {
  keyBindings: KeyBindings;
  settings: Settings;
  ui: UISettings;
} & ActionButtonsConfig;
