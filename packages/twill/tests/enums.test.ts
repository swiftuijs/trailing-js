import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { transform, originalPosition, generatedPosition } from '../src/compiler';
import { parse } from '../src/parser.js';
import { TwillProject } from '../src/project';
import { TwillEditor } from '../src/editor';
import { emitDeclarations } from '../src/declarations';
import { transform as esbuildTransform } from 'esbuild';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function checked(source: string, native = '') {
  const root = mkdtempSync(join(tmpdir(), 'twill-enums-'));
  const filename = join(root, 'main.twill');
  writeFileSync(filename, source);
  if (native) writeFileSync(join(root, 'native.ts'), native);
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        declaration: true,
        skipLibCheck: true,
      },
      include: ['*.twill', '*.ts'],
    }),
  );
  const project = new TwillProject(join(root, 'tsconfig.json'));
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  return { root, filename, project };
}

function run(source: string) {
  const output = transform(`function execute(){${source}}`).code;
  expect(
    (ts.createSourceFile('output.ts', output, ts.ScriptTarget.Latest) as any).parseDiagnostics,
  ).toEqual([]);
  return Function(
    ts.transpileModule(output, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText +
      ';return execute();',
  )();
}

it('constructs precise tagged records, evaluates arguments once and retains payload identity', () => {
  const result = run(`enum State<T> { case idle; case loaded(value:T, count:number); }
    const events:number[]=[]; const payload={value:42};
    const state=State.loaded((events.push(1),payload),(events.push(2),3));
    return [State.idle(),State.idle() !== State.idle(),state,state.value===payload,events];`);
  expect(result).toEqual([
    { kind: 'idle' },
    true,
    { kind: 'loaded', value: { value: 42 }, count: 3 },
    true,
    [1, 2],
  ]);
});

it('handles exports, generics, constraints/defaults, native consumers and exhausted switches', () => {
  const source = `export enum Outcome<T extends object, K extends keyof T, E=Error> {
    case ok(value:T, key:K);
    case bad(error:E);
    case idle();
  }
  export function handle(outcome:Outcome<{value:number},'value'>) {
    return switch(outcome) { case {kind:'ok',value,key}: value[key]; case {kind:'bad',error}: error.message; case {kind:'idle'}: 0; };
  }`;
  const { project } = checked(
    source,
    `import {Outcome,handle} from './main.twill';
    const value:Outcome<{value:number},'value'>=Outcome.ok({value:42},'value');
    export const result:number|string=handle(value);
    export const error:Error=Outcome.bad(new Error()).error;`,
  );
  expect(project.diagnostics()).toEqual([]);
  expect(transform(source).code).toContain('ok<T extends object, K extends keyof T>');
  expect(transform(source).code).toContain('bad<E=Error>');
});

it('reports a missing enum case and invalid construction through native TS checking', () => {
  const { project } = checked(`export enum State<T> {case idle;case loaded(value:T);}
    export function run(state:State<number>) { return switch(state) {case {kind:'loaded',value}: value;}; }
    export const wrong:State<number>=State.loaded('bad');`);
  const diagnostics = project.diagnostics();
  expect(diagnostics.map((d) => d.code)).toContain(1360);
  expect(diagnostics.map((d) => d.code)).toContain(2322);
});

it('preserves native enums and checks associated enums in TSX and nested lexical scopes', () => {
  const source = `export enum Native { A, B='b' } export const enum Const { A=1 }
    export function make() { enum Inner {case value(data:number);} return Inner.value(2); }
    enum View<T> {case ready(value:T);} export const value=View.ready(3);`;
  expect(transform(source, { filename: 'view.twillx' }).code).toContain(
    'export enum Native { A, B=',
  );
  expect(parse(source).enums).toHaveLength(2);
  expect(checked(source).project.diagnostics()).toEqual([]);
  expect(
    run(
      'function make(){enum Inner{case value(data:number);}return Inner.value(3);}return make();',
    ),
  ).toEqual({ kind: 'value', data: 3 });
});

it('keeps malformed native enum diagnostics at their original position', () => {
  const source = 'export const before=1;\nenum Broken @ {}';
  try {
    transform(source);
    throw new Error('Expected syntax error');
  } catch (error) {
    expect(error).toMatchObject({ line: 2, column: 12 });
  }
  expect(() => transform('declare namespace Ambient{enum A{case idle;}}')).toThrow(
    /cannot be const or ambient/,
  );
});

it.each([
  ['enum A{case ok;case ok;}', /Duplicate enum case/],
  ['enum A{case ok(value:number,value:string);}', /Duplicate enum payload/],
  ['enum A{case ok(kind:string);}', /discriminator/],
  ['enum A{case ok(value);}', /require a name and type/],
  ['enum A{case ok(value?:number);}', /optional\/default\/rest/],
  ['enum A{case ok(value:number=1);}', /Unexpected/],
  ['enum A{case ok(...value:number[]);}', /Unexpected/],
  ['enum A<T>{}', /at least one/],
  ['const enum A{case ok;}', /cannot be const or ambient/],
  ['declare enum A{case ok;}', /cannot be const or ambient/],
  ['export declare enum A{case ok;}', /cannot be const or ambient/],
  ['enum A{case ok; wrong;}', /Unexpected/],
])('rejects unsupported associated enum syntax: %s', (source, error) => {
  expect(() => transform(source)).toThrow(error);
});

it('preserves comments and semicolon-free cases through lowering', () => {
  const source =
    'enum /*name*/ State<T>{case /*case*/ idle /*after*/;case loaded(value: /*type*/ T)\n}';
  const output = transform(source).code;
  for (const comment of ['/*name*/', '/*case*/', '/*after*/', '/*type*/'])
    expect(output).toContain(comment);
  expect(
    (ts.createSourceFile('output.ts', output, ts.ScriptTarget.Latest) as any).parseDiagnostics,
  ).toEqual([]);
  expect(run('enum State{case idle\ncase loaded(value:number)\n}return State.loaded(3);')).toEqual({
    kind: 'loaded',
    value: 3,
  });
});

it('selects transitive generic dependencies without capturing local type binders', () => {
  const source = `export enum A<T,U> {case first(value:T);case second(value:U);case callback(value:<T>(item:{[K in keyof T]:T[K]})=>U);case local(value:{[T in keyof T]:T});}
    export enum M<T>{case mapped(value:{[K in keyof T]:T[K]});}
    export enum C<T>{case item(value:T extends infer T ? T : never);}
    export const a=A.callback(item=>String(item));`;
  expect(checked(source).project.diagnostics()).toEqual([]);
  const code = transform(source).code;
  expect(code).toContain('callback<U>');
  expect(code).toContain('local(value:');
  expect(code).toContain('mapped<T>');
  expect(code).toContain('item<T>');
});

it('retains readonly payloads, recursive union references and defer/closure composition', () => {
  const source = `export enum Tree<T>{case leaf(value:T);case branch(left:Tree<T>,right:Tree<T>);}
    export const tree:Tree<number>=Tree.branch(Tree.leaf(1),Tree.leaf(2));`;
  expect(checked(source).project.diagnostics()).toEqual([]);
  expect(
    run(
      'let closed=false;const work=(body:()=>unknown)=>body();const result=work { enum State{case idle;}defer {closed=true;}return State.idle(); };return [result,closed];',
    ),
  ).toEqual([{ kind: 'idle' }, true]);
  expect(
    checked(
      'export enum State{case loaded(value:number);}export const state=State.loaded(3);state.value=4;',
    )
      .project.diagnostics()
      .map((d) => d.code),
  ).toContain(2540);
});

it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
  'maps copied payload and generic errors to original tokens with %j',
  (newline) => {
    const source = [
      'export enum State<T extends Missing> {',
      'case loaded(value: Missing);',
      'case generic(value:T);',
      '}',
    ].join(newline);
    const errors = checked(source)
      .project.diagnostics()
      .filter((d) => d.code === 2304);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(
      errors.every(
        (d) =>
          (d.line === 1 && d.column === source.indexOf('Missing')) ||
          (d.line === 2 && d.column === 'case loaded(value: '.length),
      ),
    ).toBe(true);
  },
);

