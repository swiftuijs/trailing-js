import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ResolveHook, LoadHook } from 'node:module';
import { extensions, isTrailingFile } from './compiler';
import { transpile } from './transpile';
import { loadConfig } from './config';

function configuration(filename: string) {
  let root = dirname(filename);
  for (;;) {
    if (existsSync(resolvePath(root, 'trailing.config.json'))) return loadConfig(root);
    const parent = dirname(root);
    if (parent === root) return {};
    root = parent;
  }
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const target = new URL(specifier, context.parentURL);
      const base = fileURLToPath(target);
      for (const extension of extensions) {
        for (const candidate of [base + extension, resolvePath(base, 'index' + extension)]) {
          if (existsSync(candidate))
            return {
              url: pathToFileURL(candidate).href + target.search + target.hash,
              shortCircuit: true,
            };
        }
      }
    }
    throw error;
  }
};

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!url.startsWith('file:')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  if (!isTrailingFile(filename)) return nextLoad(url, context);
  const result = transpile(readFileSync(filename, 'utf8'), {
    ...configuration(filename),
    filename,
  });
  return {
    format: 'module',
    source:
      result.code +
      '\n//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(result.map).toString('base64'),
    shortCircuit: true,
  };
};
