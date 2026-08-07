// File: client/e2e/gamepad-mapping.spec.ts
import { expect, test } from '@playwright/test';
import {
  connectPad,
  installVirtualGamepad,
  padFrame,
  setAxis,
  setPadState,
  withButtons,
  type VirtualPadState,
} from './fixtures/virtual-gamepad';

type Overrides = {
  bindings?: Record<string, string>;
  settings?: Record<string, unknown>;
};

/**
 * These tests are about the mapping, not the feel, so they run with the
 * smoothing and acceleration filters off. A single frame then lands on the
 * steady-state value. Smoothing and acceleration have their own suite in
 * gamepad-feel.spec.ts.
 */
const INSTANT = {
  lookSmoothing: 0,
  moveSmoothing: 0,
  lookAcceleration: 0,
  lookRampTime: 0,
};

const instant = (overrides?: Overrides): Overrides => ({
  ...overrides,
  settings: { ...INSTANT, ...overrides?.settings },
});

test.beforeEach(async ({ page }) => {
  await installVirtualGamepad(page);
  await page.goto('/gamepad.html');
  await page.waitForFunction(() => Boolean(window.gamepadHarness));
});

const sampleOnce = (
  page: import('@playwright/test').Page,
  state: VirtualPadState,
  overrides?: Overrides,
) =>
  page.evaluate(
    ({ frame, opts }) => window.gamepadHarness.sample(frame as never, opts as never),
    { frame: padFrame(state), opts: instant(overrides) },
  );

const replay = (
  page: import('@playwright/test').Page,
  states: VirtualPadState[],
  overrides?: Overrides,
) =>
  page.evaluate(
    ({ frames, opts }) =>
      window.gamepadHarness.replay(frames as never, opts as never),
    { frames: states.map(padFrame), opts: instant(overrides) },
  );

test.describe('stick handling', () => {
  test('ignores drift inside the deadzone', async ({ page }) => {
    // Well inside the 0.12 default, including as a diagonal magnitude.
    const sample = await sampleOnce(page, {
      axes: [0.06, -0.06, 0.06, 0.06],
    });
    expect(sample.move.forward).toBe(0);
    expect(sample.move.strafe).toBe(0);
    expect(sample.look).toEqual({ x: 0, y: 0 });
  });

  test('rescales travel past the deadzone so full deflection reaches 1', async ({
    page,
  }) => {
    const sample = await sampleOnce(page, { axes: [0, -1, 0, 0] });
    expect(sample.move.forward).toBeCloseTo(-1, 5);
    expect(sample.move.strafe).toBeCloseTo(0, 5);
  });

  test('keeps diagonals at unit speed', async ({ page }) => {
    const sample = await sampleOnce(page, { axes: [-1, -1, 0, 0] });
    const magnitude = Math.hypot(sample.move.forward, sample.move.strafe);
    expect(magnitude).toBeCloseTo(1, 5);
  });

  test('partial deflection produces a partial vector', async ({ page }) => {
    const sample = await sampleOnce(page, { axes: [0, -0.5, 0, 0] });
    expect(sample.move.forward).toBeLessThan(0);
    expect(sample.move.forward).toBeGreaterThan(-1);
  });

  test('invert movement flips the forward axis', async ({ page }) => {
    const sample = await sampleOnce(
      page,
      { axes: [0, -1, 0, 0] },
      { settings: { invertMoveY: true } },
    );
    expect(sample.move.forward).toBeCloseTo(1, 5);
  });
});

