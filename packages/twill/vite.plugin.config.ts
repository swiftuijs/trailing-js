import { defineConfig } from 'vite';
import { nodeViteConfig } from '../../scripts/node-vite-config.mjs';

export default defineConfig(
  nodeViteConfig({
    entry: 'src/typescript-plugin.ts',
    filename: 'typescript-plugin.cjs',
    emptyOutDir: false,
    external: ['typescript'],
    footer: 'module.exports = module.exports.default;',
    license: 'typescript-plugin.LICENSE.txt',
  }),
);
