import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TransformOptions } from './compiler';

export function loadConfig(
  root = process.cwd(),
): Pick<TransformOptions, 'builders' | 'implicitReturn'> {
  const filename = resolve(root, 'twill.config.json');
  if (!existsSync(filename)) return {};
  const value = JSON.parse(readFileSync(filename, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${filename}: expected an object`);
  if (
    value.builders !== undefined &&
    (!Array.isArray(value.builders) ||
      value.builders.some((name: unknown) => typeof name !== 'string' || !name))
  ) {
    throw new Error(`${filename}: builders must be an array of non-empty callee names`);
  }
  if (value.implicitReturn !== undefined && typeof value.implicitReturn !== 'boolean')
    throw new Error(`${filename}: implicitReturn must be a boolean`);
  for (const key of Object.keys(value))
    if (!['builders', 'implicitReturn', '$schema'].includes(key))
      throw new Error(`${filename}: unknown option ${key}`);
  return { builders: value.builders, implicitReturn: value.implicitReturn };
}
