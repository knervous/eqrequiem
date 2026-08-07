// File: client/e2e/controller-hud.spec.ts
import { expect, test } from '@playwright/test';
import {
  connectPad,
  installVirtualGamepad,
  setPadState,
  withButtons,
} from './fixtures/virtual-gamepad';

test.beforeEach(async ({ page }) => {
  await installVirtualGamepad(page);
  await page.goto('/hud.html');
  await page.evaluate(() => window.hudHarness.reset());
});

test.describe('visibility', () => {
  test('is on by default but hidden until a controller appears', async ({
    page,
  }) => {
    await expect(page.getByTestId('controller-hud')).toHaveCount(0);
    await connectPad(page);
    await expect(page.getByTestId('controller-hud')).toBeVisible();
  });

  test('can be shown without a controller by turning auto-hide off', async ({
    page,
  }) => {
    await page.evaluate(() =>
      window.hudHarness.setUi('controllerHudAutoHide', false),
    );
    await expect(page.getByTestId('controller-hud')).toBeVisible();
  });

  test('hides entirely when switched off', async ({ page }) => {
    await connectPad(page);
    await expect(page.getByTestId('controller-hud')).toBeVisible();

    await page.evaluate(() => window.hudHarness.setUi('controllerHud', false));
    await expect(page.getByTestId('controller-hud')).toHaveCount(0);

    await page.evaluate(() => window.hudHarness.setUi('controllerHud', true));
    await expect(page.getByTestId('controller-hud')).toBeVisible();
  });
});

test.describe('legend', () => {
  test('lists the default bindings by their controller labels', async ({
    page,
  }) => {
    await connectPad(page);
    // The overlay is narrow, so it uses the compact button names.
    await expect(page.getByTestId('controller-hud-jump')).toContainText('A');
    await expect(page.getByTestId('controller-hud-jump')).toContainText('Jump');
    await expect(page.getByTestId('controller-hud-inventory')).toContainText(
      'Back',
    );
    await expect(page.getByTestId('controller-hud-autoRun')).toContainText(
      'L3',
    );
  });

  test('follows a rebind', async ({ page }) => {
    await connectPad(page);
    await page.evaluate(() =>
      window.hudHarness.setBinding('jump', 'Button3'),
    );
    await expect(page.getByTestId('controller-hud-jump')).toContainText('Y');
  });

  test('drops a row whose action has been unbound', async ({ page }) => {
    await connectPad(page);
    await expect(page.getByTestId('controller-hud-interactPrimary')).toBeVisible();
    await page.evaluate(() =>
      window.hudHarness.setBinding('interactPrimary', ''),
    );
    await expect(page.getByTestId('controller-hud-interactPrimary')).toHaveCount(0);
  });
});

test.describe('live feedback', () => {
  test('highlights a row while its button is held', async ({ page }) => {
    await connectPad(page);
    const jump = page.getByTestId('controller-hud-jump');
    await expect(jump).toHaveAttribute('data-held', 'false');

    await setPadState(page, { buttons: withButtons(0) });
    await expect(jump).toHaveAttribute('data-held', 'true');

    await setPadState(page, { buttons: withButtons() });
    await expect(jump).toHaveAttribute('data-held', 'false');
  });

  test('highlights only the row that was pressed', async ({ page }) => {
    await connectPad(page);
    await setPadState(page, { buttons: withButtons(2) });
    await expect(
      page.getByTestId('controller-hud-interactPrimary'),
    ).toHaveAttribute('data-held', 'true');
    await expect(page.getByTestId('controller-hud-jump')).toHaveAttribute(
      'data-held',
      'false',
    );
  });
});
