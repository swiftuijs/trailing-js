import { defineConfig } from 'vitest/config';
import twill from '@swiftuijs/twill/vite';
export default defineConfig({
  plugins: [twill()],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: { statements: 98, branches: 97, functions: 100, lines: 100 },
      include: ['src/**'],
    },
  },
});
