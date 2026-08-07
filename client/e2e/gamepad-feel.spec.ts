// File: client/e2e/gamepad-feel.spec.ts
//
// The smoothing, response curve and hold-to-accelerate behaviour that make the
// sticks feel right. These are all time-dependent, so they are exercised by
// replaying held frames rather than sampling once.
import { expect, test } from '@playwright/test';
import { padFrame, withButtons } from './fixtures/virtual-gamepad';

type Sample = {
  move: { forward: number; strafe: number };
  look: { x: number; y: number };
  actions: string[];
  hotkeys: number[];
};

const hold = (
  page: import('@playwright/test').Page,
  state: { axes?: number[]; buttons?: number[]; motion?: Record<string, number> },
  frames: number,
  overrides?: Record<string, unknown>,
  delta = 1 / 60,
): Promise<Sample[]> =>
  page.evaluate(
    ({ frame, count, opts, dt }) =>
      window.gamepadHarness.hold(frame as never, count, opts as never, dt),
    {
      frame: { ...padFrame(state), ...(state.motion ? { motion: state.motion } : {}) },
      count: frames,
      opts: overrides ?? {},
      dt: delta,
    },
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/gamepad.html');
  await page.waitForFunction(() => Boolean(window.gamepadHarness));
});

test.describe('look smoothing', () => {
  test('a flick ramps in rather than snapping to full speed', async ({
    page,
  }) => {
    const samples = await hold(page, { axes: [0, 0, 1, 0] }, 12, {
      settings: { lookSmoothing: 0.08, lookAcceleration: 0, lookRampTime: 0 },
    });
    // The first frame must not already be at the steady-state speed.
    expect(samples[0].look.x).toBeGreaterThan(0);
    expect(samples[0].look.x).toBeLessThan(samples[11].look.x * 0.6);
    // And it should be climbing monotonically toward it.
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].look.x).toBeGreaterThanOrEqual(samples[i - 1].look.x);
    }
  });

  test('smoothing disabled reaches full speed immediately', async ({
    page,
  }) => {
    const samples = await hold(page, { axes: [0, 0, 1, 0] }, 4, {
      settings: { lookSmoothing: 0, lookAcceleration: 0, lookRampTime: 0 },
    });
    expect(samples[0].look.x).toBeCloseTo(samples[3].look.x, 6);
  });

  test('releasing the stick decays instead of cutting out', async ({
    page,
  }) => {
    const settled = await hold(page, { axes: [0, 0, 1, 0] }, 30, {
      settings: { lookSmoothing: 0.08 },
    });
    const steady = settled[29].look.x;
    expect(steady).toBeGreaterThan(0);

    // Replaying the same held frames then a centred one: the filter is
    // carried across, so the first centred frame still has residual motion.
    const decay = await page.evaluate(() => {
      const frames = [];
      for (let i = 0; i < 30; i++) {
        frames.push({
          axes: [0, 0, 1, 0],
          buttons: new Array(17).fill(0).map(() => ({ pressed: false, value: 0 })),
        });
      }
      frames.push({
        axes: [0, 0, 0, 0],
        buttons: new Array(17).fill(0).map(() => ({ pressed: false, value: 0 })),
      });
      return window.gamepadHarness.replay(frames as never, {
        settings: { lookSmoothing: 0.08 },
      } as never);
    });
    const afterRelease = decay[30].look.x;
    expect(afterRelease).toBeGreaterThan(0);
    expect(afterRelease).toBeLessThan(steady);
  });

  test('smoothing is frame-rate independent', async ({ page }) => {
    // The same wall-clock time at two frame rates must land in the same place.
    const at60 = await hold(page, { axes: [0, 0, 1, 0] }, 30, {
      settings: { lookSmoothing: 0.08, lookAcceleration: 0 },
    }, 1 / 60);
    const at30 = await hold(page, { axes: [0, 0, 1, 0] }, 15, {
      settings: { lookSmoothing: 0.08, lookAcceleration: 0 },
    }, 1 / 30);

    const total = (samples: Sample[]) =>
      samples.reduce((sum, sample) => sum + sample.look.x, 0);
    // Total camera travel over half a second should match closely.
    expect(total(at30)).toBeGreaterThan(total(at60) * 0.9);
    expect(total(at30)).toBeLessThan(total(at60) * 1.1);
  });
});

test.describe('turn acceleration', () => {
  test('a held stick speeds up, then resets when released', async ({
    page,
  }) => {
    const samples = await hold(page, { axes: [0, 0, 1, 0] }, 40, {
      settings: {
        lookSmoothing: 0,
        lookAcceleration: 1,
        lookRampTime: 0.3,
      },
    });
    const first = samples[0].look.x;
    const last = samples[39].look.x;
    // 40 frames at 60fps is well past the 0.3s ramp, so it should be at the
    // full doubled speed by the end.
    expect(last).toBeGreaterThan(first * 1.8);
    expect(last).toBeLessThan(first * 2.1);
  });

  test('acceleration set to zero keeps a constant speed', async ({ page }) => {
    const samples = await hold(page, { axes: [0, 0, 1, 0] }, 40, {
      settings: { lookSmoothing: 0, lookAcceleration: 0 },
    });
    expect(samples[39].look.x).toBeCloseTo(samples[0].look.x, 6);
  });

  test('a stick below the ramp threshold never accelerates', async ({
    page,
  }) => {
    const samples = await hold(page, { axes: [0, 0, 0.16, 0] }, 40, {
      settings: {
        deadzone: 0.05,
        lookSmoothing: 0,
        lookAcceleration: 2,
        lookRampTime: 0.3,
      },
    });
    expect(samples[39].look.x).toBeCloseTo(samples[0].look.x, 6);
  });
});

