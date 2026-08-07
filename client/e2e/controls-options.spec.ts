// File: client/e2e/controls-options.spec.ts
import { expect, test } from '@playwright/test';
import {
  connectPad,
  installVirtualGamepad,
  setPadState,
  withButtons,
} from './fixtures/virtual-gamepad';

const readConfig = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.controlsHarness.config());

test.beforeEach(async ({ page }) => {
  await installVirtualGamepad(page);
  await page.goto('/controls.html');
  await expect(page.getByTestId('controls-options')).toBeVisible();
  await page.evaluate(() => window.controlsHarness.reset());
});

test.describe('layout', () => {
  test('lists keyboard and controller bindings under grouped headings', async ({
    page,
  }) => {
    const panel = page.getByTestId('controls-options');
    await expect(panel.getByRole('heading', { name: 'Keyboard' })).toBeVisible();
    await expect(
      panel.getByRole('heading', { name: 'Controller' }),
    ).toBeVisible();
    await expect(page.getByTestId('keybind-moveForward')).toHaveText('W');
    await expect(page.getByTestId('keybind-sprint')).toHaveText('Shift');
    await expect(page.getByTestId('keybind-crouch')).toHaveText('Ctrl');
    await expect(page.getByTestId('gamepad-bind-jump')).toHaveText('A / Cross');
    await expect(page.getByTestId('gamepad-bind-moveAxisY')).toHaveText(
      'Left Stick Y',
    );
  });

  test('reports no controller until one connects', async ({ page }) => {
    await expect(page.getByTestId('gamepad-status')).toContainText(
      'No controller detected',
    );
    await connectPad(page);
    await expect(page.getByTestId('gamepad-status')).toContainText(
      'Virtual Controller',
    );
  });
});

test.describe('keyboard rebinding', () => {
  test('captures the next key pressed and persists it', async ({ page }) => {
    const button = page.getByTestId('keybind-moveForward');
    await button.click();
    await expect(button).toHaveText('Press a key…');
    await page.keyboard.press('k');
    await expect(button).toHaveText('K');

    const config = await readConfig(page);
    expect(config.keyBindings.moveForward).toBe('K');
  });

  test('records modifier combinations', async ({ page }) => {
    const button = page.getByTestId('keybind-sitStand');
    await button.click();
    await page.keyboard.press('Control+g');
    await expect(button).toHaveText('Ctrl+G');
  });

  test('escape cancels capture and leaves the binding alone', async ({
    page,
  }) => {
    const button = page.getByTestId('keybind-inventory');
    await button.click();
    await expect(button).toHaveText('Press a key…');
    await page.keyboard.press('Escape');
    await expect(button).toHaveText('I');

    const config = await readConfig(page);
    expect(config.keyBindings.inventory).toBe('I');
  });

  test('reset restores the keyboard defaults', async ({ page }) => {
    await page.getByTestId('keybind-moveForward').click();
    await page.keyboard.press('k');
    await expect(page.getByTestId('keybind-moveForward')).toHaveText('K');

    await page.getByTestId('reset-keybinds').click();
    await expect(page.getByTestId('keybind-moveForward')).toHaveText('W');
  });
});

test.describe('controller rebinding', () => {
  test('captures the next controller button pressed', async ({ page }) => {
    await connectPad(page);
    const button = page.getByTestId('gamepad-bind-inventory');
    await expect(button).toHaveText('Back / Share');

    await button.click();
    await expect(button).toHaveText('Press a button…');
    // The capture loop waits for an idle pad before accepting a press, so a
    // held button can't bind itself the instant the row opens.
    await setPadState(page, { buttons: withButtons(3) });
    await expect(button).toHaveText('Y / Triangle');

    const config = await readConfig(page);
    expect(config.gamepadBindings.inventory).toBe('Button3');
  });

  test('a stick row captures an axis instead of a button', async ({ page }) => {
    await connectPad(page);
    const button = page.getByTestId('gamepad-bind-lookAxisX');
    await button.click();
    await expect(button).toHaveText('Move a stick…');
    await setPadState(page, { axes: [0, -0.95, 0, 0] });
    await expect(button).toHaveText('Left Stick Y');

    const config = await readConfig(page);
    expect(config.gamepadBindings.lookAxisX).toBe('Axis1');
  });

  test('clearing a binding leaves the action unbound', async ({ page }) => {
    const button = page.getByTestId('gamepad-bind-autoAttack');
    await expect(button).toHaveText('Right Trigger');
    await page.getByTestId('gamepad-clear-autoAttack').click();
    await expect(button).toHaveText('Unbound');

    const config = await readConfig(page);
    expect(config.gamepadBindings.autoAttack).toBe('');
  });

  test('reset restores the controller defaults', async ({ page }) => {
    await page.getByTestId('gamepad-clear-jump').click();
    await expect(page.getByTestId('gamepad-bind-jump')).toHaveText('Unbound');

    await page.getByTestId('reset-gamepad').click();
    await expect(page.getByTestId('gamepad-bind-jump')).toHaveText('A / Cross');
  });
});

test.describe('controller settings', () => {
  test('deadzone and sensitivity sliders write through to config', async ({
    page,
  }) => {
    await page.getByTestId('gamepad-deadzone').fill('0.35');
    await page.getByTestId('gamepad-sensitivity').fill('2');

    const config = await readConfig(page);
    expect(config.gamepad.deadzone).toBeCloseTo(0.35, 5);
    expect(config.gamepad.lookSensitivity).toBeCloseTo(2, 5);
    await expect(page.getByTestId('gamepad-deadzone')).toHaveValue('0.35');
  });

  test('toggles write through to config', async ({ page }) => {
    await page.getByTestId('gamepad-invert-look').check();
    await page.getByTestId('gamepad-invert-move').check();
    await page.getByTestId('gamepad-enabled').uncheck();

    const config = await readConfig(page);
    expect(config.gamepad.invertLookY).toBe(true);
    expect(config.gamepad.invertMoveY).toBe(true);
    expect(config.gamepad.enabled).toBe(false);
  });
});
