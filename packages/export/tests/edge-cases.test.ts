import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  lstatSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { exportProject } from '../src/index.twill';
import { TwillProject } from '@swiftuijs/twill/project';
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, writeFileSync: vi.fn(fs.writeFileSync), lstatSync: vi.fn(fs.lstatSync) };
});
const roots: string[] = [];
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  vi.mocked(writeFileSync).mockRestore();
  vi.mocked(lstatSync).mockRestore();
  vi.restoreAllMocks();
});
it('propagates a destination permission failure before creating any output', async () => {
  const { config, out } = fixture({ 'main.twill': 'export const value=1;' });
  const failure = Object.assign(new Error('destination access denied'), { code: 'EACCES' });
  vi.mocked(lstatSync).mockImplementationOnce(() => {
    throw failure;
  });
  await expect(exportProject(config, { outDir: out })).rejects.toBe(failure);
  expect(existsSync(out)).toBe(false);
});
it('reports a config removed during preflight without creating partial output', async () => {
  const { config, out } = fixture({ 'main.twill': 'export const value=1;' });
  const diagnostics = TwillProject.prototype.diagnostics;
  vi.spyOn(TwillProject.prototype, 'diagnostics').mockImplementation(function (
    this: TwillProject,
    ...args
  ) {
    const result = diagnostics.apply(this, args);
    rmSync(config);
    return result;
  });
  await expect(exportProject(config, { outDir: out })).rejects.toThrow(
    'Could not read export configuration',
  );
  expect(existsSync(out)).toBe(false);
});
it('rejects a native module colliding with an earlier dialect module during resolution', async () => {
  const { config, out } = fixture({
    'api.twill': 'export const value=1;',
    'api.mts': 'export const other=2;',
  });
  const configuration = JSON.parse(readFileSync(config, 'utf8'));
  delete configuration.include;
  configuration.files = ['api.twill', 'api.mts'];
  writeFileSync(config, JSON.stringify(configuration));
  await expect(exportProject(config, { outDir: out })).rejects.toThrow(
    'module resolution collision',
  );
  expect(existsSync(out)).toBe(false);
});
function fixture(files: Record<string, string>, options: Record<string, unknown> = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'twill-export-edges-'));
  roots.push(directory);
  const root = join(directory, 'input');
  mkdirSync(root);
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), source);
  }
  const config = join(root, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        types: [],
        ...options,
      },
      include: ['**/*'],
    }),
  );
  return { directory, root, config, out: join(directory, 'output') };
}
it.each([
  [
    'CommonJS',
    'declare function require(path:string):unknown; export const value=require("./api.twill");',
    /CommonJS dialect imports/,
  ],
  [
    'globs',
    'declare global { interface ImportMeta { glob(path:string):unknown; } } export const value=import.meta.glob("./*.twill");',
    /Dialect import globs/,
  ],
])('refuses unsafe %s import rewriting before any output', async (_name, source, message) => {
  const { config, out } = fixture({
    'api.twill': 'export const value=1;',
    'main.ts': source as string,
  });
  await expect(exportProject(config, { outDir: out })).rejects.toThrow(message as RegExp);
  expect(existsSync(out)).toBe(false);
});
it('exports explicitly imported assets and preserves module queries and source contents', async () => {
  const { config, out } = fixture({
    'api.twill': 'export const value=1;',
    'main.ts':
      'import text from "./note.txt?raw";export const content=text;export {value} from "./api.twill?mode=source#fragment";',
    'modules.d.ts':
      'declare module "*.txt?raw" {const text:string;export default text;} declare module "*.twill?mode=source#fragment" { export const value:number; }',
    'note.txt': '📦 keep exact content\r\n',
  });
  const result = await exportProject(config, { outDir: out });
  expect(result.diagnostics).toEqual([]);
  expect(result.written).toBe(true);
  expect(readFileSync(join(out, 'note.txt'), 'utf8')).toBe('📦 keep exact content\r\n');
  expect(readFileSync(join(out, 'main.ts'), 'utf8')).toContain('./api.ts?mode=source#fragment');
});
it('rebases array and scalar paths and removes only Twill TS-server plugins', async () => {
  const { root, config, out } = fixture(
    { 'src/api.twill': 'export const value=1;', 'main.ts': 'export {value} from "@api";' },
    {
      baseUrl: '.',
      rootDir: '.',
      rootDirs: ['.', './src'],
      typeRoots: [],
      paths: { '@api': ['src/api.twill'] },
      plugins: [
        { name: '@swiftuijs/twill' },
        { name: '@swiftuijs/twill-vscode-tsserver' },
        { name: 'other-plugin' },
      ],
      newLine: 'crlf',
    },
  );
  const result = await exportProject(config, { outDir: out });
  expect(result.diagnostics).toEqual([]);
  const output = JSON.parse(readFileSync(result.tsconfig, 'utf8')).compilerOptions;
  expect(output.plugins).toEqual([{ name: 'other-plugin' }]);
  expect(output.rootDirs).toEqual(['.', 'src']);
  expect(output.rootDir).toBe('.');
  expect(output.typeRoots).toEqual([]);
  expect(output.paths).toEqual({ '@api': ['src/api.ts'] });
  expect(output.newLine).toBe('crlf');
  expect(readFileSync(join(root, 'main.ts'), 'utf8')).toContain('@api');
});
it('refuses compiler paths outside the source project before writing', async () => {
  const { config, out, directory } = fixture(
    { 'main.twill': 'export const value=1;' },
    { rootDirs: ['.', '..'] },
  );
  await expect(exportProject(config, { outDir: out })).rejects.toThrow('points outside');
  expect(existsSync(out)).toBe(false);
  expect(existsSync(directory)).toBe(true);
});
it('removes its incomplete output directory when a disk write fails', async () => {
  const { config, out, root } = fixture({ 'main.twill': 'export const value=1;' });
  const real = await vi.importActual<typeof import('node:fs')>('node:fs');
  vi.mocked(writeFileSync).mockImplementation((...args: any[]) => {
    if (String(args[0]) === join(out, 'tsconfig.json'))
      throw Object.assign(new Error('disk write failed'), { code: 'ENOSPC' });
    return (real.writeFileSync as any)(...args);
  });
  await expect(exportProject(config, { outDir: out })).rejects.toThrow('disk write failed');
  expect(existsSync(out)).toBe(false);
  expect(readFileSync(join(root, 'main.twill'), 'utf8')).toBe('export const value=1;');
});

