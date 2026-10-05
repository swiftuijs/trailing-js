import { fixtureRoot } from './helpers/fixture.js';
import { afterEach, expect, it } from 'vitest';
import ts from 'typescript';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TwillProject, virtualFilename } from '../src/project';
import { TwillEditor, type SourceEdit } from '../src/editor';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function fixture(files: Record<string, string>) {
  // Framework declarations resolve through the real repository dependencies.
  const root = fixtureRoot('.editor-actions-');
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        checkJs: true,
        skipLibCheck: true,
      },
      include: ['**/*'],
    }),
  );
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  const project = new TwillProject(join(root, 'tsconfig.json'), {}, { recover: true });
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  const editor = new TwillEditor(project);
  const file = (name: string) => join(root, name).replaceAll('\\', '/');
  const apply = (edits: SourceEdit[]) => {
    for (const filename of new Set(edits.map((edit) => edit.filename))) {
      let source = project.text(filename)!;
      for (const edit of edits
        .filter((edit) => edit.filename === filename)
        .sort((a, b) => b.span.start - a.span.start))
        source =
          source.slice(0, edit.span.start) +
          edit.newText +
          source.slice(edit.span.start + edit.span.length);
      project.update(filename, source);
    }
  };
  return { root, project, editor, file, apply };
}

const card = `import type { ReactNode } from 'react';
declare function Card(props: { title: string; onClick?: (event: { x: number }) => void; children?: ReactNode }): ReactNode;
`;

it('completes partially typed React prop names in source coordinates', () => {
  const source = card + `export const view = Card({ tit }) { 'Hello' };`;
  const { editor, file } = fixture({ 'view.twillx': source });
  const request = editor.completions(file('view.twillx'), source.indexOf('tit }') + 3);
  expect(request.info?.entries.map((entry) => entry.name)).toContain('title');
  expect(request.props).toEqual({
    start: source.indexOf('tit }'),
    end: source.indexOf('tit }') + 3,
  });
});

it('keeps callback member completion separate from prop-key completion', () => {
  const source =
    card + `export const view = Card({ title: 'Hi', onClick: event => event. }) { 'Hello' };`;
  const { editor, file, project } = fixture({ 'view.twillx': source });
  const request = editor.completions(file('view.twillx'), source.indexOf('event. }') + 6);
  expect(request.info?.entries.map((entry) => entry.name)).toContain('x');
  expect(request.props).toBeUndefined();
  project.update(file('view.twillx'), source.replace('event. }', 'event.x }'));
  const info = project.service.getQuickInfoAtPosition(
    virtualFilename(file('view.twillx')),
    project.toGeneratedOffset(file('view.twillx'), source.indexOf('event =>') + 1),
  );
  expect(ts.displayPartsToString(info?.displayParts)).toContain('x: number');
});

it.each(['ts', 'twill'])('auto-imports a %s export into a trailing closure', (extension) => {
  const source = `export const values = [1].map { value in twice(value) };`;
  const { project, editor, file, apply } = fixture({
    [`math.${extension}`]: 'export function twice(value: number) { return value * 2; }',
    'main.twill': source,
  });
  const request = editor.completions(file('main.twill'), source.indexOf('twice') + 3);
  const entry = request.info?.entries.find((entry) => entry.name === 'twice' && entry.source);
  expect(entry).toBeDefined();
  const details = project.service.getCompletionEntryDetails(
    virtualFilename(file('main.twill')),
    request.offset,
    entry!.name,
    {},
    entry!.source,
    {},
    entry!.data,
  )!;
  const edits = editor.mapChanges(details.codeActions!.flatMap((action) => action.changes));
  expect(edits).toBeDefined();
  apply(edits!);
  expect(project.text(file('main.twill'))).not.toContain('.twill.ts');
  expect(project.diagnostics()).toEqual([]);
});

