import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['packages/twill/src/**'],
      exclude: ['packages/twill/src/{vite,rollup,esbuild,webpack,rspack,index}.ts'],
    },
  },
});
