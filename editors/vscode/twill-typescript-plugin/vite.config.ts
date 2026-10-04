import { defineConfig } from 'vite';
import { nodeViteConfig } from '../../../scripts/node-vite-config.mjs';

export default defineConfig(
  nodeViteConfig({
    entry: 'src/index.ts',
    filename: 'index.cjs',
    minify: true,
    footer: 'module.exports = module.exports.default;',
  }),
);
