import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
export default defineConfig({
  plugins: [twill()],
  build: {
    lib: { entry: 'src/index.twill', formats: ['es'], fileName: 'index' },
    sourcemap: true,
    target: 'es2022',
  },
});
