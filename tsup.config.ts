import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/vite.ts',
    'src/rollup.ts',
    'src/esbuild.ts',
    'src/webpack.ts',
    'src/rspack.ts',
    'src/project.ts',
    'src/cli.ts',
    'src/register.ts',
    'src/loader.ts',
  ],
  format: ['esm'],
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  external: ['react', 'vue'],
});