test.describe('response curve', () => {
  test('a steeper curve cuts small deflections without touching full ones', async ({
    page,
  }) => {
    const opts = (curve: number) => ({
      settings: { lookCurve: curve, lookSmoothing: 0, lookAcceleration: 0 },
    });
    const gentleSmall = (await hold(page, { axes: [0, 0, 0.4, 0] }, 1, opts(1)))[0];
    const steepSmall = (await hold(page, { axes: [0, 0, 0.4, 0] }, 1, opts(2.5)))[0];
    const gentleFull = (await hold(page, { axes: [0, 0, 1, 0] }, 1, opts(1)))[0];
    const steepFull = (await hold(page, { axes: [0, 0, 1, 0] }, 1, opts(2.5)))[0];

    expect(steepSmall.look.x).toBeLessThan(gentleSmall.look.x / 2);
    // Full deflection is unchanged: 1 to any power is still 1.
    expect(steepFull.look.x).toBeCloseTo(gentleFull.look.x, 6);
  });
});

test.describe('movement smoothing', () => {
  test('the character eases up to speed', async ({ page }) => {
    const samples = await hold(page, { axes: [0, -1, 0, 0] }, 12, {
      settings: { moveSmoothing: 0.09 },
    });
    expect(samples[0].move.forward).toBeGreaterThan(-1);
    expect(samples[0].move.forward).toBeLessThan(0);
    expect(samples[11].move.forward).toBeLessThan(samples[0].move.forward);
    expect(samples[11].move.forward).toBeGreaterThanOrEqual(-1);
  });

  test('smoothing disabled moves at full speed on the first frame', async ({
    page,
  }) => {
    const samples = await hold(page, { axes: [0, -1, 0, 0] }, 2, {
      settings: { moveSmoothing: 0 },
    });
    expect(samples[0].move.forward).toBeCloseTo(-1, 5);
  });
});

test.describe('gyro aiming', () => {
  const motion = {
    gyroX: 0,
    gyroY: 0,
    gyroZ: 0,
    accelX: 0,
    accelY: 0,
    accelZ: 1,
  };

  test('is ignored while disabled', async ({ page }) => {
    const samples = await hold(
      page,
      { axes: [0, 0, 0, 0], motion: { ...motion, gyroY: 40 } },
      1,
      { settings: { gyroEnabled: false } },
    );
    expect(samples[0].look.x).toBe(0);
  });

  test('turns the view when enabled', async ({ page }) => {
    const samples = await hold(
      page,
      { axes: [0, 0, 0, 0], motion: { ...motion, gyroY: 40 } },
      1,
      { settings: { gyroEnabled: true, gyroRequiresHold: false } },
    );
    expect(samples[0].look.x).toBeLessThan(0);
  });

  test('scales with sensitivity', async ({ page }) => {
    const base = await hold(
      page,
      { axes: [0, 0, 0, 0], motion: { ...motion, gyroX: 30 } },
      1,
      { settings: { gyroEnabled: true, gyroRequiresHold: false, gyroSensitivity: 1 } },
    );
    const fast = await hold(
      page,
      { axes: [0, 0, 0, 0], motion: { ...motion, gyroX: 30 } },
      1,
      { settings: { gyroEnabled: true, gyroRequiresHold: false, gyroSensitivity: 2 } },
    );
    expect(fast[0].look.y).toBeCloseTo(base[0].look.y * 2, 5);
  });

  test('inverting the gyro leaves the stick alone', async ({ page }) => {
    const settings = {
      gyroEnabled: true,
      gyroRequiresHold: false,
      lookSmoothing: 0,
      invertLookY: false,
    };
    const normal = await hold(
      page,
      { axes: [0, 0, 0, 1], motion: { ...motion, gyroX: 30 } },
      1,
      { settings },
    );
    const gyroInverted = await hold(
      page,
      { axes: [0, 0, 0, 1], motion: { ...motion, gyroX: 30 } },
      1,
      { settings: { ...settings, gyroInvertY: true } },
    );
    // Same stick contribution, opposite gyro contribution, so the two differ
    // by exactly twice the gyro term.
    expect(gyroInverted[0].look.y).toBeLessThan(normal[0].look.y);
  });

  test('hold-to-aim gates the gyro behind its button', async ({ page }) => {
    const settings = {
      gyroEnabled: true,
      gyroRequiresHold: true,
    };
    const bindings = { gyroHold: 'Button6', sprint: '' };

    const released = await hold(
      page,
      { axes: [0, 0, 0, 0], motion: { ...motion, gyroY: 40 } },
      1,
      { settings, bindings },
    );
    expect(released[0].look.x).toBe(0);

    const heldDown = await hold(
      page,
      {
        axes: [0, 0, 0, 0],
        buttons: withButtons(6),
        motion: { ...motion, gyroY: 40 },
      },
      1,
      { settings, bindings },
    );
    expect(heldDown[0].look.x).toBeLessThan(0);
  });
});

test.describe('the full hot button row', () => {
  test('directly bound hot buttons reach slots five to ten', async ({
    page,
  }) => {
    const samples = await page.evaluate(() =>
      window.gamepadHarness.replay(
        [
          {
            axes: [0, 0, 0, 0],
            buttons: new Array(17).fill(0).map(() => ({ pressed: false, value: 0 })),
          },
          {
            axes: [0, 0, 0, 0],
            buttons: new Array(17).fill(0).map((_, index) => ({
              pressed: index === 2,
              value: index === 2 ? 1 : 0,
            })),
          },
        ] as never,
        { bindings: { hotkey9: 'Button2', interactPrimary: '' } } as never,
      ),
    );
    expect(samples[1].hotkeys).toEqual([8]);
    expect(samples[1].actions).toEqual([]);
  });
});
