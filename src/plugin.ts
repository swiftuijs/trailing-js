import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { createUnplugin } from 'unplugin';
import { extensions, isTwillFile, type TransformOptions } from './compiler';
import { loadConfig } from './config';
import { transpile } from './transpile';

export interface PluginOptions extends Omit<TransformOptions, 'filename' | 'language'> {
  root?: string;
  /** Extensionless imports search Twill extensions after normal resolution. */
  resolveExtensions?: boolean;
}

export const twillPlugin = createUnplugin<PluginOptions | undefined>((options = {}) => {
  let root = options.root ?? process.cwd();
  let config = { ...loadConfig(root), ...options };
  return {
    name: 'twill',
    enforce: 'pre',
    vite: {
      configResolved(viteConfig) {
        root = options.root ?? viteConfig.root;
        config = { ...loadConfig(root), ...options };
      },
      config() {
        return {
          resolve: {
            extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', ...extensions],
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
      const [path, query = ''] = id.split(/(?=[?#])/);
      const base = isAbsolute(path!)
        ? path!
        : resolve(importer ? dirname(importer.split(/[?#]/)[0]!) : root, path!);
      // Leave existing files and standard extensions to the host resolver.
      if (existsSync(base)) return null;
      for (const extension of extensions) {
        for (const candidate of [base + extension, resolve(base, 'index' + extension)]) {
          if (existsSync(candidate)) return candidate + query;
        }
      }
      return null;
    },
    transformInclude(id) {
      return isTwillFile(id) && !/(?:^|\/)node_modules\//.test(id);
    },
    transform(source, id) {
      if (!isTwillFile(id)) return null;
      const filename = id.split(/[?#]/)[0]!;
      this.addWatchFile(resolve(root, 'twill.config.json'));
      return transpile(source, { ...config, filename });
    },
  };
});
