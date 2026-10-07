import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { TransformOptions } from './compiler.js';

type Config = Pick<TransformOptions, 'implicitReturn' | 'jsxImportSource' | 'runtime'>;
const jsxConfigs = new Map<string, { files: Map<string, number>; source?: string }>();

/** Use the project's standard JSX setting, including extended tsconfigs. */
function jsxSource(root: string, configFile?: string): string | undefined {
  const filename = configFile ?? ts.findConfigFile(root, ts.sys.fileExists);
  if (!filename) return undefined;
  const cached = jsxConfigs.get(filename);
  if (
    cached &&
    [...cached.files].every(
      ([file, time]) => (existsSync(file) ? statSync(file).mtimeMs : -1) === time,
    )
  )
    return cached.source;
  const files = new Map<string, number>();
  const parsed = ts.getParsedCommandLineOfConfigFile(
    filename,
    {},
    {
      ...ts.sys,
      // Only read configuration, not the project's source tree.
      readDirectory: () => [],
      readFile(file) {
        files.set(file, existsSync(file) ? statSync(file).mtimeMs : -1);
        return ts.sys.readFile(file);
      },
      getCurrentDirectory: () => root,
      onUnRecoverableConfigFileDiagnostic() {},
    },
  );
  const source = parsed?.options.jsxImportSource;
  jsxConfigs.set(filename, { files, source });
  return source;
}

export function loadConfig(root = process.cwd(), configFile?: string): Config {
  const filename = resolve(root, 'twill.config.json');
  const jsxImportSource = jsxSource(root, configFile);
  if (!existsSync(filename)) return { jsxImportSource };
  const value = JSON.parse(readFileSync(filename, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${filename}: expected an object`);
  if (value.implicitReturn !== undefined && typeof value.implicitReturn !== 'boolean')
    throw new Error(`${filename}: implicitReturn must be a boolean`);
  if (value.runtime !== undefined && !['inline', 'external'].includes(value.runtime))
    throw new Error(`${filename}: runtime must be inline or external`);
  for (const key of Object.keys(value))
    if (!['implicitReturn', 'runtime', '$schema'].includes(key))
      throw new Error(`${filename}: unknown option ${key}`);
  return {
    implicitReturn: value.implicitReturn,
    jsxImportSource,
    ...(value.runtime === undefined ? {} : { runtime: value.runtime }),
  };
}

/** Config dependencies, including inherited tsconfigs and optional new files. */
export function configurationFiles(root: string): string[] {
  jsxSource(root);
  const tsconfig = ts.findConfigFile(root, ts.sys.fileExists);
  return [
    ...new Set(
      [
        resolve(root, 'twill.config.json'),
        resolve(root, 'tsconfig.json'),
        ...(tsconfig ? [...(jsxConfigs.get(tsconfig)?.files.keys() ?? [tsconfig])] : []),
      ].map((file) => resolve(file)),
    ),
  ];
}
