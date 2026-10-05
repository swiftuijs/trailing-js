import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: {
        statements: 96,
        branches: 89,
        functions: 96,
        lines: 98,
        'src/compiler.ts': { statements: 100, branches: 97, functions: 100, lines: 100 },
        'src/parser.js': { statements: 98, branches: 96, functions: 100, lines: 100 },
      },
      include: ['src/**'],
    },
  },
});