it('renames exports and references across Twill, TS and JS', () => {
  const source =
    'export function twice(value: number) { return [value].map { item in item * 2 }[0]!; }';
  const { project, editor, file, apply } = fixture({
    'math.twill': source,
    'consumer.ts': 'import { twice } from "./math.twill"; export const value: number = twice(2);',
    'client.js': 'import { twice } from "./math.twill"; export const value = twice(3);',
  });
  const edits = editor.rename(file('math.twill'), source.indexOf('twice') + 1, 'double');
  expect(new Set(edits?.map((edit) => edit.filename))).toEqual(
    new Set([file('math.twill'), file('consumer.ts'), file('client.js')]),
  );
  apply(edits!);
  expect(project.diagnostics()).toEqual([]);
  expect(project.text(file('consumer.ts'))).toContain('double(2)');
});

it('preserves React shorthand prop keys when renaming their local value', () => {
  const source = card + `const title = 'Hi'; export const view = Card({ title }) { title };`;
  const { editor, project, file, apply } = fixture({ 'view.twillx': source });
  const edits = editor.rename(file('view.twillx'), source.indexOf('const title') + 7, 'heading');
  expect(edits).toBeDefined();
  apply(edits!);
  expect(project.text(file('view.twillx'))).toContain('Card({ title: heading })');
  expect(project.diagnostics()).toEqual([]);
});

it('renames a shorthand React prop contract while preserving the local value', () => {
  const source = card + `const title = 'Hi'; export const view = Card({ title }) { title };`;
  const { editor, project, file, apply } = fixture({ 'view.twillx': source });
  const edits = editor.rename(file('view.twillx'), source.indexOf('title: string') + 1, 'heading');
  expect(edits).toBeDefined();
  apply(edits!);
  expect(project.text(file('view.twillx'))).toContain('Card({ heading: title })');
  expect(project.diagnostics()).toEqual([]);
});

it('preserves quoted React prop keys when renaming their contract', () => {
  const source = card + `export const view = Card({ 'title': 'Hi' }) { 'Hello' };`;
  const { editor, project, file, apply } = fixture({ 'view.twillx': source });
  const edits = editor.rename(file('view.twillx'), source.indexOf('title: string') + 1, 'heading');
  expect(edits).toBeDefined();
  apply(edits!);
  expect(project.text(file('view.twillx'))).toContain("Card({ 'heading': 'Hi' })");
  expect(project.diagnostics()).toEqual([]);
});

it('renames a local import alias without changing the exported contract', () => {
  const source =
    'import { twice } from "./math.twill"; export const values = [1].map { n in twice(n) };';
  const { editor, project, file, apply } = fixture({
    'math.twill': 'export function twice(n: number) { return n * 2; }',
    'main.twill': source,
  });
  const edits = editor.rename(file('main.twill'), source.lastIndexOf('twice') + 1, 'double');
  expect(edits?.every((edit) => edit.filename === file('main.twill'))).toBe(true);
  apply(edits!);
  expect(project.text(file('main.twill'))).toContain('import { twice as double }');
  expect(project.diagnostics()).toEqual([]);
});

it.each(['return', 'new name', 'name; injected()', '1value'])(
  'rejects invalid rename identifier %s',
  (name) => {
    const source = 'export const value = 1;';
    const { editor, file } = fixture({ 'main.twill': source });
    expect(editor.rename(file('main.twill'), source.indexOf('value') + 1, name)).toBeUndefined();
  },
);

it('renames component tags without duplicating generated closing tags', () => {
  const source = card + `export const view = Card({ title: 'Hi' }) { 'Hello' };`;
  const { editor, project, file, apply } = fixture({ 'view.twillx': source });
  const edits = editor.rename(file('view.twillx'), source.indexOf('function Card') + 10, 'Panel');
  expect(edits).toHaveLength(2);
  apply(edits!);
  expect(project.diagnostics()).toEqual([]);
  expect(project.text(file('view.twillx'))).toContain("Panel({ title: 'Hi' })");
});

