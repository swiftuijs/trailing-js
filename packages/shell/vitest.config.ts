import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Process/lifetime tests provide their own concurrency. Separate suites
    // must not distort descriptor baselines or compete with compiler fixtures.
    fileParallelism: false,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { statements: 98, branches: 95, functions: 100, lines: 99 },
    },
  },
});
