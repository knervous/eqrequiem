// File: client/src/Game/Config/gamepad-bindings.ts
//
// Pure helpers for the W3C Gamepad API "standard" mapping. This module is kept
// free of Babylon/React/config imports so the mapping can be exercised on its
// own in tests.

/** Digital controller actions. Analog sticks are bound separately. */
export type GamepadDigitalAction =
  | 'jump'
  | 'sprint'
  | 'crouch'
  | 'autoRun'
  | 'walkRun'
  | 'sitStand'
  | 'autoAttack'
  | 'hail'
  | 'consider'
  | 'targetNearest'
  | 'targetPrevious'
  | 'clearTarget'
  | 'inventory'
  | 'spells'
  | 'options'
  | 'reply'
  | 'camp'
  | 'who'
  | 'invite'
  | 'disband'
  | 'help'
  | 'cameraToggle'
  | 'gyroHold'
  | 'hotkeyModifier'
  | 'hotkey1'
  | 'hotkey2'
  | 'hotkey3'
  | 'hotkey4'
  | 'hotkey5'
  | 'hotkey6'
  | 'hotkey7'
  | 'hotkey8'
  | 'hotkey9'
  | 'hotkey10';

export type GamepadAxisAction = 'moveAxisX' | 'moveAxisY' | 'lookAxisX' | 'lookAxisY';

/** Human readable names for the standard-mapping buttons, indexed by button id. */
export const GAMEPAD_BUTTON_LABELS: readonly string[] = [
  'A / Cross',
  'B / Circle',
  'X / Square',
  'Y / Triangle',
  'Left Bumper',
  'Right Bumper',
  'Left Trigger',
  'Right Trigger',
  'Back / Share',
  'Start / Options',
  'Left Stick Click',
  'Right Stick Click',
  'D-Pad Up',
  'D-Pad Down',
  'D-Pad Left',
  'D-Pad Right',
  'Guide',
];

/** Compact button names, for places too narrow for the full label. */
export const GAMEPAD_BUTTON_LABELS_SHORT: readonly string[] = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L3',
  'R3',
  'D-Up',
  'D-Down',
  'D-Left',
  'D-Right',
  'Guide',
];

/** Human readable names for the standard-mapping axes, indexed by axis id. */
export const GAMEPAD_AXIS_LABELS: readonly string[] = [
  'Left Stick X',
  'Left Stick Y',
  'Right Stick X',
  'Right Stick Y',
];

/** A trigger/button is considered pressed past this analog value. */
export const BUTTON_PRESS_THRESHOLD = 0.5;

/** Minimum axis travel required before the binding capture UI accepts an axis. */
export const AXIS_CAPTURE_THRESHOLD = 0.6;

export const gamepadButtonBinding = (index: number): string => `Button${index}`;
export const gamepadAxisBinding = (index: number): string => `Axis${index}`;

/** Turns `Button3` / `Axis2` into something a player can read. */
export const presentGamepadBinding = (binding: string): string => {
  if (!binding) return 'Unbound';
  const button = /^Button(\d+)$/.exec(binding);
  if (button) {
    const index = Number(button[1]);
    return GAMEPAD_BUTTON_LABELS[index] ?? `Button ${index}`;
  }
  const axis = /^Axis(\d+)$/.exec(binding);
  if (axis) {
    const index = Number(axis[1]);
    return GAMEPAD_AXIS_LABELS[index] ?? `Axis ${index}`;
  }
  return binding;
};

/** Same as `presentGamepadBinding`, but short enough for the HUD overlay. */
export const presentGamepadBindingShort = (binding: string): string => {
  if (!binding) return 'Unbound';
  const button = /^Button(\d+)$/.exec(binding);
  if (button) {
    const index = Number(button[1]);
    return GAMEPAD_BUTTON_LABELS_SHORT[index] ?? `B${index}`;
  }
  return presentGamepadBinding(binding);
};

export const parseButtonBinding = (binding: string): number | null => {
  const match = /^Button(\d+)$/.exec(binding ?? '');
  return match ? Number(match[1]) : null;
};

export const parseAxisBinding = (binding: string): number | null => {
  const match = /^Axis(\d+)$/.exec(binding ?? '');
  return match ? Number(match[1]) : null;
};

/**
 * Radial-style deadzone on a single axis: everything inside `deadzone` reads as
 * zero, and the remaining travel is rescaled so the stick still reaches 1.0.
 */
export const applyDeadzone = (value: number, deadzone: number): number => {
  if (!Number.isFinite(value)) return 0;
  const limit = Math.min(Math.max(deadzone, 0), 0.95);
  const magnitude = Math.abs(value);
  if (magnitude <= limit) return 0;
  const scaled = (magnitude - limit) / (1 - limit);
  return Math.sign(value) * Math.min(1, scaled);
};

