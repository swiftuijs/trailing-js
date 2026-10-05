import { afterEach, expect, it } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { Parser } from 'acorn';
import { transform, originalPosition } from '../src/compiler';
import { TwillProject, virtualFilename } from '../src/project';
import { TwillEditor } from '../src/editor';
import { fixtureRoot } from './helpers/fixture';

function evaluate(source: string, bindings: Record<string, unknown>) {
  const output = transform(`function __evaluate() { ${source} }`, {
    filename: 'main.twill',
    language: 'js',
  }).code;
  Parser.parse(output, { ecmaVersion: 'latest' });
  return Function(
    ...Object.keys(bindings),
    output + '; return __evaluate();',
  )(...Object.values(bindings));
}

it('filters the callback first argument, with or without empty call parentheses', () => {
  const users = [
    { active: true, name: 'Ada' },
    { active: false, name: 'Grace' },
  ];
  for (const call of ['filter', 'filter()'])
    expect(evaluate(`return users.${call} { .active }.map { .name };`, { users })).toEqual(['Ada']);
});

it('retains native getter evaluation, method receivers, optional chains and operators', () => {
  let reads = 0;
  const users = [
    {
      get active() {
        reads++;
        return true;
      },
      verified: true,
      profile: { name: ' Ada ' },
      matches(value: boolean) {
        return this.verified === value;
      },
    },
    { active: false, verified: false, profile: undefined },
  ];
  expect(
    evaluate(
      'return users.filter { .active && .matches(true) }.map { .profile?.name.trim() ?? "missing" };',
      { users },
    ),
  ).toEqual(['Ada']);
  expect(reads).toBe(1);
  expect(
    evaluate('return users.filter { !.active }.map { .profile?.name ?? "missing" };', { users }),
  ).toEqual(['missing']);
});

it('binds nested callbacks independently and keeps generated parameters hygienic', () => {
  const groups = [{ active: false, users: [{ active: true, name: 'Ada' }] }];
  expect(
    evaluate(
      'const __twillArg0 = "kept"; return groups.map { .users.filter { .active }.map { .name } }.flat().concat(__twillArg0);',
      { groups },
    ),
  ).toEqual(['Ada', 'kept']);
  // Escaped identifiers must also reserve their decoded binding name.
  expect(
    evaluate(
      'const \\u005f_twillArg0 = "kept"; return groups.map { .users.length }.concat(__twillArg0);',
      { groups },
    ),
  ).toEqual([1, 'kept']);
  expect(
    evaluate('return run { .value } done: { .value + 1 };', {
      run: (first: Function, second: Function) => second({ value: first({ value: 2 }) }),
    }),
  ).toBe(3);
});

it('works with explicit returns, guards and captured defer cleanup', () => {
  const events: string[] = [];
  const users = [
    {
      active: true,
      close() {
        events.push('closed');
      },
    },
  ];
  expect(
    evaluate(
      'return users.map { defer { .close(); } guard .active else { return 0; } return 1; };',
      { users },
    ),
  ).toEqual([1]);
  expect(events).toEqual(['closed']);
  const source = 'function run() { return users.map { .active }; }';
  const code = transform(source, {
    language: 'js',
    implicitReturn: false,
    sourceType: 'script',
  }).code;
  expect(Function('users', code + '; return run();')(users)).toEqual([undefined]);
});

it('composes with switch expressions and TypeScript expression backtracking', () => {
  expect(
    evaluate('return users.map { (switch (.kind) { case "ok": .value; default: 0; }) };', {
      users: [
        { kind: 'ok', value: 3 },
        { kind: 'bad', value: 8 },
      ],
    }),
  ).toEqual([3, 0]);
  const source = 'const users = [{ name: "Ada" }]; users.map { (<T,>(value: T) => value)(.name) };';
  const result = transform(source);
  const output = ts.transpileModule(result.code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  expect(Function(output.replace('users.map', 'return users.map'))()).toEqual(['Ada']);
});

it.each([
  '.active;',
  'users.map { user in .active };',
  'users.map { () in .active };',
  'users.map { (() => .active)() };',
  'users.map { function inner() { return .active; } };',
  'users.map { function inner() { defer { .close(); } } };',
  'users.map { class Inner { value = .active; } };',
])('rejects ambiguous or unbound shorthand: %s', (source) => {
  expect(() => transform(source)).toThrow(/Implicit member access requires/);
});

it('keeps component content distinct from callback shorthand', () => {
  expect(() => transform('const view = Card {\n .active\n};', { filename: 'view.twillx' })).toThrow(
    /view.twillx:2:2:.*ordinary callbacks/,
  );
  const output = transform('const view = Card { users.map { .name }; };', {
    filename: 'view.twillx',
  });
  expect(output.code).toContain('<Card>');
  expect(output.code).toContain('.name');
  expect(
    transform('users.map { .Run { value in value }; };', { filename: 'view.twillx' }).code,
  ).not.toContain('<__twillImplicit');
});

it('maps property tokens exactly to source without adding a runtime layer', () => {
  const source = 'const activeUsers = users.filter { .active };';
  const result = transform(source, { filename: 'main.twill' });
  expect(originalPosition(result, 1, result.code.indexOf('.active') + 1)).toMatchObject({
    line: 1,
    column: source.indexOf('.active') + 1,
  });
  expect(result.code).not.toMatch(/Reflect|Proxy|function|import/);
  expect(result.map.sourcesContent).toEqual([source]);
});

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));
function projectFixture(source: string) {
  const root = fixtureRoot('implicit-members-');
  const filename = join(root, 'main.twill');
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', types: [] },
      include: ['*.twill'],
    }),
  );
  writeFileSync(filename, source);
  const project = new TwillProject(join(root, 'tsconfig.json'), {}, { recover: true });
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  return { project, editor: new TwillEditor(project), filename };
}

it('infers callback types, diagnoses unknown members and maps mixed property rename', () => {
  const source =
    'const users = [{ active: true, name: "Ada" }]; export const activeUsers = users.filter { .active };';
  const { project, editor, filename } = projectFixture(source);
  expect(project.diagnostics()).toEqual([]);
  const position = source.lastIndexOf('active');
  const hover = project.service.getQuickInfoAtPosition(
    virtualFilename(filename),
    project.toGeneratedOffset(filename, position),
  );
  expect(ts.displayPartsToString(hover?.displayParts)).toContain('active: boolean');
  const edits = editor.renameLocations(filename, position)!;
  expect(
    edits.map((edit) =>
      source.slice(edit.textSpan.start, edit.textSpan.start + edit.textSpan.length),
    ),
  ).toEqual(['active', 'active']);
  project.update(filename, source.replace('{ .active }', '{ .missing }'));
  expect(project.diagnostics()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 2339, column: source.lastIndexOf('active') }),
    ]),
  );
});

it('completes bare dots and partial property names without exposing synthetic parameters', () => {
  const prefix =
    'const users = [{ active: true, name: "Ada" }]; export const result = users.filter { ';
  const { project, editor, filename } = projectFixture(prefix + '. };');
  expect(
    editor.completions(filename, prefix.length + 1).info?.entries.map((entry) => entry.name),
  ).toEqual(expect.arrayContaining(['active', 'name']));
  project.update(filename, prefix + '.act };');
  expect(
    editor.completions(filename, prefix.length + 4).info?.entries.map((entry) => entry.name),
  ).toContain('active');
});
