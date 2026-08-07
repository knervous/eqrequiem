// File: client/e2e/nintendo-hid.spec.ts
//
// Decoding for the Switch Pro Controller's WebHID reports. macOS keeps this
// controller away from Chrome's Gamepad API, so the raw reports are the only
// way in — and they are worth pinning down precisely, since a wrong bit shows
// up as a button that silently does the wrong thing.
import { expect, test } from '@playwright/test';

type Pad = {
  axes: number[];
  buttons: { pressed: boolean; value: number }[];
  mapping: string;
  id: string;
};

const SIMPLE = 0x3f;
const FULL = 0x30;

/** A simple report with no input: neutral hat, sticks centred. */
const simpleIdle = () => {
  const bytes = new Array(11).fill(0);
  bytes[2] = 8; // hat neutral
  // 16-bit centres
  bytes[3] = 0x00; bytes[4] = 0x80;
  bytes[5] = 0x00; bytes[6] = 0x80;
  bytes[7] = 0x00; bytes[8] = 0x80;
  bytes[9] = 0x00; bytes[10] = 0x80;
  return bytes;
};

/** A full report with no input: sticks at the 12-bit centre (2048 = 0x800). */
const fullIdle = () => {
  const bytes = new Array(12).fill(0);
  // left stick: x=2048, y=2048 -> bytes 5,6,7
  bytes[5] = 0x00; bytes[6] = 0x08; bytes[7] = 0x80;
  // right stick: bytes 8,9,10
  bytes[8] = 0x00; bytes[9] = 0x08; bytes[10] = 0x80;
  return bytes;
};

const parse = (
  page: import('@playwright/test').Page,
  reportId: number,
  bytes: number[],
): Promise<Pad> =>
  page.evaluate(
    ({ id, data }) => window.gamepadHarness.nintendo.parse(id, data),
    { id: reportId, data: bytes },
  );

const pressedIndices = (pad: Pad) =>
  pad.buttons
    .map((button, index) => (button.pressed ? index : -1))
    .filter((index) => index >= 0);

test.beforeEach(async ({ page }) => {
  await page.goto('/gamepad.html');
  await page.waitForFunction(() => Boolean(window.gamepadHarness));
});

test.describe('device identification', () => {
  test('recognises the Pro Controller and the charging grip', async ({
    page,
  }) => {
    const results = await page.evaluate(() => ({
      pro: window.gamepadHarness.nintendo.isNintendoController({
        vendorId: 0x057e,
        productId: 0x2009,
      }),
      grip: window.gamepadHarness.nintendo.isNintendoController({
        vendorId: 0x057e,
        productId: 0x200e,
      }),
      xbox: window.gamepadHarness.nintendo.isNintendoController({
        vendorId: 0x045e,
        productId: 0x02fd,
      }),
    }));
    expect(results.pro).toBe(true);
    expect(results.grip).toBe(true);
    expect(results.xbox).toBe(false);
  });

  test('the full-mode request carries the subcommand and rolls its counter', async ({
    page,
  }) => {
    const [first, second] = await page.evaluate(() => [
      window.gamepadHarness.nintendo.buildFullModeRequest(0),
      window.gamepadHarness.nintendo.buildFullModeRequest(17),
    ]);
    expect(first[0]).toBe(0);
    // Subcommand 0x03 (set input mode) with argument 0x30 (full report).
    expect(first[9]).toBe(0x03);
    expect(first[10]).toBe(0x30);
    // The counter is only four bits wide.
    expect(second[0]).toBe(1);
  });

  test('an unknown report id decodes to nothing', async ({ page }) => {
    const pad = await parse(page, 0x21, [0, 0, 0, 0]);
    expect(pad).toBeNull();
  });
});

test.describe('simple report (unpaired Bluetooth default)', () => {
  test('an idle controller reports centred sticks and no buttons', async ({
    page,
  }) => {
    const pad = await parse(page, SIMPLE, simpleIdle());
    expect(pressedIndices(pad)).toEqual([]);
    for (const axis of pad.axes) expect(Math.abs(axis)).toBeLessThan(0.01);
    expect(pad.mapping).toBe('standard');
  });

  test('face buttons land on their standard positions', async ({ page }) => {
    // The controller is positional: its B sits where a standard pad's button 0
    // is, so B must decode to 0 rather than to 1.
    const b = simpleIdle(); b[0] = 0x01;
    const a = simpleIdle(); a[0] = 0x02;
    const y = simpleIdle(); y[0] = 0x04;
    const x = simpleIdle(); x[0] = 0x08;

    expect(pressedIndices(await parse(page, SIMPLE, b))).toEqual([0]);
    expect(pressedIndices(await parse(page, SIMPLE, a))).toEqual([1]);
    expect(pressedIndices(await parse(page, SIMPLE, y))).toEqual([2]);
    expect(pressedIndices(await parse(page, SIMPLE, x))).toEqual([3]);
  });

  test('shoulders, triggers and system buttons decode', async ({ page }) => {
    const shoulders = simpleIdle(); shoulders[0] = 0xf0; // L, R, ZL, ZR
    expect(pressedIndices(await parse(page, SIMPLE, shoulders))).toEqual([
      4, 5, 6, 7,
    ]);

    const system = simpleIdle(); system[1] = 0x1f; // minus, plus, sticks, home
    expect(pressedIndices(await parse(page, SIMPLE, system))).toEqual([
      8, 9, 10, 11, 16,
    ]);
  });

  test('the hat switch becomes d-pad buttons, diagonals included', async ({
    page,
  }) => {
    const withHat = (value: number) => {
      const bytes = simpleIdle();
      bytes[2] = value;
      return bytes;
    };
    expect(pressedIndices(await parse(page, SIMPLE, withHat(0)))).toEqual([12]);
    expect(pressedIndices(await parse(page, SIMPLE, withHat(2)))).toEqual([15]);
    expect(pressedIndices(await parse(page, SIMPLE, withHat(4)))).toEqual([13]);
    expect(pressedIndices(await parse(page, SIMPLE, withHat(6)))).toEqual([14]);
    // Up-right holds both.
    expect(pressedIndices(await parse(page, SIMPLE, withHat(1)))).toEqual([
      12, 15,
    ]);
    expect(pressedIndices(await parse(page, SIMPLE, withHat(8)))).toEqual([]);
  });

  test('sticks span the full range', async ({ page }) => {
    const pushed = simpleIdle();
    pushed[3] = 0xff; pushed[4] = 0xff; // left X hard right
    pushed[5] = 0x00; pushed[6] = 0x00; // left Y hard one way
    const pad = await parse(page, SIMPLE, pushed);
    expect(pad.axes[0]).toBeGreaterThan(0.9);
    expect(pad.axes[1]).toBeCloseTo(-1, 2);
  });
});

