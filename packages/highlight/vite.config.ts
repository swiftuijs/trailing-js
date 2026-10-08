import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({
  plugins: [twill()],
  build: {
    lib: {
      entry: { index: 'src/index.twill', shiki: 'src/shiki.twill' },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
    },
    target: 'es2022',
    minify: false,
    sourcemap: true,
    rolldownOptions: { external: (id) => id === 'shiki' || id.startsWith('shiki/') },
  },
});
