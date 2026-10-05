import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { builtinModules } from 'node:module';
import metadata from './package.json' with { type: 'json' };

export default defineConfig({
  publicDir: false,
  plugins: [dts({ tsconfigPath: 'tsconfig.build.json', entryRoot: 'src', outDirs: ['dist'] })],
  build: {
    ssr: true,
    target: 'node20',
    minify: false,
    sourcemap: true,
    lib: {
      entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
    },
    rolldownOptions: {
      external: (id) =>
        builtinModules.includes(id) ||
        id.startsWith('node:') ||
        Object.keys(metadata.dependencies).some((name) => id === name || id.startsWith(name + '/')),
    },
  },
});
