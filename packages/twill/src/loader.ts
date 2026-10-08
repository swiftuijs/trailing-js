import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ResolveHook, LoadHook } from 'node:module';
import { isTwillFile } from './extensions.js';
import { isDependency, needsTypeEmission, resolveSourceFile } from './files.js';
import { openCompilationCache, type CompilationCache } from './compilation-cache.js';

let entries = new Set<string>();
let cacheEnabled = false;
let cache: CompilationCache | undefined;
let cacheInitialized = false;
export function initialize(data: { entries?: string[]; cache?: boolean } | undefined) {
  entries = new Set(data?.entries);
  cacheEnabled = data?.cache === true && process.env.TWILL_CACHE !== '0';
  cache = undefined;
  cacheInitialized = false;
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
  const dialect = isTwillFile(filename) || entries.has(url);
  if (!dialect && (isDependency(filename) || !needsTypeEmission(filename)))
    return nextLoad(url, context);
  const source = readFileSync(filename, 'utf8');
  if (cacheEnabled && !cacheInitialized) {
    cache = openCompilationCache();
    cacheInitialized = true;
  }
  const cached = cache?.read(url, source, dialect);
  if (cached !== undefined) return { format: 'module', source: cached, shortCircuit: true };
  const { compileModule } = await import('./loader-compiler.js');
  const result = compileModule(source, filename, dialect);
  cache?.write(url, source, dialect, result.source, result.observations);
  return { format: 'module', source: result.source, shortCircuit: true };
};