test.describe('camera look', () => {
  test('right stick produces a look delta scaled by sensitivity', async ({
    page,
  }) => {
    const base = await sampleOnce(page, { axes: [0, 0, 1, 0] });
    const fast = await sampleOnce(
      page,
      { axes: [0, 0, 1, 0] },
      { settings: { lookSensitivity: 2 } },
    );
    expect(base.look.x).toBeGreaterThan(0);
    expect(fast.look.x).toBeCloseTo(base.look.x * 2, 5);
  });

  test('small deflections move the camera far less than large ones', async ({
    page,
  }) => {
    const small = await sampleOnce(page, { axes: [0, 0, 0.5, 0] });
    const large = await sampleOnce(page, { axes: [0, 0, 1, 0] });
    expect(Math.abs(small.look.x)).toBeLessThan(Math.abs(large.look.x) / 3);
  });

  test('invert look flips only the vertical axis', async ({ page }) => {
    const normal = await sampleOnce(page, { axes: [0, 0, 1, 1] });
    const inverted = await sampleOnce(
      page,
      { axes: [0, 0, 1, 1] },
      { settings: { invertLookY: true } },
    );
    expect(inverted.look.x).toBeCloseTo(normal.look.x, 5);
    expect(inverted.look.y).toBeCloseTo(-normal.look.y, 5);
  });
});

test.describe('button actions', () => {
  test('fires an action once per press, not once per frame', async ({
    page,
  }) => {
    // Back/Select is bound to the inventory window by default.
    const samples = await replay(page, [
      { buttons: withButtons() },
      { buttons: withButtons(8) },
      { buttons: withButtons(8) },
      { buttons: withButtons(8) },
      { buttons: withButtons() },
      { buttons: withButtons(8) },
    ]);
    const inventoryFrames = samples
      .map((sample, index) => (sample.actions.includes('inventory') ? index : -1))
      .filter((index) => index >= 0);
    expect(inventoryFrames).toEqual([1, 5]);
  });

  test('maps the default face and shoulder buttons to their actions', async ({
    page,
  }) => {
    const samples = await replay(page, [
      { buttons: withButtons() },
      { buttons: withButtons(1) },
      { buttons: withButtons() },
      { buttons: withButtons(2) },
      { buttons: withButtons() },
      { buttons: withButtons(3) },
      { buttons: withButtons() },
      { buttons: withButtons(5) },
      { buttons: withButtons() },
      { buttons: withButtons(9) },
    ]);
    expect(samples[1].actions).toContain('sitStand');
    expect(samples[3].actions).toContain('hail');
    expect(samples[5].actions).toContain('consider');
    expect(samples[7].actions).toContain('targetNearest');
    expect(samples[9].actions).toContain('options');
  });

  test('reports jump, sprint and crouch as held state rather than edges', async ({
    page,
  }) => {
    const samples = await replay(page, [
      { buttons: withButtons(0, 6) },
      { buttons: withButtons(0, 6) },
      { buttons: withButtons() },
    ]);
    expect(samples[0].jump).toBe(true);
    expect(samples[1].jump).toBe(true);
    expect(samples[1].sprint).toBe(true);
    expect(samples[2].jump).toBe(false);
    expect(samples[2].sprint).toBe(false);
  });

  test('treats an analog trigger past halfway as pressed', async ({ page }) => {
    const light = await sampleOnce(page, {
      buttons: Object.assign(withButtons(), { 7: 0.3 }),
    });
    const firm = await sampleOnce(page, {
      buttons: Object.assign(withButtons(), { 7: 0.8 }),
    });
    expect(light.actions).not.toContain('autoAttack');
    expect(firm.actions).toContain('autoAttack');
  });

  test('an unbound action never fires', async ({ page }) => {
    const samples = await replay(page, [
      { buttons: withButtons() },
      { buttons: withButtons(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11) },
    ]);
    // `crouch` and `clearTarget` ship unbound.
    expect(samples[1].actions).not.toContain('crouch');
    expect(samples[1].actions).not.toContain('clearTarget');
  });

  test('honours a rebound button', async ({ page }) => {
    const samples = await replay(
      page,
      [{ buttons: withButtons() }, { buttons: withButtons(3) }],
      { bindings: { inventory: 'Button3', consider: '' } },
    );
    expect(samples[1].actions).toContain('inventory');
    expect(samples[1].actions).not.toContain('consider');
  });
});

