import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { transform, originalPosition } from '../src/compiler';
import { parseSyntax } from '../src/syntax';
import { TwillProject } from '../src/project';
import { TwillEditor } from '../src/editor';

const roots: { root: string; project: TwillProject }[] = [];
afterEach(() => {
  for (const { root, project } of roots.splice(0)) {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
function checked(source: string, recover = false) {
  const root = mkdtempSync(join(tmpdir(), 'twill-if-binding-'));
  const filename = join(root, 'main.twill');
  writeFileSync(filename, source);
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
        noUnusedLocals: true,
      },
      include: ['*.twill'],
    }),
  );
  const project = new TwillProject(join(root, 'tsconfig.json'), {}, { recover });
  roots.push({ root, project });
  return { project, filename };
}
function run(body: string, input?: unknown, record?: (value?: any) => any) {
  const code = transform(`function run(input,record){${body}}`, { language: 'js' }).code;
  return Function(code + ';return run;')()(input, record);
}

it.each([0, false, '', NaN, 5, {}, [], null, undefined])(
  'binds only non-nullish %s and evaluates once',
  (input) => {
    let calls = 0;
    expect(
      run('if const value=record(input){return value;}else{return "missing";}', input, (value) => {
        calls++;
        return value;
      }),
    ).toBe(input == null ? 'missing' : input);
    expect(calls).toBe(1);
  },
);
it('limits bindings to success and resolves outer names in initializers and else', () => {
  expect(run('const undefined=7;if const value=input{return value;}return 0;', null)).toBe(0);
  expect(run('const undefined=7;if const value=input{return value;}return 0;')).toBe(0);
  for (const input of [4, null])
    expect(
      run(
        'const value=input; if const value=value{record(value);}else{record(value);}return value;',
        input,
        (v) => v,
      ),
    ).toBe(input);
  expect(run('if const value=input{record(value);}return typeof value;', 3, () => {})).toBe(
    'undefined',
  );
  expect(run('if const value=input{}else{const value=7;return value;}return 0;', null)).toBe(7);
});
it('recognizes complete binding branches as guard exits', () => {
  expect(
    run('guard false else{if const value=input{return value;}else{return 0;}}return -1;', 3),
  ).toBe(3);
  expect(() =>
    transform('function f(input){guard false else{if const value=input{return value;}}}'),
  ).toThrow(/Every guard else path/);
});
it('keeps incomplete member and suffix recovery source-safe', () => {
  const source =
    'export function f(input:{value:number}|null){if const {value}=input{return value.}}';
  const { project, filename } = checked(source, true);
  expect(
    new TwillEditor(project)
      .completions(filename, source.indexOf('value.}') + 6)
      .info?.entries.map((e) => e.name),
  ).toContain('toFixed');
});
it('maps malformed introducer comments at the main parser offset', () => {
  const source = 'function f(){if /* unfinished';
  expect(() => transform(source)).toThrow(/Unterminated comment/);
  try {
    transform(source);
  } catch (error) {
    expect(error).toMatchObject({ offset: source.indexOf('/*'), column: source.indexOf('/*') });
  }
});
it('checks the whole object before native defaults, getters and rest', () => {
  const events: string[] = [];
  const body =
    'if const {value=record("default"),...rest}=input{record("body");return [value,rest];}else{return "missing";}';
  expect(run(body, null, (v) => events.push(v))).toBe('missing');
  expect(events).toEqual([]);
  const input = {
    get value() {
      events.push('getter');
      return undefined;
    },
    extra: 3,
  };
  expect(
    run(body, input, (v) => {
      events.push(v);
      return 4;
    }),
  ).toEqual([4, { extra: 3 }]);
  expect(events).toEqual(['getter', 'default', 'body']);
  expect(run('if const {length}=input{return length;}return -1;', '')).toBe(0);
});
it('preserves array iterator close, native defaults and pattern TDZ', () => {
  const events: string[] = [];
  const input = {
    [Symbol.iterator]() {
      return {
        next() {
          events.push('next');
          return { value: undefined, done: false };
        },
        return() {
          events.push('close');
          return { done: true };
        },
      };
    },
  };
  expect(
    run('if const [first=record("default")]=input{return first;}return 0;', input, (v) => {
      events.push(v);
      return 2;
    }),
  ).toBe(2);
  expect(events).toEqual(['next', 'default', 'close']);
  expect(() => run('if const [first=second,second=2]=input{return first;}return 0;', [])).toThrow(
    ReferenceError,
  );
  expect(() => run('if const {nested:{value}}=input{return value;}return 0;', {})).toThrow(
    TypeError,
  );
  expect(
    run('if const [first=2,...rest]=input{return [first,rest];}return 0;', [undefined, 3, 4]),
  ).toEqual([2, [3, 4]]);
});
it('propagates initializer and destructuring exceptions without selecting else', () => {
  const error = new Error('failed');
  expect(() =>
    run('if const value=record(){return value;}else{return 0;}', null, () => {
      throw error;
    }),
  ).toThrow(error);
  expect(() =>
    run('if const {value}=input{return value;}else{return 0;}', {
      get value() {
        throw error;
      },
    }),
  ).toThrow(error);
});
it('composes else-if and preserves the native dangling else owner', () => {
  const body =
    'if(input!==false) if const value=input{if const other=value{return other;}}else if const fallback=record(){return fallback;}else if(true){return -1;}else{return -2;} else{return -3;} return 0;';
  expect(run(body, 4)).toBe(4);
  expect(run(body, null, () => 7)).toBe(7);
  expect(run(body, null, () => null)).toBe(-1);
  expect(run(body, false)).toBe(-3);
});
it.each([
  'if const value=record(input){return value;}return 0;',
  'if /*intro*/ const value=record(input) /*body*/ {return value;}return 0;',
  'if const value=(record(input) { x in x+1 }){return value;}return 0;',
  'if const value=record(input, x => x+1){return value;}return 0;',
  'if const value=record(input, [input].map { x in x+1 }){return value;}return 0;',
])('disambiguates branch braces and nested callback expressions: %s', (body) => {
  const fn = (value: number, callback?: ((x: number) => number) | number[]) =>
    typeof callback === 'function' ? callback(value) : callback ? callback[0] : value;
  expect(run(body, 3, fn)).toBe(body.includes('x+1') ? 4 : 3);
});
it('accepts native object, regex, template, ternary and arrow initializers', () => {
  expect(run('if const {value}={value:input}{return value;}return 0;', 3)).toBe(3);
  expect(run('if const value=/[{]/.exec(input){return value[0];}return 0;', '{')).toBe('{');
  expect(run('if const value=`${input}{}`{return value;}return 0;', 'x')).toBe('x{}');
  expect(
    run('if const value=input?record(3):record(4){return value;}return 0;', false, (v) => v),
  ).toBe(4);
  expect(run('if const callback=()=>{return input;}{return callback();}return 0;', 3)).toBe(3);
});
it('retains TS annotations/generics, match initializers and TSX expressions', () => {
  for (const language of ['ts', 'tsx'] as const) {
    const source =
      'function f(input:number|null){if const value:number|null=input{ return value.toFixed(); }return "missing";}';
    expect(parseSyntax(source, { language }).ifBindings).toHaveLength(1);
    expect(transform(source, { language }).code).toContain('const __twillIf0:number|null=input');
  }
  expect(transform('if const value=lookup<number>(){use(value);}').ifBindings).toBe(1);
  expect(
    transform('if const view=<Panel value={1}/>{use(view);}', { language: 'tsx' }).ifBindings,
  ).toBe(1);
  expect(
    run('if const value=match(input){case State.ok():4;default:0;}{return value;}return -1;', {
      kind: 'ok',
    }),
  ).toBe(4);
});
it('keeps awaited initialization and rejection in the native async scope', async () => {
  const code = transform(
    'async function run(input){if const value=await input{return value;}else{return 0;}}',
  ).code;
  expect(code).not.toMatch(/=>|Promise|async.*async/s);
  const fn = Function(code + ';return run;')();
  expect(await fn(Promise.resolve(3))).toBe(3);
  expect(await fn(Promise.resolve(null))).toBe(0);
  const error = new Error('rejected');
  await expect(fn(Promise.reject(error))).rejects.toBe(error);
});
it('keeps generator yield and close cleanup in the enclosing generator', () => {
  const code = transform(
    'function* run(record){try{if const value=yield 1{return value;}return 0;}finally{record();}}',
    { language: 'js' },
  ).code;
  const events: number[] = [];
  const fn = Function(code + ';return run;')();
  const iterator = fn(() => events.push(1));
  expect(iterator.next()).toEqual({ value: 1, done: false });
  expect(iterator.next(3)).toEqual({ value: 3, done: true });
  const closed = fn(() => events.push(2));
  closed.next();
  closed.return(7);
  expect(events).toEqual([1, 2]);
});
it('preserves labelled loop exits, branch defer lifetime and finally', () => {
  const events: any[] = [];
  expect(
    run(
      'outer:for(const item of input){if const value=item{defer {record(value);}if(value===2)continue outer;if(value===3)break outer;record(value*10);}else{record("missing");}}return 8;',
      [1, null, 2, 3, 4],
      (v) => events.push(v),
    ),
  ).toBe(8);
  expect(events).toEqual([10, 1, 'missing', 2, 3]);
  expect(
    run('try{if const value=input{return value;}return 0;}finally{record("finally");}', 3, (v) =>
      events.push(v),
    ),
  ).toBe(3);
  expect(events.at(-1)).toBe('finally');
});
it('uses hygienic temporaries and adds no runtime imports in either mode', () => {
  const source =
    'function f(input){const __twillIf0=7;if const value=input{return [value,__twillIf0];}return 0;}';
  const inline = transform(source, { language: 'js' });
  expect(inline.code).toContain('const __twillIf1');
  expect(inline.code).not.toMatch(/=>|import|Promise|\[\]/);
  expect(transform(source, { language: 'js', runtime: 'external' }).code).toBe(inline.code);
});
it('collects native component children through success and else scopes', () => {
  const source =
    'function Panel(props:any){return <section>{props.children}</section>;}export function App(input:{value:string}|null){return Panel {if const {value}=input{<span>{value}</span>;}else{<b>Missing</b>;}};}';
  const code = transform(source, { filename: 'view.twillx' }).code;
  const module: Record<string, any> = {};
  Function(
    'require',
    'exports',
    ts.transpileModule(code, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )(createRequire(import.meta.url), module);
  expect(renderToStaticMarkup(module.App({ value: 'Ada' }))).toBe(
    '<section><span>Ada</span></section>',
  );
  expect(renderToStaticMarkup(module.App(null))).toBe('<section><b>Missing</b></section>');
  expect(() =>
    transform('const view=Panel{if const value=input{return value;}};', {
      filename: 'view.twillx',
    }),
  ).toThrow(/collect expressions/);
});
it('checks non-nullish inference and branch-local outer-name shadowing', () => {
  const { project } = checked(
    'export function f(input:{value:number}|null){const value=7;if const {value}=input{return value.toFixed();}else{return value.toFixed();}}',
  );
  expect(project.diagnostics()).toEqual([]);
  expect(
    checked(
      'export function f(input:number|null){const value=input;if const value=value{return value.toFixed();}return value;}',
    ).project.diagnostics(),
  ).toEqual([]);
  const { project: bad } = checked(
    'export function f(input:number|null){if const value=input{return value.missing();}else{return value;}return value;}',
  );
  expect(bad.diagnostics().map((d) => d.code)).toEqual(expect.arrayContaining([2339, 2304]));
});
it.each([
  'if const value=input,other=input{}',
  'if const value=input;{}',
  'if const value=input return value;',
  'if const value=input{}else return 0;',
  'if const value=input{const value=3;}',
  'if const value=input{var value=3;}',
  'if const value {}',
  'if let value=input{}',
  'if (const value=input){}',
])('rejects illegal binding syntax: %s', (source) => {
  expect(() => transform(`function f(input){${source}}`)).toThrow(SyntaxError);
});
it.each([
  'if /* condition */ (input){use(input);}else{missing();}',
  'if(input){use(input);}else{missing();}',
  'if(input)if(other)use(input);else missing();',
  'const text="if const x=lookup(){}"; // if const x=lookup(){}',
])('preserves native source: %s', (source) => {
  expect(transform(source).code).toBe(source);
});
it('keeps lexical receiver, arguments, super and new.target in the native method', () => {
  const source =
    'class Base{read(){return 3;}}class Child extends Base{read(input){if const value=super.read(){return [value,this,arguments[0],new.target];}return null;}}';
  const code = transform(source, { language: 'js' }).code;
  const Child = Function(code + ';return Child;')();
  const child = new Child();
  expect(child.read(7)).toEqual([3, child, 7, undefined]);
});
it('supports nested binding scopes inside callbacks and implicit members', () => {
  expect(
    run('return input.map {if const value=.value{return value;}return 0;};', [
      { value: 2 },
      { value: null },
      { value: 0 },
    ]),
  ).toEqual([2, 0, 0]);
  expect(
    run(
      'if const value=(record() {if const other=input{return other;}return 0;}){return value;}return -1;',
      3,
      (cb) => cb(),
    ),
  ).toBe(3);
});
it('checks const writes and original type-annotation diagnostics', () => {
  expect(
    checked(
      'export function f(input:number|null){if const value=input{value=3;return value;}return 0;}',
    )
      .project.diagnostics()
      .map((d) => d.code),
  ).toContain(2588);
  expect(
    checked(
      'export function f(input:string){if const value:number|null=input{return value;}return 0;}',
    )
      .project.diagnostics()
      .map((d) => d.code),
  ).toContain(2322);
});
it('maps moved bindings and body diagnostics to original source', () => {
  const source =
    'export function f(input:number|null){if const value=input{return value.missing();}return 0;}';
  const result = transform(source);
  for (const token of ['value =', 'value.missing', 'input;']) {
    const generated = result.code.indexOf(token);
    expect(originalPosition(result, 1, generated).column).toBe(
      source.indexOf(token === 'value =' ? 'value=input' : token === 'input;' ? 'input{' : token),
    );
  }
  const { project } = checked(source);
  expect(project.diagnostics().find((d) => d.code === 2339)?.column).toBe(
    source.indexOf('missing'),
  );
});
it.each(['\n', '\r\n'])('maps multiline binding/body errors across %j', (newline) => {
  const source = `export function f(input:number|null){${newline}if const value=input{${newline}return value.missing();}}`;
  const { project } = checked(source);
  expect(project.diagnostics().find((d) => d.code === 2339)).toMatchObject({ line: 3, column: 13 });
});
it('retains Unicode binding names and native getter errors in success', () => {
  expect(run('if const {值:输出}=input{return 输出;}return 0;', { 值: 7 })).toBe(7);
  expect(
    checked(
      'export function f(input:{值:number}|null){if const {值:输出}=input{return 输出.toFixed();}return "missing";}',
    ).project.diagnostics(),
  ).toEqual([]);
});
it('completes, navigates and renames branch bindings without touching outer names', () => {
  const source =
    'export function f(input:{value:number}|null){const value=7;if const {value}=input{return value.toFixed();}return value;}';
  const { project, filename } = checked(source);
  const editor = new TwillEditor(project);
  expect(
    editor
      .completions(filename, source.indexOf('value.toFixed') + 6)
      .info?.entries.map((e) => e.name),
  ).toContain('toPrecision');
  const edits = editor.rename(filename, source.indexOf('{value}') + 1, 'amount');
  expect(edits?.map((e) => source.slice(e.span.start, e.span.start + e.span.length))).toEqual([
    'value',
    'value',
  ]);
});
