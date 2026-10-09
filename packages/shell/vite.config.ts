import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
import { builtinModules } from 'node:module';
import metadata from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [twill()],
  build: {
    ssr: true,
    lib: {
      entry: {
        cwd: 'src/cwd.twill',
        environment: 'src/environment.twill',
        errors: 'src/errors.twill',
        index: 'src/index.twill',
        values: 'src/values.twill',
      },
      formats: ['es'],
      fileName: (_format, name) => name + '.js',
    },
    target: 'node20',
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      external: (id) =>
        builtinModules.includes(id) ||
        id.startsWith('node:') ||
        Object.keys(metadata.dependencies ?? {}).some(
          (name) => id === name || id.startsWith(name + '/'),
        ),
    },
  },
});
