
// File: client/src/Game/Config/types.ts
import type {
  GamepadAxisAction,
  GamepadDigitalAction,
} from '@game/Config/gamepad-bindings';
import { ActionButtonData } from '@ui/components/game/action-button/constants';

export interface KeyBindings {
  moveForward: string;
  moveBackward: string;
  turnLeft: string;
  turnRight: string;
  sprint: string;
  crouch: string;
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

/**
 * Controller bindings, keyed by action. Values are `Button<n>` for digital
 * actions and `Axis<n>` for the analog sticks; an empty string is unbound.
 */
export type GamepadBindings = Record<
  GamepadDigitalAction | GamepadAxisAction,
  string
>;

export interface GamepadSettings {
  /** Master switch for controller input. */
  enabled: boolean;
  /** Stick travel ignored around centre, 0-0.95. */
  deadzone: number;
  /** Right-stick look speed multiplier. */
  lookSensitivity: number;
  /** Flip the vertical look axis. */
  invertLookY: boolean;
  /** Flip the forward/back movement axis. */
  invertMoveY: boolean;
  /** Fire the haptic actuator on hits and other feedback events. */
  vibration: boolean;

  /**
   * Response exponent for the look stick. 1 is linear; higher values give
   * finer control near centre while keeping full speed at full deflection.
   */
  lookCurve: number;
  /** Extra look speed earned by holding the stick, as a multiplier above 1. */
  lookAcceleration: number;
  /** Seconds of sustained deflection needed to reach full acceleration. */
  lookRampTime: number;
  /** Smoothing applied to the look stick, in seconds of lag. 0 disables it. */
  lookSmoothing: number;
  /** Seconds for movement to ease in and out. 0 makes it instant. */
  moveSmoothing: number;

  /** Use the controller's gyroscope to aim. */
  gyroEnabled: boolean;
  /** Gyro aiming speed multiplier. */
  gyroSensitivity: number;
  /** Flip the gyro's vertical axis. */
  gyroInvertY: boolean;
  /** Only aim with the gyro while the bound button is held. */
  gyroRequiresHold: boolean;
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
  /** Show the on-screen controller button legend. */
  controllerHud: boolean;
  /** Hide the controller legend when no controller is connected. */
  controllerHudAutoHide: boolean;
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
  gamepadBindings: GamepadBindings;
  gamepad: GamepadSettings;
  settings: Settings;
  ui: UISettings;
} & ActionButtonsConfig;
