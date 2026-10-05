import { expect, it } from 'vitest';
import { Parser } from 'acorn';
import { transform, TwillSyntaxError, originalPosition } from '../src/compiler';

function execute(source: string, reference: string, bindings: Record<string, unknown> = {}) {
  const output = transform(source, { language: 'js' }).code;
  Parser.parse(output, { ecmaVersion: 'latest' });
  const run = (code: string) =>
    Function(...Object.keys(bindings), code + '\nreturn result;')(...Object.values(bindings));
  expect(run(output)).toEqual(run(reference));
  return output;
}

it.each([
  [
    'unicode and escaped identifiers',
    'const result = [{ 数: 2 }].map { .数 + 1 };',
    'const result = [{ 数: 2 }].map(x => x.数 + 1);',
  ],
  [
    'comments and object expressions',
    'const result = [2].map { value in /* in else } */ ({ value, note: "defer {" }) };',
    'const result = [2].map(value => ({ value, note: "defer {" }));',
  ],
  [
    'regexp and templates',
    'const result = ["in", "else"].filter { value in /in|else/.test(`${value}`) };',
    'const result = ["in", "else"].filter(value => /in|else/.test(`${value}`));',
  ],
  [
    'default and rest parameters',
    'const result = invoke { (value = "in", ...rest) in [value, rest.length] };',
    'const result = invoke((value = "in", ...rest) => [value, rest.length]);',
  ],
  [
    'method private access',
    'class Box { #value = 2; run() { return [this].map { .#value }; } } const result = new Box().run();',
    'class Box { #value = 2; run() { return [this].map(x => x.#value); } } const result = new Box().run();',
  ],
  [
    'mutation of implicit members',
    'const input=[{count:1}]; const result=input.map { .count++ }.concat(input[0].count);',
    'const input=[{count:1}]; const result=input.map(x => x.count++).concat(input[0].count);',
  ],
  [
    'optional method receivers',
    'const result = [{n:2, read(){return this.n}}, {}].map { .read?.() ?? 0 };',
    'const result = [{n:2, read(){return this.n}}, {}].map(x => x.read?.() ?? 0);',
  ],
  [
    'nested lexical scopes',
    'const result = [{n:2}].map { for(let i=0;i<1;i++){if(.n) return .n;} return 0; };',
    'const result = [{n:2}].map(x => {for(let i=0;i<1;i++){if(x.n) return x.n;} return 0;});',
  ],
  [
    'switch closures',
    'const result = [1].map { n in (switch(n) { case 1: run { n + 1 }; default: 0; }) };',
    'const result = [1].map(n => { return (()=>{switch(n){case 1:return run(()=>n+1);default:return 0;}})(); });',
  ],
])('matches native JavaScript for %s', (_name, source, reference) => {
  execute(source!, reference!, {
    invoke: (callback: Function) => callback(undefined, 1, 2),
    run: (callback: Function) => callback(),
  });
});
it.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
  'maps closures, guard bindings and errors across %j line endings',
  (newline) => {
    const source = [
      'function run(value) {',
      'guard const number = value else { return 0; }',
      'return [number].map { n in n * 2 };',
      '}',
    ].join(newline);
    const output = transform(source, { language: 'js', filename: 'linebreaks.twill' });
    // Source-map coordinates are LF-delimited; language diagnostics count all JS line endings.
    const generated = output.code.split('\n');
    const line = generated.findIndex((text) => text.includes('n * 2'));
    expect(originalPosition(output, line + 1, generated[line]!.indexOf('n * 2'))).toMatchObject({
      line: source.slice(0, source.indexOf('n * 2')).split('\n').length,
      column: source.indexOf('n * 2') - source.lastIndexOf('\n', source.indexOf('n * 2')) - 1,
    });
    try {
      transform('const first = 1;' + newline + '.missing;', { filename: 'linebreaks.twill' });
      throw new Error('expected syntax error');
    } catch (error) {
      expect(error).toBeInstanceOf(TwillSyntaxError);
      expect(error).toMatchObject({ line: 2, column: 0 });
    }
  },
);
it.each([
  'run { (value, value) in value };',
  'run { (value = ) in value };',
  'function f(){ guard true else return 1; }',
  'const x = switch (1) { nonsense: 1; };',
  'const x = switch (1) { default: 1; default: 2; };',
  'const x = switch (1) { case 1: };',
  'const x = switch (1) { case {kind:"ok", bad:1}: 1; };',
  'run { .value } done: 1;',
  'run { ) };',
  'guard "unterminated',
  'run { ("unterminated) in 1 };',
])('rejects malformed syntax with bounded original-source diagnostics: %s', (source) => {
  let error: unknown;
  try {
    transform(source, { filename: 'invalid.twill', language: 'js' });
  } catch (cause) {
    error = cause;
  }
  expect(error).toBeInstanceOf(TwillSyntaxError);
  expect((error as TwillSyntaxError).offset).toBeGreaterThanOrEqual(0);
  expect((error as TwillSyntaxError).offset).toBeLessThanOrEqual(source.length);
  expect((error as TwillSyntaxError).message).toContain('invalid.twill:');
  expect((error as TwillSyntaxError).frame).toContain('^');
});
it('preserves native contextual identifiers and ASI without claiming keyword names', () => {
  const source = `let guard = 1, defer = 2; guard\nif (guard) guard++;\nconst next = 3; defer\n{ let value = 4; } const result = guard + defer + next;`;
  expect(execute(source, source)).toBe(source);
  const member =
    'const object = { guard: 1, defer: 2 }; const result = object.guard + object.defer;';
  expect(execute(member, member)).toBe(member);
});
it('does not reinterpret a native block after a class heritage expression', () => {
  const source =
    'class Base {} class Child extends Base { value = 1; } const result = new Child().value;';
  expect(execute(source, source)).toBe(source);
});
it('keeps computed class keys synchronous unless the cleanup actually awaits', async () => {
  const source = `async function run(events) { defer { class Box { [await Promise.resolve("key")]() {} } events.push(Object.getOwnPropertyNames(Box.prototype).join(",")); } return 42; }`;
  const output = transform(source, { language: 'js' }).code;
  const events: string[] = [];
  expect(await Function(output + ';return run;')()(events)).toBe(42);
  expect(events).toEqual(['constructor,key']);
  const nested = transform(
    'function run() { defer { function nested(){return 1;} class Box { method(){ return 2; } } } return 3; }',
    { language: 'js' },
  );
  expect(nested.code).not.toContain('async');
  expect(Function(nested.code + '; return run();')()).toBe(3);
});

it('keeps source error metadata and frames usable without optional parser coordinates', () => {
  const error = new TwillSyntaxError('bad source', 'file.twill', {
    message: 'Invalid syntax (9:4)',
  });
  expect(error).toMatchObject({ line: 1, column: 0, offset: 0, frame: 'bad source\n^' });
  expect(error.message).toBe('file.twill:1:1: Invalid syntax');
});
