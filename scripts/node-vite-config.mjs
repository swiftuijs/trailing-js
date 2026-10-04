import { builtinModules } from 'node:module';

/** Vite library mode for Node tooling, with an explicit external boundary.
 * @param {{ entry: string, filename: string, outDir?: string, external?: (string | RegExp)[], minify?: boolean, emptyOutDir?: boolean, footer?: string, license?: string }} options
 * @returns {import('vite').UserConfig}
 */
export function nodeViteConfig({
  entry,
  filename,
  outDir = 'dist',
  external = [],
  minify = false,
  emptyOutDir = true,
  footer = '',
  license = 'THIRD_PARTY_LICENSES.txt',
}) {
  return {
    publicDir: false,
    resolve: { conditions: ['node'] },
    ssr: { noExternal: true },
    build: {
      ssr: true,
      lib: { entry, formats: ['cjs'], fileName: () => filename },
      outDir,
      emptyOutDir,
      target: 'node20',
      minify,
      sourcemap: true,
      license: { fileName: license },
      rolldownOptions: {
        external: [...builtinModules, /^node:/, ...external],
        output: { exports: 'named', entryFileNames: filename, footer },
      },
    },
  };
}
