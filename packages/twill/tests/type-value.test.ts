import { afterEach, expect, it } from 'vitest';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { transform } from '../src/compiler';
import { TwillProject } from '../src/project';
import { emitDeclarations } from '../src/declarations';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function run(source: string, filename = 'main.twill') {
  const lowered = transform(source, { filename });
  const emitted = ts.transpileModule(lowered.code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports: { read?: () => unknown } = {};
  Function('exports', emitted.outputText)(exports);
  return exports.read!();
}

it.each([
  'type Value = number; const Value = 42; export function read(){return Value;}',
  'const Value = 42; type Value = number; export function read(){return Value;}',
  'interface Value {} const Value = 42; export function read(){return Value;}',
  'const Value = 42; interface Value {} export function read(){return Value;}',
  'export type Value = number; export const Value = 42; export function read(){return Value;}',
  'export interface Value {} export const Value = 42; export function read(){return Value;}',
  'interface Value {a:string} interface Value {b:number} const Value = 42; export function read(){return Value;}',
  'const Value = 42; export function read(){type Value = string; return Value;}',
  'function inner(Value:number){type Value=string;return Value;} export function read(){return inner(42);}',
  'namespace Scope {export type Value=number;export const Value=42;} export function read(){return Scope.Value;}',
  'interface Value {value:number} class Value {value=42;} export function read(){return new Value().value;}',
  'export type { Value }; type Value=number; const Value=42; export function read(){return Value;}',
])('keeps native type/value namespaces and runtime bindings: %s', (source) => {
  expect(run(source)).toBe(42);
  expect(run(source, 'main.twillx')).toBe(42);
});

it.each([
  'type Value=number;const Value=1;const Value=2;',
  'interface Value{};let Value=1;const Value=2;',
  'type Value=number;class Value{};const Value=2;',
  'const Value=1;const Value=2;',
])('still rejects duplicate runtime declarations: %s', (source) => {
  expect(() => transform(source)).toThrow(/already been declared/);
});

it('checks type merging and emits declarations that a native consumer can use', () => {
  const root = mkdtempSync(join(tmpdir(), 'twill-type-value-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  const config = join(root, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        rootDir: 'src',
      },
      include: ['src'],
    }),
  );
  const source = join(root, 'src/api.twill');
  writeFileSync(
    source,
    'export type Command = { value: number }; export const Command = { make(value:number):Command {return {value};} };',
  );
  const project = new TwillProject(config);
  try {
    expect(project.diagnostics()).toEqual([]);
    const output = join(root, 'dist');
    expect(emitDeclarations(config, { outDir: output }).diagnostics).toEqual([]);
    const declaration = readFileSync(join(output, 'api.d.ts'), 'utf8');
    expect(declaration).toContain('export type Command');
    expect(declaration).toContain('export declare const Command');
    const consumer = join(root, 'consumer.ts');
    writeFileSync(
      consumer,
      'import {Command} from "./dist/api.js";const value:Command=Command.make(42);value.value.toFixed();',
    );
    const program = ts.createProgram([consumer], {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    });
    expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
    writeFileSync(source, 'type Value=number;type Value=string;export const Value=42;');
    project.refresh(source);
    expect(
      project.diagnostics().some((error) => error.code === 2300 && error.filename === source),
    ).toBe(true);
  } finally {
    project.dispose();
  }
});
