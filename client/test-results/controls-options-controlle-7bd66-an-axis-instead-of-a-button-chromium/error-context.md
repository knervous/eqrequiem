# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: controls-options.spec.ts >> controller rebinding >> a stick row captures an axis instead of a button
- Location: e2e/controls-options.spec.ts:108:3

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  getByTestId('gamepad-bind-lookAxisX')
Expected: "Left Stick Y"
Received: "Move a stick…"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" with timeout 5000ms
  - waiting for getByTestId('gamepad-bind-lookAxisX')
    14 × locator resolved to <button class="is-capturing" data-testid="gamepad-bind-lookAxisX">Move a stick…</button>
       - unexpected value "Move a stick…"

```

```yaml
- button "Move a stick…"
```

# Test source

```ts
  14  |   await installVirtualGamepad(page);
  15  |   await page.goto('/controls.html');
  16  |   await expect(page.getByTestId('controls-options')).toBeVisible();
  17  |   await page.evaluate(() => window.controlsHarness.reset());
  18  | });
  19  | 
  20  | test.describe('layout', () => {
  21  |   test('lists keyboard and controller bindings under grouped headings', async ({
  22  |     page,
  23  |   }) => {
  24  |     const panel = page.getByTestId('controls-options');
  25  |     await expect(panel.getByRole('heading', { name: 'Keyboard' })).toBeVisible();
  26  |     await expect(
  27  |       panel.getByRole('heading', { name: 'Controller' }),
  28  |     ).toBeVisible();
  29  |     await expect(page.getByTestId('keybind-moveForward')).toHaveText('W');
  30  |     await expect(page.getByTestId('keybind-sprint')).toHaveText('Shift');
  31  |     await expect(page.getByTestId('keybind-crouch')).toHaveText('Ctrl');
  32  |     await expect(page.getByTestId('gamepad-bind-jump')).toHaveText('A / Cross');
  33  |     await expect(page.getByTestId('gamepad-bind-moveAxisY')).toHaveText(
  34  |       'Left Stick Y',
  35  |     );
  36  |   });
  37  | 
  38  |   test('reports no controller until one connects', async ({ page }) => {
  39  |     await expect(page.getByTestId('gamepad-status')).toContainText(
  40  |       'No controller detected',
  41  |     );
  42  |     await connectPad(page);
  43  |     await expect(page.getByTestId('gamepad-status')).toContainText(
  44  |       'Virtual Controller',
  45  |     );
  46  |   });
  47  | });
  48  | 
  49  | test.describe('keyboard rebinding', () => {
  50  |   test('captures the next key pressed and persists it', async ({ page }) => {
  51  |     const button = page.getByTestId('keybind-moveForward');
  52  |     await button.click();
  53  |     await expect(button).toHaveText('Press a key…');
  54  |     await page.keyboard.press('k');
  55  |     await expect(button).toHaveText('K');
  56  | 
  57  |     const config = await readConfig(page);
  58  |     expect(config.keyBindings.moveForward).toBe('K');
  59  |   });
  60  | 
  61  |   test('records modifier combinations', async ({ page }) => {
  62  |     const button = page.getByTestId('keybind-sitStand');
  63  |     await button.click();
  64  |     await page.keyboard.press('Control+g');
  65  |     await expect(button).toHaveText('Ctrl+G');
  66  |   });
  67  | 
  68  |   test('escape cancels capture and leaves the binding alone', async ({
  69  |     page,
  70  |   }) => {
  71  |     const button = page.getByTestId('keybind-inventory');
  72  |     await button.click();
  73  |     await expect(button).toHaveText('Press a key…');
  74  |     await page.keyboard.press('Escape');
  75  |     await expect(button).toHaveText('I');
  76  | 
  77  |     const config = await readConfig(page);
  78  |     expect(config.keyBindings.inventory).toBe('I');
  79  |   });
  80  | 
  81  |   test('reset restores the keyboard defaults', async ({ page }) => {
  82  |     await page.getByTestId('keybind-moveForward').click();
  83  |     await page.keyboard.press('k');
  84  |     await expect(page.getByTestId('keybind-moveForward')).toHaveText('K');
  85  | 
  86  |     await page.getByTestId('reset-keybinds').click();
  87  |     await expect(page.getByTestId('keybind-moveForward')).toHaveText('W');
  88  |   });
  89  | });
  90  | 
  91  | test.describe('controller rebinding', () => {
  92  |   test('captures the next controller button pressed', async ({ page }) => {
  93  |     await connectPad(page);
  94  |     const button = page.getByTestId('gamepad-bind-inventory');
  95  |     await expect(button).toHaveText('Back / Share');
  96  | 
  97  |     await button.click();
  98  |     await expect(button).toHaveText('Press a button…');
  99  |     // The capture loop waits for an idle pad before accepting a press, so a
  100 |     // held button can't bind itself the instant the row opens.
  101 |     await setPadState(page, { buttons: withButtons(3) });
  102 |     await expect(button).toHaveText('Y / Triangle');
  103 | 
  104 |     const config = await readConfig(page);
  105 |     expect(config.gamepadBindings.inventory).toBe('Button3');
  106 |   });
  107 | 
  108 |   test('a stick row captures an axis instead of a button', async ({ page }) => {
  109 |     await connectPad(page);
  110 |     const button = page.getByTestId('gamepad-bind-lookAxisX');
  111 |     await button.click();
  112 |     await expect(button).toHaveText('Move a stick…');
  113 |     await setPadState(page, { axes: [0, -0.95, 0, 0] });
> 114 |     await expect(button).toHaveText('Left Stick Y');
      |                          ^ Error: expect(locator).toHaveText(expected) failed
  115 | 
  116 |     const config = await readConfig(page);
  117 |     expect(config.gamepadBindings.lookAxisX).toBe('Axis1');
  118 |   });
  119 | 
  120 |   test('clearing a binding leaves the action unbound', async ({ page }) => {
  121 |     const button = page.getByTestId('gamepad-bind-autoAttack');
  122 |     await expect(button).toHaveText('Right Trigger');
  123 |     await page.getByTestId('gamepad-clear-autoAttack').click();
  124 |     await expect(button).toHaveText('Unbound');
  125 | 
  126 |     const config = await readConfig(page);
  127 |     expect(config.gamepadBindings.autoAttack).toBe('');
  128 |   });
  129 | 
  130 |   test('reset restores the controller defaults', async ({ page }) => {
  131 |     await page.getByTestId('gamepad-clear-jump').click();
  132 |     await expect(page.getByTestId('gamepad-bind-jump')).toHaveText('Unbound');
  133 | 
  134 |     await page.getByTestId('reset-gamepad').click();
  135 |     await expect(page.getByTestId('gamepad-bind-jump')).toHaveText('A / Cross');
  136 |   });
  137 | });
  138 | 
  139 | test.describe('controller settings', () => {
  140 |   test('deadzone and sensitivity sliders write through to config', async ({
  141 |     page,
  142 |   }) => {
  143 |     await page.getByTestId('gamepad-deadzone').fill('0.35');
  144 |     await page.getByTestId('gamepad-sensitivity').fill('2');
  145 | 
  146 |     const config = await readConfig(page);
  147 |     expect(config.gamepad.deadzone).toBeCloseTo(0.35, 5);
  148 |     expect(config.gamepad.lookSensitivity).toBeCloseTo(2, 5);
  149 |     await expect(page.getByTestId('gamepad-deadzone')).toHaveValue('0.35');
  150 |   });
  151 | 
  152 |   test('toggles write through to config', async ({ page }) => {
  153 |     await page.getByTestId('gamepad-invert-look').check();
  154 |     await page.getByTestId('gamepad-invert-move').check();
  155 |     await page.getByTestId('gamepad-enabled').uncheck();
  156 | 
  157 |     const config = await readConfig(page);
  158 |     expect(config.gamepad.invertLookY).toBe(true);
  159 |     expect(config.gamepad.invertMoveY).toBe(true);
  160 |     expect(config.gamepad.enabled).toBe(false);
  161 |   });
  162 | });
  163 | 
```