import { afterEach, describe, expect, it } from 'vitest';
import { emitDeclarations } from '../src/declarations';
import ts from 'typescript';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'twill-dts-'));
  roots.push(root);
  return root;
}
const options = {
  strict: true,
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'Bundler',
  types: [],
};
describe('native declaration builds', () => {
  it('emits narrowed branch result types without local bindings or runtime types', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: options, include: ['*.twill'], exclude: ['dist'] }),
    );
    writeFileSync(
      join(root, 'index.twill'),
      'export function read(input:{value:number}|null){if const {value}=input{return value;}return undefined;}',
    );
    expect(emitDeclarations(join(root, 'tsconfig.json')).diagnostics).toEqual([]);
    const declaration = readFileSync(join(root, 'dist/index.d.ts'), 'utf8');
    expect(declaration).toContain('number | undefined');
    expect(declaration).not.toMatch(/__twill|if const|twill-runtime/);
  });
  it('exports inferred member callback results as ordinary declarations', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: options, include: ['*.twill'], exclude: ['dist'] }),
    );
    writeFileSync(
      join(root, 'index.twill'),
      'export const names=[{name:"Ada",active:true}].filter { .active }.map { .name };',
    );
    expect(emitDeclarations(join(root, 'tsconfig.json')).diagnostics).toEqual([]);
    expect(readFileSync(join(root, 'dist/index.d.ts'), 'utf8')).toContain('names: string[]');
  });
  it('exports inferred switch expression unions to native consumers', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: options, include: ['*.twill'], exclude: ['dist'] }),
    );
    writeFileSync(
      join(root, 'index.twill'),
      'type Result={kind:"ok";value:number}|{kind:"bad";error:string};export function unwrap(input:{result:Result}|null){guard const {result}=input else{return undefined;}return switch(result){case {kind:"ok",value}: value;case {kind:"bad",error}: error;};}',
    );
    expect(emitDeclarations(join(root, 'tsconfig.json')).diagnostics).toEqual([]);
    expect(readFileSync(join(root, 'dist/index.d.ts'), 'utf8')).toContain(
      'string | number | undefined',
    );
  });
  it('emits interoperable declarations, module specifiers and original-source maps', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: options, include: ['*.twill', '*.ts'], exclude: ['dist'] }),
    );
    writeFileSync(join(root, 'helper.twill'), 'export type Numeric = number;');
    writeFileSync(
      join(root, 'index.twill'),
      'import type {Numeric} from "./helper.twill"; export type {Numeric} from "./helper.twill"; export const double=(values:Numeric[])=>values.map { n in n*2 };',
    );
    const result = emitDeclarations(join(root, 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    const declaration = readFileSync(join(root, 'dist/index.d.ts'), 'utf8');
    expect(declaration).toContain('./helper.js');
    expect(declaration).not.toContain('.twill');
    const map = JSON.parse(readFileSync(join(root, 'dist/index.d.ts.map'), 'utf8'));
    expect(resolve(root, 'dist', map.sources[0])).toBe(join(root, 'index.twill'));
    writeFileSync(
      join(root, 'consumer.ts'),
      'import {double} from "./dist/index.js";const value:number[]=double([1]);',
    );
    const program = ts.createProgram([join(root, 'consumer.ts')], {
      strict: true,
      noEmit: true,
      types: [],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  });
  it('writes nothing for a project with type errors', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: options, include: ['*.twill'] }),
    );
    writeFileSync(join(root, 'index.twill'), 'export const value:number="wrong";');
    expect(
      emitDeclarations(join(root, 'tsconfig.json')).diagnostics.some((item) => item.code === 2322),
    ).toBe(true);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
  it('rejects same-basename output collisions before writing', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: options, include: ['*.twill', '*.ts'] }),
    );
    writeFileSync(join(root, 'entry.twill'), 'export const value=1;');
    writeFileSync(join(root, 'entry.ts'), 'export const other=2;');
    expect(() => emitDeclarations(join(root, 'tsconfig.json'))).toThrow(/collision/);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
  it('builds referenced libraries before parents and consumes their declarations', () => {
    const root = fixture();
    for (const name of ['base', 'app']) mkdirSync(join(root, name));
    writeFileSync(
      join(root, 'base/tsconfig.json'),
      JSON.stringify({
        compilerOptions: { ...options, composite: true, rootDir: '.', outDir: 'dist' },
        include: ['*.twill'],
      }),
    );
    writeFileSync(
      join(root, 'base/index.twill'),
      'export const value:number=42; export interface Item { value:number }',
    );
    writeFileSync(
      join(root, 'app/tsconfig.json'),
      JSON.stringify({
        compilerOptions: { ...options, composite: true, rootDir: '.', outDir: 'dist' },
        include: ['*.twill'],
        references: [{ path: '../base' }],
      }),
    );
    writeFileSync(
      join(root, 'app/index.twill'),
      'import {value} from "../base/index.twill"; export type {Item} from "../base/index.twill";export const answer=value;',
    );
    const result = emitDeclarations(join(root, 'app/tsconfig.json'), { build: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.projects).toEqual([
      join(root, 'base/tsconfig.json').replaceAll('\\', '/'),
      join(root, 'app/tsconfig.json').replaceAll('\\', '/'),
    ]);
    expect(readFileSync(join(root, 'app/dist/index.d.ts'), 'utf8')).toContain('answer: number');
    expect(readFileSync(join(root, 'app/dist/index.d.ts'), 'utf8')).toContain(
      '../../base/dist/index.js',
    );
  });
  it('reports a missing build config without creating output', () => {
    const root = fixture();
    const result = emitDeclarations(join(root, 'missing.json'), { build: true });
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: 'error', code: 5083 })]),
    );
    expect(result.files).toEqual([]);
    expect(result.projects).toEqual([]);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });
  it('rejects circular references before writing either project', () => {
    const root = fixture();
    for (const [name, dependency] of [
      ['first', 'second'],
      ['second', 'first'],
    ]) {
      mkdirSync(join(root, name!));
      writeFileSync(join(root, name!, 'index.twill'), 'export const value=1;');
      writeFileSync(
        join(root, name!, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: options,
          include: ['*.twill'],
          references: [{ path: '../' + dependency }],
        }),
      );
    }
    expect(() => emitDeclarations(join(root, 'first/tsconfig.json'), { build: true })).toThrow(
      'Circular project reference',
    );
    expect(existsSync(join(root, 'first/dist'))).toBe(false);
    expect(existsSync(join(root, 'second/dist'))).toBe(false);
  });
  it('builds a shared dependency once in a diamond reference graph', () => {
    const root = fixture();
    for (const [name, dependencies] of [
      ['base', []],
      ['left', ['base']],
      ['right', ['base']],
      ['app', ['left', 'right']],
    ] as const) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'index.twill'), 'export const value=1;');
      writeFileSync(
        join(root, name, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { ...options, composite: true, rootDir: '.', outDir: 'dist' },
          include: ['*.twill'],
          references: dependencies.map((path) => ({ path: '../' + path })),
        }),
      );
    }
    const result = emitDeclarations(join(root, 'app/tsconfig.json'), { build: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.projects.map((file) => file.split('/').at(-2))).toEqual([
      'base',
      'left',
      'right',
      'app',
    ]);
    expect(new Set(result.files).size).toBe(result.files.length);
  });
  it('stops a reference build after a dependency fails type checking', () => {
    const root = fixture();
    for (const name of ['bad', 'other', 'app']) {
      mkdirSync(join(root, name));
      writeFileSync(
        join(root, name, 'index.twill'),
        name === 'bad' ? 'export const value:number="wrong";' : 'export const value=1;',
      );
      writeFileSync(
        join(root, name, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: { ...options, composite: true, rootDir: '.', outDir: 'dist' },
          include: ['*.twill'],
          ...(name === 'app' ? { references: [{ path: '../bad' }, { path: '../other' }] } : {}),
        }),
      );
    }
    const result = emitDeclarations(join(root, 'app/tsconfig.json'), { build: true });
    expect(result.diagnostics.some((item) => item.code === 2322)).toBe(true);
    expect(result.projects).toEqual([]);
    expect(result.files).toEqual([]);
    for (const name of ['bad', 'other', 'app'])
      expect(existsSync(join(root, name, 'dist'))).toBe(false);
  });
  it('refuses to overwrite an existing source declaration', () => {
    const root = fixture();
    const original = 'export declare const existing: number;';
    writeFileSync(join(root, 'index.d.ts'), original);
    writeFileSync(join(root, 'index.twill'), 'export const value=1;');
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: options,
        files: ['index.d.ts', 'index.twill'],
      }),
    );
    expect(() => emitDeclarations(join(root, 'tsconfig.json'), { outDir: root })).toThrow(
      'overwrite source',
    );
    expect(readFileSync(join(root, 'index.d.ts'), 'utf8')).toBe(original);
    expect(existsSync(join(root, 'index.d.ts.map'))).toBe(false);
  });
  it('rewrites native ESM and CJS declaration references to their runtime extensions', () => {
    const root = fixture();
    writeFileSync(join(root, 'api.mts'), 'export const value=1;');
    writeFileSync(join(root, 'other.cts'), 'export const value=2;');
    writeFileSync(
      join(root, 'main.mts'),
      'export type A=typeof import("./api.mts"); export type B=typeof import("./other.cts");',
    );
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          ...options,
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowImportingTsExtensions: true,
        },
        include: ['*.mts', '*.cts'],
      }),
    );
    const result = emitDeclarations(join(root, 'tsconfig.json'));
    expect(result.diagnostics).toEqual([]);
    const declaration = readFileSync(join(root, 'dist/main.d.mts'), 'utf8');
    expect(declaration).toContain('"./api.mjs"');
    expect(declaration).toContain('"./other.cjs"');
  });
});
