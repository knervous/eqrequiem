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
  emptyMotionState,
  presentGamepadBinding,
  sampleGamepad,
  selectActiveGamepad,
  type ButtonSnapshot,
  type GamepadLike,
  type GamepadSample,
} from '@game/Config/gamepad-bindings';
import {
  buildFullModeRequest,
  buildImuRequest,
  isNintendoController,
  parseNintendoReport,
  REPORT_ID_FULL,
  REPORT_ID_SIMPLE,
} from '@game/Config/nintendo-hid';

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

/**
 * Replays a sequence of pad frames, carrying edge state and the look/move
 * filters between them so smoothing and acceleration behave as they do live.
 */
const replay = (
  frames: GamepadLike[],
  overrides?: Overrides,
  delta = 1 / 60,
): GamepadSample[] => {
  const bindings = bindingsWith(overrides);
  const settings = settingsWith(overrides);
  let previous: ButtonSnapshot = {};
  let motion = emptyMotionState();
  return frames.map((frame) => {
    const sample = sampleGamepad(
      frame,
      bindings,
      settings,
      previous,
      delta,
      motion,
    );
    previous = sample.buttons;
    motion = sample.motionState;
    return sample;
  });
};

/** Repeats one frame, which is what holding a stick actually looks like. */
const hold = (
  frame: GamepadLike,
  frameCount: number,
  overrides?: Overrides,
  delta = 1 / 60,
): GamepadSample[] =>
  replay(new Array(frameCount).fill(frame), overrides, delta);

const harness = {
  applyDeadzone,
  applyStickDeadzone,
  detectGamepadBinding,
  emptyGamepadSample,
  emptyMotionState,
  presentGamepadBinding,
  selectActiveGamepad,
  hold,
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
  nintendo: {
    REPORT_ID_FULL,
    REPORT_ID_SIMPLE,
    isNintendoController,
    buildFullModeRequest: (counter: number) =>
      Array.from(buildFullModeRequest(counter)),
    buildImuRequest: (counter: number, enabled: boolean) =>
      Array.from(buildImuRequest(counter, enabled)),
    /** Decodes a report given as a plain byte array (no report id). */
    parse: (reportId: number, bytes: number[]) =>
      parseNintendoReport(
        reportId,
        new DataView(new Uint8Array(bytes).buffer),
      ),
    /** Decodes, then runs the result through the normal mapping pipeline. */
    sample: (reportId: number, bytes: number[]) => {
      const pad = parseNintendoReport(
        reportId,
        new DataView(new Uint8Array(bytes).buffer),
      );
      return pad
        ? sampleGamepad(
          pad,
          DEFAULT_GAMEPAD_BINDINGS,
          DEFAULT_GAMEPAD_SETTINGS,
          {},
          1 / 60,
        )
        : null;
    },
  },
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
