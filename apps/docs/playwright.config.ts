import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const baseURL = 'http://127.0.0.1:4173' + (process.env.TWILL_DOCS_BASE ?? '/');
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: join(
    process.env.TWILL_BROWSER_OUTPUT ?? join(tmpdir(), 'twill-browser-results'),
    'docs',
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
      name: 'docs-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
        baseURL,
      },
    },
    {
      name: 'docs-mobile',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        baseURL,
      },
    },
  ],
  webServer: {
    command: 'pnpm preview --host 127.0.0.1 --port 4173',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
