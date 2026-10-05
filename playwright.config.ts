import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30000,
  expect: { timeout: 10000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: process.env.TWILL_BROWSER_OUTPUT ?? join(tmpdir(), 'twill-browser-results'),
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
      testMatch: 'docs.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 960 },
        baseURL: 'http://127.0.0.1:4173/twill/',
      },
    },
    {
      name: 'docs-mobile',
      testMatch: 'docs.spec.ts',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        baseURL: 'http://127.0.0.1:4173/twill/',
      },
    },
    {
      name: 'react-refresh',
      testMatch: 'refresh.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @swiftuijs/twill-docs preview --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173/twill/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node scripts/browser-fixture.mjs',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
