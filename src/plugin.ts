import { dirname, isAbsolute, resolve } from 'node:path';
import { createUnplugin } from 'unplugin';
import { isTwillFile, type TransformOptions } from './compiler';
import { loadConfig } from './config';
import { transpile, transpileNative } from './transpile';
import {
  isDependency,
  needsTypeEmission,
  splitId,
  resolveSourceFile,
  sourceExtensions,
} from './files';

export interface PluginOptions extends Omit<TransformOptions, 'filename' | 'language'> {
  root?: string;
  /** Resolve relative extensionless native/Twill sources. Defaults to true. */
  resolveExtensions?: boolean;
  /** Native TS/JSX emission: defaults off for Vite/esbuild, on for Rollup/webpack/rspack. */
  nativeSources?: boolean;
}

export const twillPlugin = createUnplugin<PluginOptions | undefined, false>(
  (options = {}, meta) => {
    let root = options.root ?? process.cwd();
    let config = { ...loadConfig(root), ...options };
    // Reuse native host emission where it already exists.
    const nativeSources = options.nativeSources ?? !['vite', 'esbuild'].includes(meta.framework);
    return {
      name: 'twill',
      enforce: 'pre',
      esbuild: {
        setup(build) {
          // unplugin tags its resolved files with a custom namespace. Native
          // dependencies of those files must re-enter esbuild's normal resolver.
          build.onResolve({ filter: /.*/, namespace: 'twill' }, (args) =>
            build.resolve(args.path, {
              resolveDir: dirname(args.importer),
              kind: args.kind,
            }),
          );
        },
      },
      vite: {
        configResolved(viteConfig) {
          root = options.root ?? viteConfig.root;
          config = { ...loadConfig(root), ...options };
        },
        config() {
          return {
            resolve: {
              extensions: sourceExtensions,
            },
          };
        },
        configureServer(server) {
          server.watcher.add(resolve(root, 'twill.config.json'));
          server.watcher.on('change', (filename) => {
            if (filename === resolve(root, 'twill.config.json')) {
              config = { ...loadConfig(root), ...options };
              server.ws.send({ type: 'full-reload' });
            }
          });
        },
      },
      resolveId(id, importer) {
        if (options.resolveExtensions === false || (!id.startsWith('.') && !isAbsolute(id)))
          return null;
        const [path, query] = splitId(id);
        const base = isAbsolute(path!)
          ? path!
          : resolve(importer ? dirname(splitId(importer)[0]) : root, path!);
        const candidate = resolveSourceFile(base);
        if (!candidate || candidate === base) return null;
        if (meta.framework === 'esbuild' && !isTwillFile(candidate)) return null;
        return candidate + query;
      },
      transformInclude(id) {
        const filename = splitId(id)[0];
        return (
          !isDependency(filename) &&
          (isTwillFile(filename) || (nativeSources && needsTypeEmission(filename)))
        );
      },
      transform(source, id) {
        const filename = splitId(id)[0];
        if (isDependency(filename)) return null;
        if (isTwillFile(filename)) {
          this.addWatchFile(resolve(root, 'twill.config.json'));
          return transpile(source, { ...config, filename });
        }
        return nativeSources && needsTypeEmission(filename)
          ? transpileNative(source, filename)
          : null;
      },
    };
  },
);
