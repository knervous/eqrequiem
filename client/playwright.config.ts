import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 5199);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Rebuilds the harness bundles, then serves them statically. No game assets,
  // backend or dev server involved.
  webServer: {
    command: `node e2e/build-harness.mjs && npx http-server e2e/.artifacts -p ${PORT} -c-1 --silent`,
    url: `http://127.0.0.1:${PORT}/gamepad.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
