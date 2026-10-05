import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [dts({ tsconfigPath: 'tsconfig.build.json', entryRoot: 'src' })],
  build: {
    lib: {
      entry: { index: 'src/index.ts', shiki: 'src/shiki.ts' },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
    },
    target: 'es2022',
    minify: false,
    sourcemap: true,
    rolldownOptions: { external: (id) => id === 'shiki' || id.startsWith('shiki/') },
  },
});
