import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: {
        statements: 98,
        branches: 95,
        functions: 99,
        lines: 99,
        'src/compiler.ts': { statements: 100, branches: 98, functions: 100, lines: 100 },
        'src/parser.js': { statements: 98, branches: 97, functions: 100, lines: 100 },
        'src/typescript-plugin.ts': { statements: 98, branches: 93, functions: 100, lines: 100 },
      },
      include: ['src/**'],
    },
  },
});
