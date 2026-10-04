import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({
  plugins: [twill()],
  build: {
    ssr: 'main.twill',
    target: 'node20',
    sourcemap: true,
    minify: false,
    rolldownOptions: { output: { entryFileNames: 'main.js' } },
  },
});
