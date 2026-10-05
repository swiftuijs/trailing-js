import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: join(process.env.TWILL_BROWSER_OUTPUT ?? tmpdir(), 'twill-highlight'),
  use: { baseURL: 'http://127.0.0.1:4177', trace: 'retain-on-failure' },
  webServer: {
    command: 'node tests/browser/server.mjs',
    url: 'http://127.0.0.1:4177',
    reuseExistingServer: !process.env.CI,
  },
});
