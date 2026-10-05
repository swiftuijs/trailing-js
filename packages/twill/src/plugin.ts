import { dirname, isAbsolute, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createUnplugin } from 'unplugin';
import { isTwillFile, type TransformOptions } from './compiler.js';
import { loadConfig, configurationFiles } from './config.js';
import { transpile, transpileNative } from './transpile.js';
import {
  isDependency,
  needsTypeEmission,
  splitId,
  resolveSourceFile,
  sourceExtensions,
} from './files.js';

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
    let servingVite = false;
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
          servingVite = viteConfig.command === 'serve';
        },
        config() {
          return {
            resolve: {
              extensions: sourceExtensions,
            },
          };
        },
        configureServer(server) {
          let files = new Set(configurationFiles(root).map((file) => resolve(file)));
          // Watch the parent of an absent file. Registering a missing path
          // directly can narrow Chokidar's directory filter and lose additions.
          const watch = () =>
            server.watcher.add([...files].map((file) => (existsSync(file) ? file : dirname(file))));
          watch();
          let update: ReturnType<typeof setTimeout> | undefined;
          const changed = (filename: string) => {
            if (files.has(resolve(filename))) {
              clearTimeout(update);
              // Chokidar throttles rapid changes for 50 ms. Read after that
              // window so consecutive saves use the final contents, and a
              // correction after an error overlay produces another event.
              update = setTimeout(() => {
                try {
                  config = { ...loadConfig(root), ...options };
                } catch (cause) {
                  const error = cause instanceof Error ? cause : new Error(String(cause));
                  server.config.logger.error(error.message);
                  server.ws.send({
                    type: 'error',
                    err: { message: error.message, stack: error.stack ?? '', plugin: 'twill' },
                  });
                  return;
                }
                files = new Set(configurationFiles(root).map((file) => resolve(file)));
                watch();
                if (server.environments)
                  for (const environment of Object.values(server.environments))
                    environment.moduleGraph.invalidateAll();
                else server.moduleGraph.invalidateAll();
                server.ws.send({ type: 'full-reload' });
              }, 75);
            }
          };
          server.watcher.on('change', changed).on('add', changed).on('unlink', changed);
          server.httpServer?.once('close', () => clearTimeout(update));
          // Chokidar removes listeners when the watcher closes. HTTP can close
          // and reopen independently of the watcher during server setup.
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
          // Vite's dev import analysis treats addWatchFile as a browser import.
          // Watch config with the server instead; a missing optional config
          // must never become an unresolved browser module.
          if (!servingVite)
            for (const file of configurationFiles(root))
              if (existsSync(file)) this.addWatchFile(file);
          return transpile(source, { ...config, filename });
        }
        return nativeSources && needsTypeEmission(filename)
          ? transpileNative(source, filename, undefined, undefined, config.jsxImportSource)
          : null;
      },
    };
  },
);
