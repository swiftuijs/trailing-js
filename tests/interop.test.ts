import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TwillProject, virtualFilename, sourceFilename } from '../packages/twill/src/project';
import { twillPlugin } from '../packages/twill/src/plugin';
import { transpileNative } from '../packages/twill/src/transpile';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'twill-interop-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(root, name), text);
  }
  return root;
}

it('preserves native JS/TS semantics and maps native TS to its real filename', () => {
  const source = 'function run(): number { return 2; }\nrun()\n{ const guard=3; const defer=4; }';
  const output = transpileNative(source, 'native.ts');
  expect(output.code).not.toContain('=>');
  expect(output.code).toContain('const defer = 4');
  expect(JSON.parse(output.map).sources).toEqual(['native.ts']);
  expect(JSON.parse(output.map).sourcesContent).toEqual([source]);
  expect(() => transpileNative('fn() { 42 };', 'native.ts')).toThrow();
  expect(sourceFilename('native.twill.js')).toBe('native.twill.js');
  expect(sourceFilename('native.twill.jsx')).toBe('native.twill.jsx');
  const plugin = twillPlugin.raw({}, { framework: 'vite', versions: {} });
  expect(plugin.transformInclude!('native.twill.js')).toBe(false);
  expect(plugin.transformInclude!('native.twill.jsx')).toBe(false);
});

it('resolves native sources before same-stem Twill, and handles directory indexes and query suffixes', () => {
  const root = fixture({
    'value.ts': 'export const value=1;',
    'value.twill': 'export const value=2;',
  });
  mkdirSync(join(root, 'folder'));
  writeFileSync(join(root, 'folder/index.twill'), 'export const value=3;');
  const plugin = twillPlugin.raw({ root }, { framework: 'rollup', versions: {} });
  const resolve = plugin.resolveId as Function;
  expect(resolve('./value', join(root, 'main.twill'))).toBe(join(root, 'value.ts'));
  expect(resolve('./folder?mode=test#hash', join(root, 'main.ts'))).toBe(
    join(root, 'folder/index.twill') + '?mode=test#hash',
  );
  expect(resolve('./value.ts', join(root, 'main.twill'))).toBeNull();
  const include = plugin.transformInclude!;
  expect(include('C:\\app\\node_modules\\library\\main.ts')).toBe(false);
  expect(include(join(root, 'types.d.ts'))).toBe(false);
  const delegated = twillPlugin.raw(
    { root, nativeSources: false },
    { framework: 'rollup', versions: {} },
  );
  expect(delegated.transformInclude!(join(root, 'value.ts'))).toBe(false);
  expect(delegated.transformInclude!(join(root, 'value.twill'))).toBe(true);
});

it('checks both directions, type-only imports, JS/JSDoc consumers and live cyclic bindings', () => {
  const root = fixture({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        checkJs: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      include: ['**/*'],
    }),
    'domain.ts':
      'import {read} from "./service.twill"; export interface Value {amount: number} export let count=1; export const get=()=>read();',
    'format.js': '/** @param {number} value */\nexport const format = value => String(value);',
    'service.twill':
      'import {count, type Value} from "./domain.ts"; import {format} from "./format.js"; export type {Value} from "./domain.ts"; export function read(): string { const values: Value[] = [{amount: count}]; return values.map() { value in format(value.amount) }.join(","); }',
    'consumer.ts':
      'import {read, type Value} from "./service.twill"; export const value: Value = {amount: read()};',
    'consumer-js.js': 'import {read} from "./service.twill"; export const value=read().missing();',
  });
  const project = new TwillProject(join(root, 'tsconfig.json'));
  try {
    const diagnostics = project.diagnostics();
    expect(diagnostics.some((diagnostic) => diagnostic.code === 2307)).toBe(false);
    expect(
      diagnostics
        .filter((diagnostic) => diagnostic.filename?.endsWith('consumer.ts'))
        .map((diagnostic) => diagnostic.code),
    ).toContain(2322);
    expect(
      diagnostics
        .filter((diagnostic) => diagnostic.filename?.endsWith('consumer-js.js'))
        .map((diagnostic) => diagnostic.code),
    ).toContain(2339);
    const file = join(root, 'consumer.ts');
    const source = project.text(file)!;
    const definitions = project.service.getDefinitionAtPosition(
      virtualFilename(file),
      source.indexOf('read()'),
    );
    expect(definitions?.some((entry) => entry.fileName.endsWith('service.twill.ts'))).toBe(true);
  } finally {
    project.dispose();
  }
});
