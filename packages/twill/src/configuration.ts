import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import type { TransformOptions } from './compiler.js';
import { digest, observe, type ConfigurationObservation } from './compilation-cache.js';

type Config = Pick<TransformOptions, 'implicitReturn' | 'jsxImportSource' | 'runtime'>;
type Observations = Map<string, ConfigurationObservation>;
const jsxConfigs = new Map<string, { files: Map<string, number>; source?: string }>();

function record(observations: Observations, path: string, kind: ConfigurationObservation['kind']) {
  path = resolve(path);
  observations.set(kind + path, { path, kind, value: observe(path, kind) });
}

/** Use the project's standard JSX setting, including extended tsconfigs. */
function jsxSource(
  root: string,
  configFile?: string,
  observations?: Observations,
): string | undefined {
  const system = observations
    ? {
        ...ts.sys,
        fileExists(path: string) {
          record(observations, path, 'file');
          return ts.sys.fileExists(path);
        },
        directoryExists(path: string) {
          record(observations, path, 'directory');
          return ts.sys.directoryExists(path);
        },
      }
    : ts.sys;
  const filename = configFile ?? ts.findConfigFile(root, system.fileExists);
  if (!filename) return undefined;
  const cached = jsxConfigs.get(filename);
  if (
    !observations &&
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
      ...system,
      // Only read configuration, not the project's source tree.
      readDirectory: () => [],
      readFile(file) {
        files.set(file, existsSync(file) ? statSync(file).mtimeMs : -1);
        if (!observations) return ts.sys.readFile(file);
        const path = resolve(file);
        let bytes: Buffer;
        try {
          bytes = readFileSync(file);
        } catch {
          observations.set('file' + path, { path, kind: 'file', value: 'unavailable' });
          return undefined;
        }
        observations.set('file' + path, { path, kind: 'file', value: digest(bytes) });
        // Match ts.sys.readFile's BOM decoding while hashing the exact read bytes.
        if (bytes[0] === 254 && bytes[1] === 255) {
          for (let i = 0; i < (bytes.length & ~1); i += 2) {
            const byte = bytes[i]!;
            bytes[i] = bytes[i + 1]!;
            bytes[i + 1] = byte;
          }
          return bytes.toString('utf16le', 2);
        }
        if (bytes[0] === 255 && bytes[1] === 254) return bytes.toString('utf16le', 2);
        return bytes.toString(
          'utf8',
          bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 ? 3 : 0,
        );
      },
      getCurrentDirectory: () => root,
      onUnRecoverableConfigFileDiagnostic() {},
    },
  );
  const source = parsed?.options.jsxImportSource;
  jsxConfigs.set(filename, { files, source });
  return source;
}

function readConfig(root: string, configFile?: string, observations?: Observations): Config {
  const filename = resolve(root, 'twill.config.json');
  const jsxImportSource = jsxSource(root, configFile, observations);
  if (observations) record(observations, filename, 'file');
  if (!existsSync(filename)) return { jsxImportSource };
  const text = readFileSync(filename, 'utf8');
  if (observations) {
    observations.set('file' + filename, { path: filename, kind: 'file', value: digest(text) });
  }
  const value = JSON.parse(text);
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

export function loadConfig(root = process.cwd(), configFile?: string): Config {
  return readConfig(root, configFile);
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

/** Fresh, content-based observations for persistent runner cache validation. */
export function loaderConfiguration(filename: string): {
  config: Config;
  observations: ConfigurationObservation[];
} {
  const observations: Observations = new Map();
  let root = dirname(filename);
  for (;;) {
    const twill = resolve(root, 'twill.config.json');
    const typescript = resolve(root, 'tsconfig.json');
    record(observations, twill, 'file');
    record(observations, typescript, 'file');
    if (existsSync(twill) || existsSync(typescript))
      return {
        config: readConfig(root, undefined, observations),
        observations: [...observations.values()],
      };
    const parent = dirname(root);
    if (parent === root) return { config: {}, observations: [...observations.values()] };
    root = parent;
  }
}
