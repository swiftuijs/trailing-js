import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: 'tests/browser',
  outputDir: join(process.env.TWILL_BROWSER_OUTPUT ?? tmpdir(), 'twill-react-framework'),
  timeout: 30000,
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm build && node tests/browser/server.mjs',
    url: 'http://127.0.0.1:4179',
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
