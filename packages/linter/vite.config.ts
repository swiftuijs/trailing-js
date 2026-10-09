import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
import { builtinModules } from 'node:module';
import metadata from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [twill()],
  build: {
    ssr: true,
    lib: { entry: 'src/index.twill', formats: ['es'], fileName: () => 'index.js' },
    target: 'node20',
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: (id) =>
        builtinModules.includes(id) ||
        id.startsWith('node:') ||
        [...Object.keys(metadata.dependencies), ...Object.keys(metadata.peerDependencies)].some(
          (dependency) => id === dependency || id.startsWith(dependency + '/'),
        ),
    },
  },
});