it('rejects inherited aliases without a source-export base directory', async () => {
  const { root, config, out } = fixture({
    'api.twill': 'export const value=1;',
    'main.ts': 'export {value} from "@api";',
  });
  writeFileSync(join(root, 'base.json'), '{"compilerOptions":{"paths":{"@api":["./api.twill"]}}}');
  const settings = JSON.parse(readFileSync(config, 'utf8'));
  settings.extends = './base.json';
  writeFileSync(config, JSON.stringify(settings));
  await expect(exportProject(config, { outDir: out })).rejects.toThrow('Inherited path aliases');
  expect(existsSync(out)).toBe(false);
});
it.each([
  ['./api.twill?source', 'api.twill', 'export const value=1;', /missing from the checked graph/],
  ['./missing.twill', undefined, undefined, /missing from the export graph/],
])(
  'rejects ambient imports absent from the checked graph: %s',
  async (specifier, name, source, message) => {
    const { root, config, out } = fixture({
      'main.ts': `import {value} from "${specifier}";export const result=value;`,
      'modules.d.ts': `declare module "*${String(specifier).slice(2)}" {export const value:number;}`,
    });
    if (name) writeFileSync(join(root, String(name)), String(source));
    const settings = JSON.parse(readFileSync(config, 'utf8'));
    settings.include = ['main.ts', 'modules.d.ts'];
    writeFileSync(config, JSON.stringify(settings));
    await expect(exportProject(config, { outDir: out })).rejects.toThrow(message as RegExp);
    expect(existsSync(out)).toBe(false);
  },
);
it('rewrites type-only import-equals declarations and preserves native require and glob calls', async () => {
  const { config, out } = fixture({
    'api.twill': 'export const value=1;',
    'main.ts':
      'import type api = require("./api.twill");export type Value=typeof api.value;declare function require(path:string):unknown;export const asset=require("./plain.json");declare global {interface ImportMeta{glob(path:string):unknown}} export const files=import.meta.glob("./*.ts");',
  });
  const result = await exportProject(config, { outDir: out });
  expect(result.diagnostics).toEqual([]);
  expect(result.written).toBe(true);
  const output = readFileSync(join(out, 'main.ts'), 'utf8');
  expect(output).toContain('require("./api.ts")');
  expect(output).toContain('require("./plain.json")');
  expect(output).toContain('glob("./*.ts")');
});
