import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
import { builtinModules } from 'node:module';

export default defineConfig({
  plugins: [twill()],
  build: {
    ssr: true,
    lib: {
      entry: {
        bindings: 'src/bindings.twill',
        index: 'src/index.twill',
        libc: 'src/libc.twill',
        platform: 'src/platform.twill',
      },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: (id) => builtinModules.includes(id) || id.startsWith('node:'),
    },
  },
});