it('organizes imports while preserving the dialect body and comments', () => {
  const source = `// A real source comment\nimport { unused, twice } from './math.twill';\nimport { once } from './math.twill';\nexport const values = [1].map { value in twice(once(value)) };`;
  const { editor, project, file, apply } = fixture({
    'math.twill':
      'export const twice=(n:number)=>n*2; export const once=(n:number)=>n; export const unused=0;',
    'main.twill': source,
  });
  const edits = editor.organizeImports(file('main.twill'));
  expect(edits).toBeDefined();
  apply(edits!);
  const updated = project.text(file('main.twill'))!;
  expect(updated).toContain('// A real source comment');
  expect(updated).toContain('[1].map { value in twice(once(value)) };');
  expect(updated).not.toContain('unused');
  expect(project.diagnostics()).toEqual([]);
});

it('refuses an edit that would replace lowered callback syntax', () => {
  const { editor, file, project } = fixture({
    'main.twill': 'export const values = [1].map { value in value * 2 };',
  });
  const generated = project.transformed(file('main.twill'))!.code;
  expect(
    editor.mapChanges([
      {
        fileName: virtualFilename(file('main.twill')),
        textChanges: [{ span: { start: generated.indexOf('=>'), length: 2 }, newText: 'function' }],
      },
    ]),
  ).toBeUndefined();
});

it('refreshes one disk file while retaining other transforms and unsaved content', () => {
  const { project, file } = fixture({
    'one.twill': 'export const one = [1].map { n in n };',
    'two.twill': 'export const two = [2].map { n in n };',
  });
  const original = project.transformed(file('two.twill'));
  project.update(file('one.twill'), 'export const one = 3;');
  writeFileSync(file('one.twill'), 'export const one = 4;');
  project.refresh(file('one.twill'));
  expect(project.text(file('one.twill'))).toBe('export const one = 3;');
  expect(project.transformed(file('two.twill'))).toBe(original);
  project.update(file('one.twill'));
  expect(project.text(file('one.twill'))).toBe('export const one = 4;');
});

it('offers safe spelling fixes inside trailing callbacks', () => {
  const source = 'export const values = [1].map { value in value.toFixd(2) };';
  const { editor, project, file, apply } = fixture({ 'main.twill': source });
  const start = source.indexOf('toFixd');
  const fixes = editor.fixes(file('main.twill'), start, start + 6, [2551]);
  const fix = fixes.find((item) => item.edits.some((edit) => edit.newText === 'toFixed'));
  expect(fix).toBeDefined();
  apply(fix!.edits);
  expect(project.diagnostics()).toEqual([]);
});

it('renames guard bindings and defer captures without editing generated helpers', () => {
  const source = `export function run(input: string | null) {
    guard const value = input else { return ''; }
    defer { console.log(value); }
    return value.toUpperCase();
  }`;
  const { editor, project, file, apply } = fixture({ 'main.twill': source });
  const edits = editor.rename(file('main.twill'), source.indexOf('const value') + 7, 'label');
  expect(edits).toHaveLength(3);
  apply(edits!);
  expect(project.diagnostics()).toEqual([]);
  expect(project.text(file('main.twill'))).toContain('guard const label');
  expect(project.text(file('main.twill'))).toContain('defer { console.log(label); }');
});

it('discovers created files and drops deleted roots without resetting other transforms', () => {
  const { project, editor, file } = fixture({
    'main.twill': 'export const values = [1].map { n in n };',
  });
  const cached = project.transformed(file('main.twill'));
  writeFileSync(file('new.twill'), 'export const added = 1;');
  project.refresh(file('new.twill'), true);
  expect(project.sourceFiles()).toContain(file('new.twill'));
  expect(project.transformed(file('main.twill'))).toBe(cached);
  rmSync(file('new.twill'));
  project.refresh(file('new.twill'), true);
  expect(project.sourceFiles()).not.toContain(file('new.twill'));
  expect(editor.organizeImports(file('main.twill'))).toEqual([]);
});