/** Scales a stick as a unit so diagonals aren't faster than cardinals. */
export const applyStickDeadzone = (
  x: number,
  y: number,
  deadzone: number,
): { x: number; y: number } => {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const magnitude = Math.hypot(safeX, safeY);
  if (magnitude === 0) return { x: 0, y: 0 };
  const scaled = applyDeadzone(magnitude, deadzone);
  if (scaled === 0) return { x: 0, y: 0 };
  return { x: (safeX / magnitude) * scaled, y: (safeY / magnitude) * scaled };
};

/** Minimal structural view of a `Gamepad`, so tests can supply plain objects. */
export interface GamepadLike {
  index?: number;
  id?: string;
  connected?: boolean;
  mapping?: string;
  axes: readonly number[];
  buttons: readonly { pressed?: boolean; value?: number }[];
  /** Present only for controllers whose IMU we can read. */
  motion?: MotionSample;
}

export const isButtonPressed = (
  gamepad: GamepadLike | null | undefined,
  index: number | null,
): boolean => {
  if (!gamepad || index === null || index < 0) return false;
  const button = gamepad.buttons?.[index];
  if (!button) return false;
  if (button.pressed) return true;
  return (button.value ?? 0) >= BUTTON_PRESS_THRESHOLD;
};

export const readAxis = (
  gamepad: GamepadLike | null | undefined,
  index: number | null,
): number => {
  if (!gamepad || index === null || index < 0) return 0;
  const value = gamepad.axes?.[index];
  return Number.isFinite(value) ? (value as number) : 0;
};

/** Set of currently-held button indices; used for rising/falling edge detection. */
export type ButtonSnapshot = Record<number, boolean>;

export const snapshotButtons = (
  gamepad: GamepadLike | null | undefined,
): ButtonSnapshot => {
  const snapshot: ButtonSnapshot = {};
  const buttons = gamepad?.buttons ?? [];
  for (let index = 0; index < buttons.length; index++) {
    snapshot[index] = isButtonPressed(gamepad, index);
  }
  return snapshot;
};

/** Buttons that went from up to down between two snapshots. */
export const risingEdges = (
  previous: ButtonSnapshot,
  current: ButtonSnapshot,
): number[] => {
  const pressed: number[] = [];
  for (const [key, value] of Object.entries(current)) {
    if (value && !previous[Number(key)]) pressed.push(Number(key));
  }
  return pressed;
};

/**
 * Watches a gamepad for the first button press or full axis deflection, for the
 * "press a button…" flow in the options window. Returns `null` while idle so a
 * caller can keep polling.
 */
export const detectGamepadBinding = (
  gamepad: GamepadLike | null | undefined,
  options: { allowAxes?: boolean; axisThreshold?: number } = {},
): string | null => {
  if (!gamepad) return null;
  const buttons = gamepad.buttons ?? [];
  for (let index = 0; index < buttons.length; index++) {
    if (isButtonPressed(gamepad, index)) return gamepadButtonBinding(index);
  }
  if (options.allowAxes) {
    const threshold = options.axisThreshold ?? AXIS_CAPTURE_THRESHOLD;
    const axes = gamepad.axes ?? [];
    for (let index = 0; index < axes.length; index++) {
      if (Math.abs(axes[index] ?? 0) >= threshold) {
        return gamepadAxisBinding(index);
      }
    }
  }
  return null;
};

/** Analog look is expressed in the same units the mouse look handler consumes. */
export const LOOK_PIXELS_PER_SECOND = 900;

/** Below this deflection the look stick is not considered held. */
export const LOOK_RAMP_THRESHOLD = 0.15;

/** Gyro rates arrive in degrees per second; this converts to look pixels. */
export const GYRO_PIXELS_PER_DEGREE = 6;

/**
 * Per-frame smoothing factor for an exponential filter with a given lag, in a
 * form that behaves identically whatever the frame rate.
 */
export const smoothingAlpha = (lagSeconds: number, delta: number): number => {
  if (lagSeconds <= 0) return 1;
  return 1 - Math.exp(-delta / lagSeconds);
};

/** Six-axis motion from a controller that reports an IMU. */
export interface MotionSample {
  /** Angular rate in degrees per second. */
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  /** Acceleration in g. */
  accelX: number;
  accelY: number;
  accelZ: number;
}

/**
 * Carried between frames so look and movement can be smoothed and so holding
 * the stick can earn extra speed. Owned by the caller; `sampleGamepad` never
 * mutates it.
 */
export interface GamepadMotionState {
  lookX: number;
  lookY: number;
  moveX: number;
  moveY: number;
  /** Seconds the look stick has been held past the ramp threshold. */
  heldSeconds: number;
}