test.describe('hot buttons', () => {
  test('the d-pad drives the first four hot buttons', async ({ page }) => {
    const samples = await replay(page, [
      { buttons: withButtons() },
      { buttons: withButtons(12) },
      { buttons: withButtons() },
      { buttons: withButtons(15) },
    ]);
    expect(samples[1].hotkeys).toEqual([0]);
    expect(samples[3].hotkeys).toEqual([3]);
  });

  test('holding the shift modifier reaches hot buttons five to eight', async ({
    page,
  }) => {
    const samples = await replay(page, [
      { buttons: withButtons() },
      { buttons: withButtons(4) },
      { buttons: withButtons(4, 12) },
      { buttons: withButtons(4) },
      { buttons: withButtons(4, 15) },
    ]);
    expect(samples[2].hotkeys).toEqual([4]);
    expect(samples[4].hotkeys).toEqual([7]);
  });

  test('a hot button never doubles as a normal action', async ({ page }) => {
    const samples = await replay(page, [
      { buttons: withButtons() },
      { buttons: withButtons(13) },
    ]);
    expect(samples[1].hotkeys).toEqual([1]);
    expect(samples[1].actions).toEqual([]);
  });
});

test.describe('device selection and capture', () => {
  test('produces an empty sample with no controller attached', async ({
    page,
  }) => {
    const sample = await page.evaluate(() =>
      window.gamepadHarness.poll(),
    );
    expect(sample.move).toEqual({ forward: 0, strafe: 0 });
    expect(sample.actions).toEqual([]);
  });

  test('reads live state from navigator.getGamepads once connected', async ({
    page,
  }) => {
    await connectPad(page);
    await setPadState(page, { axes: [0, -1, 0, 0] });
    const sample = await page.evaluate(
      (opts) => window.gamepadHarness.poll(opts as never),
      instant(),
    );
    expect(sample.move.forward).toBeCloseTo(-1, 5);
  });

  test('capture reports the pressed button and ignores idle sticks', async ({
    page,
  }) => {
    await connectPad(page);
    const idle = await page.evaluate(() =>
      window.gamepadHarness.detectGamepadBinding(
        window.gamepadHarness.selectActiveGamepad(
          Array.from(navigator.getGamepads()) as never,
        ),
        { allowAxes: true },
      ),
    );
    expect(idle).toBeNull();

    await setPadState(page, { buttons: withButtons(6) });
    const captured = await page.evaluate(() =>
      window.gamepadHarness.detectGamepadBinding(
        window.gamepadHarness.selectActiveGamepad(
          Array.from(navigator.getGamepads()) as never,
        ),
      ),
    );
    expect(captured).toBe('Button6');
  });

  test('capture picks up an axis only when axes are allowed', async ({
    page,
  }) => {
    await connectPad(page);
    await setAxis(page, 2, -0.9);
    const withoutAxes = await page.evaluate(() =>
      window.gamepadHarness.detectGamepadBinding(
        window.gamepadHarness.selectActiveGamepad(
          Array.from(navigator.getGamepads()) as never,
        ),
      ),
    );
    const withAxes = await page.evaluate(() =>
      window.gamepadHarness.detectGamepadBinding(
        window.gamepadHarness.selectActiveGamepad(
          Array.from(navigator.getGamepads()) as never,
        ),
        { allowAxes: true },
      ),
    );
    expect(withoutAxes).toBeNull();
    expect(withAxes).toBe('Axis2');
  });

  test('bindings present readable controller labels', async ({ page }) => {
    const labels = await page.evaluate(() => ({
      face: window.gamepadHarness.presentGamepadBinding('Button0'),
      dpad: window.gamepadHarness.presentGamepadBinding('Button12'),
      stick: window.gamepadHarness.presentGamepadBinding('Axis1'),
      empty: window.gamepadHarness.presentGamepadBinding(''),
    }));
    expect(labels.face).toBe('A / Cross');
    expect(labels.dpad).toBe('D-Pad Up');
    expect(labels.stick).toBe('Left Stick Y');
    expect(labels.empty).toBe('Unbound');
  });
});
