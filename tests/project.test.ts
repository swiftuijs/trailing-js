import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TwillProject, virtualFilename, sourceFilename } from '../src/project';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function project(files: Record<string, string>, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'twill-project-'));
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        checkJs: true,
      },
      include: ['**/*'],
    }),
  );
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  const project = new TwillProject(join(root, 'tsconfig.json'), options);
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  return { project, root };
}

describe('virtual TypeScript projects', () => {
  it('infers callback parameters and checks cross-file imports', () => {
    const { project: p } = project({
      'numbers.twill': 'export const values: number[] = [1,2];',
      'main.twill':
        'import { values } from "./numbers.twill"; export const doubled = values.map() { value in value * 2 };',
      'consumer.ts': 'import {doubled} from "./main"; const result: number[] = doubled;',
    });
    expect(p.diagnostics()).toEqual([]);
  });
  it('maps type errors to original tokens', () => {
    const source = 'export const values = [1,2].map() { (value: number) in value.toUpperCase() };';
    const { project: p, root } = project({ 'main.twill': source });
    const diagnostic = p.diagnostics().find((error) => error.code === 2339)!;
    expect(diagnostic).toMatchObject({
      filename: sourceFilename(join(root, 'main.twill')),
      line: 1,
      column: source.indexOf('toUpperCase'),
    });
  });
  it('maps parameter positions in both directions', () => {
    const source = 'export const values = [1,2].map() { (value: number) in value + 1 };';
    const { project: p, root } = project({ 'main.twill': source });
    const file = join(root, 'main.twill');
    const offset = source.indexOf('value:');
    expect(p.toOriginalOffset(file, p.toGeneratedOffset(file, offset))).toBe(offset);
    const info = p.service.getQuickInfoAtPosition(
      virtualFilename(file),
      p.toGeneratedOffset(file, offset),
    );
    expect(info?.displayParts?.map((part) => part.text).join('')).toContain('value: number');
  });
  it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
    'maps cached offsets across %j line separators',
    (separator) => {
      const source =
        'export const prefix = 1;' +
        separator +
        'export const values = [1].map() { (value: number) in value + 1 };';
      const { project: p, root } = project({ 'main.twill': source });
      const file = join(root, 'main.twill');
      const offset = source.indexOf('value:');
      expect(p.toOriginalOffset(file, p.toGeneratedOffset(file, offset))).toBe(offset);
    },
  );
  it('checks JS and reports syntax failures without hiding other errors', () => {
    const { project: p } = project({
      'main.twill.js': 'export const x = [1].map() { value in value.missing() };',
      'broken.twill': 'fn() {',
    });
    expect(p.diagnostics().map((error) => error.code)).toEqual(
      expect.arrayContaining([2339, 90001]),
    );
  });
  it('updates imported overlays and invalidates cached snapshots', () => {
    const { project: p, root } = project({
      'main.twill':
        'export const x: number = fn() { "bad" }; function fn<T>(body:()=>T):T{return body();}',
    });
    expect(p.diagnostics().some((error) => error.code === 2322)).toBe(true);
    p.update(
      join(root, 'main.twill'),
      'export const x: number = fn() { 42 }; function fn<T>(body:()=>T):T{return body();}',
    );
    expect(p.diagnostics()).toEqual([]);
  });
  it('narrows guard conditions and nullish bindings across ordinary TS imports', () => {
    const { project: p } = project({
      'main.twill':
        'export function f(input: string | null) { guard input != null else { return 0; } guard const size = input.length else { throw new Error(); } return size; }',
      'consumer.ts': 'import { f } from "./main.twill"; const result: number = f(null);',
    });
    expect(p.diagnostics()).toEqual([]);
  });
  it('retains transforms and semantic snapshots when an overlay is unchanged', () => {
    const source = 'export const value = [1].map() { x in x * 2 };';
    const { project: p, root } = project({
      'main.twill': source,
      'other.ts': 'export const y = 2;',
    });
    const file = join(root, 'main.twill');
    p.update(file, source);
    const result = p.transformed(file);
    const program = p.service.getProgram();
    p.update(file, source);
    expect(p.transformed(file)).toBe(result);
    expect(p.service.getProgram()).toBe(program);
    p.update(join(root, 'other.ts'), 'export const y = 3;');
    expect(p.service.getProgram()?.getSourceFile(virtualFilename(file))).toBe(
      program?.getSourceFile(virtualFilename(file)),
    );
  });
  it('refreshes disk edits when clearing an overlay or explicitly updating a file', () => {
    const { project: p, root } = project({ 'main.twill': 'export const value = 1;' });
    const file = join(root, 'main.twill');
    expect(p.transformed(file)?.code).toContain('1');
    writeFileSync(file, 'export const value = 2;');
    p.update(file);
    expect(p.transformed(file)?.code).toContain('2');
    p.update(file, 'export const value = 3;');
    expect(p.transformed(file)?.code).toContain('3');
    p.update(file);
    expect(p.transformed(file)?.code).toContain('2');
  });
  it('checks defer scopes, hoisted helper signatures, and ordinary TS consumers', () => {
    const { project: p } = project({
      'main.twill':
        'export function f(input: string | null): number { defer { input?.toUpperCase(); } guard input !== null else { return 0; } let amount = input.length; function helper<T extends number>(value: T): T { return value; } return helper(amount); }',
      'consumer.ts': 'import {f} from "./main.twill"; const result: number = f("hello");',
      'async.twill':
        'export async function f(events: string[]) { defer { await Promise.resolve(); events.push("cleanup"); } return 3; }',
    });
    expect(p.diagnostics()).toEqual([]);
  });
  it('checks JS defer stacks and preserves JSDoc on local hoisted functions', () => {
    const { project: p } = project({
      'main.twill.js':
        'export function f() { defer {} const result = helper(3);\n/** @param {number} value */\nfunction helper(value) { return value * 2; } return result; }',
      'consumer.ts': 'import {f} from "./main.twill.js"; const result: number = f();',
    });
    expect(p.diagnostics()).toEqual([]);
  });
  it('maps cleanup type errors to their original tokens', () => {
    const source =
      'export function f(value: number) { defer { value.toUpperCase(); } return value; }';
    const { project: p } = project({ 'main.twill': source });
    expect(p.diagnostics().find((item) => item.code === 2339)).toMatchObject({
      line: 1,
      column: source.indexOf('toUpperCase'),
    });
  });
});