export const emptyMotionState = (): GamepadMotionState => ({
  lookX: 0,
  lookY: 0,
  moveX: 0,
  moveY: 0,
  heldSeconds: 0,
});

/**
 * Hot button actions the D-pad drives, in hot button order. Holding the
 * modifier shifts these four onto the next four slots, so eight hot buttons
 * are reachable from the D-pad alone.
 */
export const HOTKEY_ACTIONS: readonly GamepadDigitalAction[] = [
  'hotkey1',
  'hotkey2',
  'hotkey3',
  'hotkey4',
];

/** Holding the modifier shifts the hot button row by this many slots. */
export const HOTKEY_MODIFIER_OFFSET = 4;

/**
 * Every hot button, in slot order. The last six have no default binding but
 * can be assigned directly so all ten are reachable without the modifier.
 */
export const ALL_HOTKEY_ACTIONS: readonly GamepadDigitalAction[] = [
  'hotkey1',
  'hotkey2',
  'hotkey3',
  'hotkey4',
  'hotkey5',
  'hotkey6',
  'hotkey7',
  'hotkey8',
  'hotkey9',
  'hotkey10',
];

/** The hot button slot an action drives, or -1 when it is not a hot button. */
export const hotkeySlotFor = (action: string): number =>
  ALL_HOTKEY_ACTIONS.indexOf(action as GamepadDigitalAction);

/** Everything one polled frame of a controller means, with no side effects. */
export interface GamepadSample {
  /** -1..1, where forward on the stick reads negative, matching the key path. */
  move: { forward: number; strafe: number };
  /** Camera delta in mouse-equivalent pixels for this frame. */
  look: { x: number; y: number };
  sprint: boolean;
  crouch: boolean;
  jump: boolean;
  /** Non-hotkey actions whose button went down this frame. */
  actions: GamepadDigitalAction[];
  /** Zero-based hot button slots triggered this frame. */
  hotkeys: number[];
  /** Feed back in as `previousButtons` on the next call. */
  buttons: ButtonSnapshot;
  /** Feed back in as `motionState` on the next call. */
  motionState: GamepadMotionState;
}

export const emptyGamepadSample = (): GamepadSample => ({
  move: { forward: 0, strafe: 0 },
  look: { x: 0, y: 0 },
  sprint: false,
  crouch: false,
  jump: false,
  actions: [],
  hotkeys: [],
  buttons: {},
  motionState: emptyMotionState(),
});

type BindingMap = Record<string, string>;

interface SampleSettings {
  deadzone: number;
  lookSensitivity: number;
  invertLookY: boolean;
  invertMoveY: boolean;
  lookCurve?: number;
  lookAcceleration?: number;
  lookRampTime?: number;
  lookSmoothing?: number;
  moveSmoothing?: number;
  gyroEnabled?: boolean;
  gyroSensitivity?: number;
  gyroInvertY?: boolean;
  gyroRequiresHold?: boolean;
}

/**
 * Turns one frame of raw controller state into the movement, look and action
 * edges the player systems consume. Pure so the mapping can be tested without
 * a scene, and so replaying recorded pad states is deterministic.
 *
 * Look and movement are filtered across frames, which is what `motionState`
 * carries: an exponential filter for smoothness, plus a timer so holding the
 * look stick earns extra speed for long turns without costing fine aim.
 */