test.describe('full report (high resolution mode)', () => {
  test('an idle controller reports centred sticks and no buttons', async ({
    page,
  }) => {
    const pad = await parse(page, FULL, fullIdle());
    expect(pressedIndices(pad)).toEqual([]);
    for (const axis of pad.axes) expect(Math.abs(axis)).toBeLessThan(0.05);
  });

  test('face buttons land on their standard positions', async ({ page }) => {
    const y = fullIdle(); y[2] = 0x01;
    const x = fullIdle(); x[2] = 0x02;
    const b = fullIdle(); b[2] = 0x04;
    const a = fullIdle(); a[2] = 0x08;

    expect(pressedIndices(await parse(page, FULL, y))).toEqual([2]);
    expect(pressedIndices(await parse(page, FULL, x))).toEqual([3]);
    expect(pressedIndices(await parse(page, FULL, b))).toEqual([0]);
    expect(pressedIndices(await parse(page, FULL, a))).toEqual([1]);
  });

  test('left-hand byte carries the d-pad, L and ZL', async ({ page }) => {
    const dpad = fullIdle(); dpad[4] = 0x0f; // down, up, right, left
    expect(pressedIndices(await parse(page, FULL, dpad))).toEqual([
      12, 13, 14, 15,
    ]);

    const shoulders = fullIdle(); shoulders[4] = 0xc0; // L and ZL
    expect(pressedIndices(await parse(page, FULL, shoulders))).toEqual([4, 6]);
  });

  test('right shoulder and trigger decode', async ({ page }) => {
    const bytes = fullIdle(); bytes[2] = 0xc0; // R and ZR
    expect(pressedIndices(await parse(page, FULL, bytes))).toEqual([5, 7]);
  });

  test('the 12-bit sticks unpack across their shared byte', async ({ page }) => {
    // Left stick x = 4095 (hard right), y = 4095 (hard up).
    const bytes = fullIdle();
    bytes[5] = 0xff; bytes[6] = 0xff; bytes[7] = 0xff;
    const pad = await parse(page, FULL, bytes);
    expect(pad.axes[0]).toBeCloseTo(1, 2);
    // Up on the stick must read negative, matching every other pad.
    expect(pad.axes[1]).toBeCloseTo(-1, 2);
  });

  test('pushing the left stick down reads positive', async ({ page }) => {
    const bytes = fullIdle();
    bytes[5] = 0x00; bytes[6] = 0x00; bytes[7] = 0x00; // x=0, y=0
    const pad = await parse(page, FULL, bytes);
    expect(pad.axes[0]).toBeCloseTo(-1, 2);
    expect(pad.axes[1]).toBeCloseTo(1, 2);
  });
});

test.describe('end to end through the mapping pipeline', () => {
  test('a decoded report drives the same actions as any other pad', async ({
    page,
  }) => {
    // Pressing A (standard index 1) is bound to sit/stand by default.
    const bytes = fullIdle();
    bytes[2] = 0x08;
    const sample = await page.evaluate(
      ({ id, data }) => window.gamepadHarness.nintendo.sample(id, data),
      { id: FULL, data: bytes },
    );
    expect(sample.actions).toContain('sitStand');
  });

  test('a decoded stick drives movement', async ({ page }) => {
    const bytes = fullIdle();
    // Left stick straight up: x stays at 2048 (0x800), y goes to 4095 (0xfff).
    // The two share byte 6, so it holds y's low nibble over x's high nibble.
    bytes[5] = 0x00; bytes[6] = 0xf8; bytes[7] = 0xff;
    const sample = await page.evaluate(
      ({ id, data }) => window.gamepadHarness.nintendo.sample(id, data),
      { id: FULL, data: bytes },
    );
    expect(sample.move.forward).toBeLessThan(-0.9);
  });
});
