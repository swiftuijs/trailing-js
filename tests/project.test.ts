import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TrailingProject, virtualFilename, sourceFilename } from '../src/project';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function project(files: Record<string, string>, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'trailing-project-'));
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
  const project = new TrailingProject(join(root, 'tsconfig.json'), options);
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  return { project, root };
}

describe('virtual TypeScript projects', () => {
  it('infers callback parameters and checks cross-file imports', () => {
    const { project: p } = project({
      'numbers.tts': 'export const values: number[] = [1,2];',
      'main.tts':
        'import { values } from "./numbers.tts"; export const doubled = values.map() { value in value * 2 };',
      'consumer.ts': 'import {doubled} from "./main"; const result: number[] = doubled;',
    });
    expect(p.diagnostics()).toEqual([]);
  });
  it('maps type errors to original tokens', () => {
    const source = 'export const values = [1,2].map() { (value: number) in value.toUpperCase() };';
    const { project: p, root } = project({ 'main.tts': source });
    const diagnostic = p.diagnostics().find((error) => error.code === 2339)!;
    expect(diagnostic).toMatchObject({
      filename: sourceFilename(join(root, 'main.tts')),
      line: 1,
      column: source.indexOf('toUpperCase'),
    });
  });
  it('maps parameter positions in both directions', () => {
    const source = 'export const values = [1,2].map() { (value: number) in value + 1 };';
    const { project: p, root } = project({ 'main.tts': source });
    const file = join(root, 'main.tts');
    const offset = source.indexOf('value:');
    expect(p.toOriginalOffset(file, p.toGeneratedOffset(file, offset))).toBe(offset);
    const info = p.service.getQuickInfoAtPosition(
      virtualFilename(file),
      p.toGeneratedOffset(file, offset),
    );
    expect(info?.displayParts?.map((part) => part.text).join('')).toContain('value: number');
  });
  it('checks JS and reports syntax failures without hiding other errors', () => {
    const { project: p } = project({
      'main.tjs': 'export const x = [1].map() { value in value.missing() };',
      'broken.tts': 'fn() {',
    });
    expect(p.diagnostics().map((error) => error.code)).toEqual(
      expect.arrayContaining([2339, 90001]),
    );
  });
  it('updates imported overlays and invalidates cached snapshots', () => {
    const { project: p, root } = project({
      'main.tts':
        'export const x: number = fn() { "bad" }; function fn<T>(body:()=>T):T{return body();}',
    });
    expect(p.diagnostics().some((error) => error.code === 2322)).toBe(true);
    p.update(
      join(root, 'main.tts'),
      'export const x: number = fn() { 42 }; function fn<T>(body:()=>T):T{return body();}',
    );
    expect(p.diagnostics()).toEqual([]);
  });
});
