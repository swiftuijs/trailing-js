import { afterEach, describe, expect, it } from 'vitest';
import { emitDeclarations } from '../packages/twill/src/declarations';
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
      join(root, 'base/tsconfig.json'),
      join(root, 'app/tsconfig.json'),
    ]);
    expect(readFileSync(join(root, 'app/dist/index.d.ts'), 'utf8')).toContain('answer: number');
    expect(readFileSync(join(root, 'app/dist/index.d.ts'), 'utf8')).toContain(
      '../../base/dist/index.js',
    );
  });
});
