
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
}

export interface UISettings {
  theme: string;
  fontSize: number;
  showTooltips: boolean;
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
