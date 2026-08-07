// File: client/e2e/harness/gamepad-harness.ts
//
// Exposes the controller mapping to Playwright. Only the pure modules are
// pulled in, so the harness runs without a scene, a socket or a zone.
import { DEFAULT_GAMEPAD_BINDINGS, DEFAULT_GAMEPAD_SETTINGS } from '@game/Config/config';
import {
  applyDeadzone,
  applyStickDeadzone,
  detectGamepadBinding,
  emptyGamepadSample,
  presentGamepadBinding,
  sampleGamepad,
  selectActiveGamepad,
  type ButtonSnapshot,
  type GamepadLike,
  type GamepadSample,
} from '@game/Config/gamepad-bindings';

type Overrides = {
  bindings?: Partial<Record<string, string>>;
  settings?: Partial<typeof DEFAULT_GAMEPAD_SETTINGS>;
};

const bindingsWith = (overrides?: Overrides) => ({
  ...DEFAULT_GAMEPAD_BINDINGS,
  ...overrides?.bindings,
});

const settingsWith = (overrides?: Overrides) => ({
  ...DEFAULT_GAMEPAD_SETTINGS,
  ...overrides?.settings,
});

/** Replays a sequence of pad frames, carrying edge state between them. */
const replay = (
  frames: GamepadLike[],
  overrides?: Overrides,
  delta = 1 / 60,
): GamepadSample[] => {
  const bindings = bindingsWith(overrides);
  const settings = settingsWith(overrides);
  let previous: ButtonSnapshot = {};
  return frames.map((frame) => {
    const sample = sampleGamepad(frame, bindings, settings, previous, delta);
    previous = sample.buttons;
    return sample;
  });
};

const harness = {
  applyDeadzone,
  applyStickDeadzone,
  detectGamepadBinding,
  emptyGamepadSample,
  presentGamepadBinding,
  selectActiveGamepad,
  defaults: {
    bindings: DEFAULT_GAMEPAD_BINDINGS,
    settings: DEFAULT_GAMEPAD_SETTINGS,
  },
  sample: (
    gamepad: GamepadLike | null,
    overrides?: Overrides,
    previous: ButtonSnapshot = {},
    delta = 1 / 60,
  ) =>
    sampleGamepad(
      gamepad,
      bindingsWith(overrides),
      settingsWith(overrides),
      previous,
      delta,
    ),
  replay,
  /** Reads whatever `navigator.getGamepads()` currently reports. */
  poll: (overrides?: Overrides, previous: ButtonSnapshot = {}, delta = 1 / 60) =>
    sampleGamepad(
      selectActiveGamepad(
        Array.from(navigator.getGamepads?.() ?? []) as (GamepadLike | null)[],
      ),
      bindingsWith(overrides),
      settingsWith(overrides),
      previous,
      delta,
    ),
};

declare global {
  interface Window {
    gamepadHarness: typeof harness;
  }
}

window.gamepadHarness = harness;

export default harness;
