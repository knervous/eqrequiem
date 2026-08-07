// File: client/e2e/fixtures/virtual-gamepad.ts
//
// Chromium exposes no way to synthesise real controller input, so the page gets
// a scripted `navigator.getGamepads()` that tests drive directly.
import type { Page } from '@playwright/test';

export const BUTTON_COUNT = 17;
export const AXIS_COUNT = 4;

export interface VirtualPadState {
  axes?: number[];
  buttons?: number[];
}

declare global {
  interface Window {
    __virtualGamepad: {
      connected: boolean;
      axes: number[];
      buttons: number[];
      id: string;
    };
  }
}

/**
 * Installs the fake before any page script runs, so modules that capture
 * `navigator.getGamepads` at import time still see it.
 */
export const installVirtualGamepad = async (page: Page) => {
  await page.addInitScript(
    ({ buttonCount, axisCount }) => {
      window.__virtualGamepad = {
        connected: false,
        axes: new Array(axisCount).fill(0),
        buttons: new Array(buttonCount).fill(0),
        id: 'Virtual Controller (STANDARD GAMEPAD)',
      };
      const build = () => {
        const state = window.__virtualGamepad;
        if (!state.connected) return null;
        return {
          index: 0,
          id: state.id,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          axes: [...state.axes],
          buttons: state.buttons.map((value) => ({
            value,
            pressed: value >= 0.5,
            touched: value > 0,
          })),
        };
      };
      navigator.getGamepads = () => [build(), null, null, null] as never;
    },
    { buttonCount: BUTTON_COUNT, axisCount: AXIS_COUNT },
  );
};

export const connectPad = (page: Page, connected = true) =>
  page.evaluate((value) => {
    window.__virtualGamepad.connected = value;
  }, connected);

/** Merges a partial state into the fake pad. */
export const setPadState = (page: Page, state: VirtualPadState) =>
  page.evaluate((next) => {
    if (next.axes) window.__virtualGamepad.axes = next.axes;
    if (next.buttons) window.__virtualGamepad.buttons = next.buttons;
  }, state);

/** Sets a single button's analog value, leaving the rest untouched. */
export const setButton = (page: Page, index: number, value: number) =>
  page.evaluate(
    ({ index: buttonIndex, value: buttonValue }) => {
      window.__virtualGamepad.buttons[buttonIndex] = buttonValue;
    },
    { index, value },
  );

export const setAxis = (page: Page, index: number, value: number) =>
  page.evaluate(
    ({ index: axisIndex, value: axisValue }) => {
      window.__virtualGamepad.axes[axisIndex] = axisValue;
    },
    { index, value },
  );

/** Convenience helpers for building frames passed to the pure sampler. */
export const padFrame = (state: VirtualPadState = {}) => ({
  index: 0,
  id: 'Virtual Controller (STANDARD GAMEPAD)',
  connected: true,
  mapping: 'standard',
  axes: state.axes ?? new Array(AXIS_COUNT).fill(0),
  buttons: (state.buttons ?? new Array(BUTTON_COUNT).fill(0)).map((value) => ({
    value,
    pressed: value >= 0.5,
  })),
});

export const withButtons = (...indices: number[]) => {
  const buttons = new Array(BUTTON_COUNT).fill(0);
  for (const index of indices) buttons[index] = 1;
  return buttons;
};
