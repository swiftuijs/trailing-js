import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: join(
    process.env.TWILL_BROWSER_OUTPUT ?? join(tmpdir(), 'twill-browser-results'),
    'compiler',
  ),
  reporter: [['list']],
  use: {
    launchOptions: process.env.TWILL_CHROMIUM_PATH
      ? { executablePath: process.env.TWILL_CHROMIUM_PATH }
      : {},
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'react-refresh',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
    },
  ],
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
  },
});
