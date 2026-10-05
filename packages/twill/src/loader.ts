import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ResolveHook, LoadHook } from 'node:module';
import { isTwillFile } from './compiler.js';
import { transpile, transpileNative } from './transpile.js';
import { loadConfig } from './config.js';
import { isDependency, needsTypeEmission, resolveSourceFile } from './files.js';
import ts from 'typescript';

function configuration(filename: string) {
  let root = dirname(filename);
  for (;;) {
    if (
      existsSync(resolvePath(root, 'twill.config.json')) ||
      existsSync(resolvePath(root, 'tsconfig.json'))
    )
      return loadConfig(root);
    const parent = dirname(root);
    if (parent === root) return {};
    root = parent;
  }
}

export const resolve: ResolveHook = async (specifier, context, nextResolve) => {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      ['ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_DIR_IMPORT'].includes(
        (error as NodeJS.ErrnoException).code ?? '',
      ) &&
      specifier.startsWith('.') &&
      context.parentURL?.startsWith('file:')
    ) {
      const target = new URL(specifier, context.parentURL);
      const base = fileURLToPath(target);
      const candidate = resolveSourceFile(base);
      if (candidate)
        return {
          url: pathToFileURL(candidate).href + target.search + target.hash,
          shortCircuit: true,
        };
    }
    throw error;
  }
};

export const load: LoadHook = async (url, context, nextLoad) => {
  if (!url.startsWith('file:')) return nextLoad(url, context);
  const filename = fileURLToPath(url);
  const dialect = isTwillFile(filename);
  if (!dialect && (isDependency(filename) || !needsTypeEmission(filename)))
    return nextLoad(url, context);
  const source = readFileSync(filename, 'utf8');
  const result = dialect
    ? transpile(source, { ...configuration(filename), filename }, ts.ScriptTarget.ES2022)
    : transpileNative(
        source,
        filename,
        undefined,
        undefined,
        configuration(filename).jsxImportSource,
        ts.ScriptTarget.ES2022,
      );
  return {
    format: 'module',
    source:
      result.code +
      '\n//# sourceMappingURL=data:application/json;base64,' +
      Buffer.from(result.map).toString('base64'),
    shortCircuit: true,
  };
};
