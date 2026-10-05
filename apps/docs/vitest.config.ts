import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      thresholds: { 100: true },
      include: [
        '.vitepress/theme/playground/live-compiler.ts',
        '.vitepress/theme/compiler.worker.ts',
      ],
    },
  },
});
