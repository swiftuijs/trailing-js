import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { extensions } from './compiler';

export const sourceExtensions = [
  '.mjs',
  '.js',
  '.mts',
  '.ts',
  '.jsx',
  '.tsx',
  '.cjs',
  '.cts',
  '.json',
  ...extensions,
];
export function isDependency(filename: string) {
  return /(?:^|[\\/])node_modules[\\/]/.test(filename);
}
export function needsTypeEmission(filename: string) {
  return /\.(?:tsx?|mts|jsx)$/.test(filename) && !/\.d\.(?:ts|mts)$/.test(filename);
}
export function splitId(id: string): [string, string] {
  const index = id.search(/[?#]/);
  return index < 0 ? [id, ''] : [id.slice(0, index), id.slice(index)];
}
export function resolveSourceFile(base: string): string | undefined {
  const file = (candidate: string) => {
    try {
      return statSync(candidate).isFile();
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
      throw error;
    }
  };
  if (file(base)) return base;
  // Match the native-first order of the Vite resolver. Explicit filenames
  // remain the way to select one of several same-stem source files.
  for (const extension of sourceExtensions) if (file(base + extension)) return base + extension;
  for (const extension of sourceExtensions) {
    const candidate = resolve(base, 'index' + extension);
    if (file(candidate)) return candidate;
  }
}
