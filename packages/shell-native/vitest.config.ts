import { defineConfig } from 'vitest/config';
import twill from '@swiftuijs/twill/vite';
export default defineConfig({
  plugins: [twill()],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 98, branches: 95, functions: 100, lines: 99 },
    },
  },
});
