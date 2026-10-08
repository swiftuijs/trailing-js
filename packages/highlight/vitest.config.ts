import { defineConfig } from 'vitest/config';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({
  plugins: [twill()],
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
