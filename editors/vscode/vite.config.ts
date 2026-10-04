import { defineConfig } from 'vite';
import { nodeViteConfig } from '../../scripts/node-vite-config.mjs';

export default defineConfig(
  nodeViteConfig({
    entry: 'src/extension.ts',
    filename: 'extension.cjs',
    external: ['vscode'],
    minify: true,
  }),
);
