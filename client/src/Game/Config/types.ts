
// File: client/src/Game/Config/types.ts
import { ActionButtonData } from "@ui/components/game/action-button/constants";

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

export interface ActionButtonsConfig {
  hotButtons: Record<number, ActionButtonData>;
  combatButtons: Record<number, ActionButtonData>;
  socialButtons: Record<number, ActionButtonData>;
  abilityButtons: Record<number, ActionButtonData>;
}

export type Config = {
  keyBindings: KeyBindings;
  settings: Settings;
  ui: UISettings;
} & ActionButtonsConfig;