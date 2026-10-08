import { afterEach, expect, it } from 'vitest';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { transform, type TransformOptions } from '../src/compiler';
import { parse } from '../src/parser.js';
import { runDefers } from '../../runtime/src/helpers/v1.js';
import { fixtureRoot } from './helpers/fixture';
import { loadConfig } from '../src/config';
import { TwillProject, virtualFilename } from '../src/project';
import { TwillEditor } from '../src/editor';
import ts from 'typescript';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function compile(body: string, runtime: 'inline' | 'external' = 'external') {
  // The helper contract needs dynamic registration. Statically owned cleanup
  // is deliberately covered by the dependency-free native-path cases below.
  body = body.replace(/\bdefer\s*\{/, 'if(true) defer {');
  const result = transform(`function run(input,events,problem){${body}}`, {
    language: 'js',
    runtime,
  });
  parse(result.code, 'js');
  const imported = result.code.match(
    /import \{ runDefers as (\w+) \} from ['"]@swiftuijs\/twill-runtime\/helpers\/v1['"];\s*/,
  );
  const code = imported ? result.code.replace(imported[0], '') : result.code;
  return { result, run: Function(imported?.[1] ?? 'unused', code + ';return run;')(runDefers) };
}
it.each([
  [
    'fallthrough',
    'defer {events.push("first");} defer {events.push("second");} events.push("body");',
  ],
  ['return', 'defer {events.push("first");} defer {events.push("second");} return 7;'],
  [
    'early return',
    'defer {events.push("first");} if(input)return 2; defer {events.push("second");} return 3;',
  ],
  [
    'conditional registrations',
    'if(input)defer {events.push("conditional");} defer {events.push("last");} return 4;',
  ],
  ['repeated registrations', 'for(let i=0;i<input;i++)defer {events.push(i);} return input;'],
  [
    'nested scopes',
    'defer {events.push("outer1");} defer {events.push("outer2");} {defer {events.push("inner1");} defer {events.push("inner2");} events.push("body");}',
  ],
  [
    'break and continue',
    'for(let i=0;i<3;i++){defer {events.push(i);} defer {events.push(i+10);} if(i===0)continue;break;}',
  ],
  [
    'live captures',
    'let value=1;defer {events.push(value,later);} defer {events.push("other");} const later=3;value=2;return value;',
  ],
  [
    'unreached registrations',
    'if(input)return 0;defer {events.push("first");} defer {events.push("second");} return 1;',
  ],
  ['body failure', 'defer {events.push("first");} defer {events.push("second");} throw problem;'],
  [
    'cleanup failure',
    'defer {events.push("first");throw problem;} defer {events.push("second");} return 1;',
  ],
  [
    'multiple failures',
    'defer {events.push("oldest");throw problem;} defer {events.push("newest");throw "newer";} throw "body";',
  ],
  [
    'undefined failure',
    'defer {events.push("first");throw undefined;} defer {events.push("second");} return 1;',
  ],
  [
    'TDZ failure',
    'defer {events.push(later);} defer {events.push("other");} return 1;const later=3;',
  ],
])('matches inline behavior for %s', (_name, body) => {
  const modes = [compile(body, 'inline'), compile(body, 'external')];
  const observe = (fn: (...args: any[]) => any, input: number) => {
    const events: unknown[] = [];
    try {
      return { events, value: fn(input, events, 'failure'), threw: false };
    } catch (error) {
      return {
        events,
        error: error instanceof ReferenceError ? 'ReferenceError' : error,
        threw: true,
      };
    }
  };
  for (const input of [0, 1, 3])
    expect(observe(modes[1]!.run, input)).toEqual(observe(modes[0]!.run, input));
  expect(modes[1]!.result.code).toContain('@swiftuijs/twill-runtime/helpers/v1');
});
it('imports one hygienic helper per module across multiple dynamic scopes', () => {
  const { result, run } = compile(
    'const __twillRunDefers0=9;defer {events.push(__twillRunDefers0);} defer {events.push(2);} {defer {events.push(3);} defer {events.push(4);}}return __twillRunDefers0;',
  );
  expect(result.code.match(/from ['"]@swiftuijs\/twill-runtime\/helpers\/v1['"]/g)).toHaveLength(1);
  const events: number[] = [];
  expect(run(0, events)).toBe(9);
  expect(events).toEqual([4, 3, 2, 9]);
});
it.each([
  'function run(){return 1;}',
  'function run(){defer {release();}return 1;}',
  'function run(){defer {release(1);}defer {release(2);}return 1;}',
  'async function run(){defer {await release();}defer {await release();}return 1;}',
  'async function run(){defer {await release();}defer {release();}return 1;}',
  'function run(input){guard input else{return 0;}return switch(input){default:1;};}',
  'const values=[1].map { n in n+1 };',
])('does not import runtime for unused, single, async or native fast paths: %s', (source) => {
  const inline = transform(source, { language: 'js' }),
    external = transform(source, { language: 'js', runtime: 'external' });
  expect(external.code).toBe(inline.code);
  expect(external.code).not.toContain('twill-runtime');
});
it('does not add an await turn for dynamic synchronous cleanup inside async functions', async () => {
  const source =
    'async function run(events){if(true)defer {events.push(1);} defer {events.push(2);}events.push(3);return 4;}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  const imported = result.code.match(/import \{ runDefers as (\w+) \} from [^;]+;\s*/)!;
  const run = Function(
    imported[1]!,
    result.code.replace(imported[0], '') + ';return run;',
  )(runDefers);
  const events: number[] = [];
  const promise = run(events);
  expect(events).toEqual([3, 2, 1]);
  expect(await promise).toBe(4);
});
it('keeps mixed/unreached async cleanup and its microtask order unchanged', async () => {
  const source =
    'async function run(early,events){if(early)return 1;defer {events.push("sync");}defer {await Promise.resolve();events.push("async");}return 2;}';
  const inline = transform(source, { language: 'js' }),
    external = transform(source, { language: 'js', runtime: 'external' });
  expect(external.code).toBe(inline.code);
  const run = Function(external.code + ';return run;')();
  const events: string[] = [];
  const result = run(true, events).then(() => events.push('returned'));
  await Promise.resolve().then(() => events.push('tick'));
  await result;
  expect(events).toEqual(['returned', 'tick']);
  events.length = 0;
  expect(await run(false, events)).toBe(2);
  expect(events).toEqual(['async', 'sync']);
});
it('runs reached registrations on generator close without reaching later ones', () => {
  const source =
    'function* run(events){if(true)defer {events.push(1);}defer {events.push(2);}yield 3;defer {events.push(4);}}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  const imported = result.code.match(/import \{ runDefers as (\w+) \} from [^;]+;\s*/)!;
  const run = Function(
    imported[1]!,
    result.code.replace(imported[0], '') + ';return run;',
  )(runDefers);
  const events: number[] = [];
  const iterator = run(events);
  expect(iterator.next().value).toBe(3);
  expect(events).toEqual([]);
  iterator.return();
  expect(events).toEqual([2, 1]);
});
it('keeps lexical this, arguments, super, new.target and function hoisting in scope', () => {
  const source =
    'class Base{value(){return 4;}}class Child extends Base{run(events){defer {events.push(this,super.value(),arguments.length);}defer {events.push(helper());}let value=3;function helper(){return value;}return 7;}}function Run(events){defer {events.push(new.target);}defer {events.push(1);}}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  const imported = result.code.match(/import \{ runDefers as (\w+) \} from [^;]+;\s*/)!;
  const [Child, Run] = Function(
    imported[1]!,
    result.code.replace(imported[0], '') + ';return [Child,Run];',
  )(runDefers);
  const events: unknown[] = [];
  const child = new Child();
  expect(child.run(events)).toBe(7);
  expect(events).toEqual([3, child, 4, 1]);
  events.length = 0;
  new Run(events);
  expect(events).toEqual([1, Run]);
});
it('preserves shebangs and directives before its import', () => {
  const source =
    '#!/usr/bin/env node\n"use client";\nfunction run(){if(true)defer {release(1);}defer {release(2);}}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  parse(result.code, 'js');
  expect(result.code).toMatch(/^#![^\n]+\n"use client";\s*import/);
});
it('rejects invalid options and only diagnoses script mode when an import is needed', () => {
  for (const runtime of ['auto', null, false, 1, {}])
    expect(() => transform('const value=1;', { runtime } as unknown as TransformOptions)).toThrow(
      'runtime must be',
    );
  expect(() =>
    transform('function run(){if(true)defer {release();}defer {release();}}', {
      runtime: 'external',
      sourceType: 'script',
    }),
  ).toThrow(/require.*module/);
  expect(
    transform('function run(){defer {release();}}', { runtime: 'external', sourceType: 'script' })
      .code,
  ).not.toContain('twill-runtime');
});
it('checks external helper types, maps diagnostics/rename and emits dependency-free declarations', () => {
  const root = fixtureRoot('external-runtime-');
  roots.push(root);
  const filename = join(root, 'main.twill'),
    config = join(root, 'tsconfig.json');
  const source =
    'export function run(input:number,events:number[]){\nif(true)defer {events.push(input);}\ndefer {events.push(input+1);}\nreturn input;}';
  writeFileSync(filename, source);
  writeFileSync(join(root, 'twill.config.json'), '{"runtime":"external"}');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
      },
      files: ['main.twill'],
    }),
  );
  expect(loadConfig(root).runtime).toBe('external');
  const project = new TwillProject(config);
  try {
    expect(project.diagnostics()).toEqual([]);
    expect(project.transformed(filename)!.code).toContain('twill-runtime');
    const editor = new TwillEditor(project);
    expect(
      editor.rename(filename, source.indexOf('input:number'), 'value')?.map((e) => e.newText),
    ).toEqual(['value', 'value', 'value', 'value']);
    expect(
      project.service
        .getQuickInfoAtPosition(
          virtualFilename(filename),
          project.toGeneratedOffset(filename, source.lastIndexOf('input;')),
        )
        ?.displayParts?.map((p) => p.text)
        .join(''),
    ).toContain('number');
    const emitted = project.declarationOutput(join(root, 'dist'));
    expect(emitted.diagnostics).toEqual([]);
    expect(emitted.files.map((f) => f.text).join('\n')).not.toContain('twill-runtime');
    project.update(filename, source.replace('events.push(input+1)', 'events.push("invalid")'));
    const diagnostic = project.diagnostics().find((d) => d.code === 2345);
    expect(diagnostic?.line).toBe(3);
    expect(diagnostic?.column).toBe('defer {events.push('.length);
  } finally {
    project.dispose();
  }
});
it('runs external cleanup through the actual Node loader using project configuration', () => {
  const root = fixtureRoot('external-loader-');
  roots.push(root);
  writeFileSync(join(root, 'twill.config.json'), '{"runtime":"external"}');
  writeFileSync(
    join(root, 'main.twill'),
    'const events:number[]=[];function run(){if(true)defer {events.push(1);}defer {events.push(2);}return 3;}console.log(JSON.stringify([run(),events]));',
  );
  const output = execFileSync(
    process.execPath,
    ['--import', join(import.meta.dirname, '../dist/register.js'), join(root, 'main.twill')],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(output)).toEqual([3, [2, 1]]);
  expect(readFileSync(join(root, 'twill.config.json'), 'utf8')).toContain('external');
});
it('keeps file pragmas and declaration documentation before/after the import respectively', () => {
  const source =
    '// @ts-nocheck\n/// <reference path="./types.d.ts" />\n/** @jsxImportSource custom */\n/** Cleanup API. */\nexport function run(events){if(true)defer {events.push(1);}defer {events.push(2);}}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  parse(result.code, 'js');
  expect(result.code.indexOf('@ts-nocheck')).toBeLessThan(result.code.indexOf('import {'));
  expect(result.code.indexOf('@jsxImportSource')).toBeLessThan(result.code.indexOf('import {'));
  expect(result.code).toMatch(/import[^;]+;\s*\/\*\* Cleanup API\. \*\/\s*export function/);
});
it('keeps adjacent declaration documentation with native generic checkJs annotations', () => {
  const root = fixtureRoot('external-jsdoc-');
  roots.push(root);
  const filename = join(root, 'main.js');
  const source =
    '// @ts-check\n/** Cleanup API description. */\n/** @template T\n * @param {T} input\n * @param {T[]} events\n * @returns {T} */\nexport function work(input,events){if(true)defer {events.push(input);}defer {events.push(input);}return input;}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  expect(result.code).toMatch(
    /import[^;]+;\s*\/\*\* Cleanup API description\. \*\/\s*\/\*\* @template T/,
  );
  writeFileSync(filename, result.code);
  writeFileSync(
    join(root, 'consumer.ts'),
    'import {work} from "./main.js";const value:number=work(1,[]);\n// @ts-expect-error generic result retains its source type\nconst invalid:string=work(1,[]);',
  );
  const program = ts.createProgram([filename, join(root, 'consumer.ts')], {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')),
  ).toEqual([]);
});
it('keeps suppression comments before the documented source declaration under native checkJs', () => {
  const root = fixtureRoot('external-suppression-');
  roots.push(root);
  const filename = join(root, 'main.js');
  const source =
    '// @ts-check\n/** Source API. */\n// @ts-expect-error intentional implicit-any parameter\nexport function run(events){if(true)defer {events.push(1);}defer {events.push(2);}}';
  const result = transform(source, { language: 'js', runtime: 'external' });
  expect(result.code.indexOf('@ts-check')).toBeLessThan(result.code.indexOf('import {'));
  expect(result.code.indexOf('import {')).toBeLessThan(result.code.indexOf('Source API.'));
  expect(result.code.indexOf('import {')).toBeLessThan(result.code.indexOf('@ts-expect-error'));
  writeFileSync(filename, result.code);
  const program = ts.createProgram([filename], {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    types: [],
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')),
  ).toEqual([]);
});
it('inserts imports before a lowered first initializer rather than inside its control flow', () => {
  const source =
    '/** Result documentation. */\nexport const result=switch(1){default:2;};\nexport function run(events){if(true)defer {events.push(1);}defer {events.push(2);}}';
  const result = transform(source, { language: 'ts', runtime: 'external' });
  parse(result.code, 'ts');
  expect(result.code.indexOf('import {')).toBeLessThan(result.code.indexOf('let __twillResult'));
});
it('avoids capturing ambient JSX-only component names with its import alias', () => {
  const result = transform(
    'export function run(events:number[]){if(true)defer {events.push(1);}defer {events.push(2);}return <__twillRunDefers5/>;}',
    { language: 'tsx', runtime: 'external' },
  );
  parse(result.code, 'tsx');
  expect(result.code).toContain('<__twillRunDefers5/>');
  expect(result.code).not.toContain('runDefers as __twillRunDefers5');
});
it.each([
  '/** @jsxImportSource custom */',
  '// @ts-nocheck',
  '// @ts-expect-error source suppression',
])('preserves the placement of the leading pragma %s', (pragma) => {
  const result = transform(
    `${pragma}\nexport function run(){if(true)defer {release(1);}defer {release(2);}}`,
    { language: 'js', runtime: 'external' },
  );
  parse(result.code, 'js');
  if (pragma.includes('expect-error'))
    expect(result.code.indexOf('import {')).toBeLessThan(result.code.indexOf(pragma));
  else expect(result.code.indexOf(pragma)).toBeLessThan(result.code.indexOf('import {'));
});