it('provides constructor completion and maps original factory parameter type positions', () => {
  const source = `export enum State<T>{case idle;case loaded(value:T);} export const value=State.loaded(3);`;
  const { project, filename } = checked(source);
  const editor = new TwillEditor(project);
  const offset = source.indexOf('State.loaded') + 'State.'.length;
  expect(editor.completions(filename, offset).info?.entries.map((e) => e.name)).toEqual(
    expect.arrayContaining(['idle', 'loaded']),
  );
  expect(editor.renameInfo(filename, offset + 1).canRename).toBe(false);
  const result = transform(source);
  const typeOffset = source.indexOf('value:T') + 6;
  const pos = generatedPosition(result, 1, typeOffset);
  expect(originalPosition(result, pos.line!, pos.column!).column).toBe(typeOffset);
});

it('emits ordinary declaration types and precise native factory returns', () => {
  const { root } = checked('export enum State<T>{case idle;case loaded(value:T);}');
  const result = emitDeclarations(join(root, 'tsconfig.json'), { outDir: join(root, 'dist') });
  expect(result.diagnostics).toEqual([]);
  const declarations = readFileSync(join(root, 'dist/main.d.ts'), 'utf8');
  expect(declarations).toContain('readonly kind: "loaded"');
  expect(declarations).toContain('loaded<T>(value: T)');
});

it('matches the emitted JS size of equivalent handwritten record factories', async () => {
  const dialect =
    'enum State<T>{case idle;case loaded(value:T);}export function run(value:number){return State.loaded(value).value;}';
  const native =
    'const State={idle(){return{kind:"idle"};},loaded(value){return{kind:"loaded",value};}};export function run(value){return State.loaded(value).value;}';
  const options = { loader: 'ts' as const, target: 'es2022', minify: true };
  const [generated, baseline] = await Promise.all([
    esbuildTransform(transform(dialect).code, options),
    esbuildTransform(native, options),
  ]);
  expect(generated.code).toBe(baseline.code);
});
