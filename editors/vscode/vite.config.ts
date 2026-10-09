import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
import { nodeViteConfig } from '../../packages/twill/scripts/node-vite-config.mjs';

export default defineConfig({
  ...nodeViteConfig({
    entry: 'src/extension.twill',
    filename: 'extension.cjs',
    external: ['vscode', 'typescript'],
    minify: true,
  }),
  plugins: [twill()],
});