export const sampleGamepad = (
  gamepad: GamepadLike | null | undefined,
  bindings: BindingMap,
  settings: SampleSettings,
  previousButtons: ButtonSnapshot,
  delta: number,
  motionState: GamepadMotionState = emptyMotionState(),
): GamepadSample => {
  if (!gamepad) return emptyGamepadSample();

  const stick = applyStickDeadzone(
    readAxis(gamepad, parseAxisBinding(bindings.moveAxisX)),
    readAxis(gamepad, parseAxisBinding(bindings.moveAxisY)),
    settings.deadzone,
  );
  const rawLookX = applyDeadzone(
    readAxis(gamepad, parseAxisBinding(bindings.lookAxisX)),
    settings.deadzone,
  );
  const rawLookY = applyDeadzone(
    readAxis(gamepad, parseAxisBinding(bindings.lookAxisY)),
    settings.deadzone,
  );

  // Ease both sticks toward their new positions so a flick doesn't snap the
  // camera and a released stick doesn't stop the character dead.
  const lookAlpha = smoothingAlpha(settings.lookSmoothing ?? 0, delta);
  const moveAlpha = smoothingAlpha(settings.moveSmoothing ?? 0, delta);
  const lookXSmoothed =
    motionState.lookX + (rawLookX - motionState.lookX) * lookAlpha;
  const lookYSmoothed =
    motionState.lookY + (rawLookY - motionState.lookY) * lookAlpha;
  const moveXSmoothed =
    motionState.moveX + (stick.x - motionState.moveX) * moveAlpha;
  const moveYSmoothed =
    motionState.moveY + (stick.y - motionState.moveY) * moveAlpha;

  // Holding the stick past the threshold spins the camera up to a higher top
  // speed, then drops straight back when released.
  const lookMagnitude = Math.min(1, Math.hypot(lookXSmoothed, lookYSmoothed));
  const heldSeconds =
    lookMagnitude >= LOOK_RAMP_THRESHOLD ? motionState.heldSeconds + delta : 0;
  const rampTime = settings.lookRampTime ?? 0;
  const rampProgress =
    rampTime > 0 ? Math.min(1, heldSeconds / rampTime) : heldSeconds > 0 ? 1 : 0;
  const acceleration = 1 + (settings.lookAcceleration ?? 0) * rampProgress;

  // The response curve keeps small deflections precise while leaving full
  // deflection at the configured top speed.
  const curve = settings.lookCurve ?? 2;
  const shaped = lookMagnitude > 0 ? Math.pow(lookMagnitude, curve) : 0;
  const scale =
    lookMagnitude > 0
      ? (shaped / lookMagnitude) *
        acceleration *
        LOOK_PIXELS_PER_SECOND *
        settings.lookSensitivity *
        delta
      : 0;

  let lookDeltaX = lookXSmoothed * scale;
  // Invert applies to the stick here so the gyro can keep its own setting
  // rather than inheriting this one.
  let lookDeltaY = lookYSmoothed * scale * (settings.invertLookY ? -1 : 1);

  const held = (action: GamepadDigitalAction) =>
    isButtonPressed(gamepad, parseButtonBinding(bindings[action]));

  // Gyro aiming rides on top of the stick rather than replacing it, which is
  // how motion aiming is normally used: the stick makes the big turns, the
  // wrist makes the fine ones.
  const motion = gamepad.motion;
  if (settings.gyroEnabled && motion) {
    const gate = !settings.gyroRequiresHold || held('gyroHold');
    if (gate) {
      const gyroScale =
        GYRO_PIXELS_PER_DEGREE * (settings.gyroSensitivity ?? 1) * delta;
      // Rotating the pad left or right turns the view; tilting it aims up
      // and down.
      lookDeltaX += -motion.gyroY * gyroScale;
      const pitch = motion.gyroX * gyroScale;
      lookDeltaY += settings.gyroInvertY ? -pitch : pitch;
    }
  }

  const buttons = snapshotButtons(gamepad);
  const pressed = risingEdges(previousButtons, buttons);
  const modifierHeld = held('hotkeyModifier');

  const actions: GamepadDigitalAction[] = [];
  const hotkeys: number[] = [];
  for (const button of pressed) {
    // The four D-pad hot buttons shift onto the second row while the modifier
    // is held; the other six fire their own slot directly.
    const shiftableSlot = HOTKEY_ACTIONS.findIndex(
      (action) => parseButtonBinding(bindings[action]) === button,
    );
    if (shiftableSlot >= 0) {
      hotkeys.push(
        modifierHeld ? shiftableSlot + HOTKEY_MODIFIER_OFFSET : shiftableSlot,
      );
      continue;
    }

    for (const [action, binding] of Object.entries(bindings)) {
      if (parseButtonBinding(binding) !== button) continue;
      const slot = hotkeySlotFor(action);
      if (slot >= 0) {
        hotkeys.push(slot);
      } else {
        actions.push(action as GamepadDigitalAction);
      }
    }
  }

  return {
    move: {
      forward: settings.invertMoveY ? -moveYSmoothed : moveYSmoothed,
      strafe: moveXSmoothed,
    },
    look: { x: lookDeltaX, y: lookDeltaY },
    sprint: held('sprint'),
    crouch: held('crouch'),
    jump: held('jump'),
    actions,
    hotkeys,
    buttons,
    motionState: {
      lookX: lookXSmoothed,
      lookY: lookYSmoothed,
      moveX: moveXSmoothed,
      moveY: moveYSmoothed,
      heldSeconds,
    },
  };
};

/** Picks the gamepad we should drive the player with. */
export const selectActiveGamepad = (
  gamepads: readonly (GamepadLike | null)[] | null | undefined,
  preferredIndex: number | null = null,
): GamepadLike | null => {
  const list = gamepads ?? [];
  if (preferredIndex !== null) {
    const preferred = list[preferredIndex];
    if (preferred && preferred.connected !== false) return preferred;
  }
  for (const gamepad of list) {
    if (gamepad && gamepad.connected !== false) return gamepad;
  }
  return null;
};
