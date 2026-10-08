import { expect, it } from 'vitest';
import { format } from '../src/index.twill';
import { transform } from '@swiftuijs/twill';

it.each([true, false])('formats associated enums without lowering, with semi=%s', async (semi) => {
  const source =
    'export enum State<T extends object,E=Error>{case idle;case empty();case loaded(value:T);case failed(error:E);}';
  const formatted = await format(source, { semi });
  expect(formatted).toContain('export enum State<T extends object, E = Error>');
  expect(formatted).toContain('case idle');
  expect(formatted).toContain('case empty()');
  expect(formatted).toContain('case loaded(value: T)');
  expect(formatted).not.toContain('interface');
  expect(formatted).not.toContain('unknown');
  expect(await format(formatted, { semi })).toBe(formatted);
  expect(transform(formatted).associatedEnums).toHaveLength(1);
});

it('preserves comments, complex payload types, native enums and nested declarations', async () => {
  const source = `export enum /*state*/ State<T>{
    // idle state
    case /*before*/ idle /*after*/;
    case loaded(value: /*payload*/ T, callback: <U>(input:U)=>T);
  }
  enum Native {A=1,B=2}
  export function run(){enum Nested{case value(data:{value:number});}return Nested.value({value:3});}`;
  const formatted = await format(source);
  for (const comment of ['/*state*/', '// idle state', '/*before*/', '/*after*/', '/*payload*/'])
    expect(formatted).toContain(comment);
  expect(formatted).toContain('enum Native');
  expect(await format(formatted)).toBe(formatted);
  expect(transform(formatted).associatedEnums).toHaveLength(2);
});

it('preserves empty-case comments and original type/member diagnostic positions', async () => {
  const source = 'enum State{case idle(/*empty*/);case loaded(value:{readonly nested:string[]});}';
  const formatted = await format(source);
  expect(formatted).toContain('/*empty*/');
  expect(formatted).toContain('readonly nested: string[]');
  expect(await format(formatted)).toBe(formatted);
});

it.each([true, false])(
  'wraps long case payloads and remains idempotent with semi=%s',
  async (semi) => {
    const formatted = await format(
      'export enum State<T>{case item(firstPayload:T,secondPayload:T,thirdPayload:T);}',
      { printWidth: 40, semi },
    );
    expect(formatted).toContain('case item(\n');
    expect(formatted.split('\n').every((line) => line.length <= 40)).toBe(true);
    expect(await format(formatted, { printWidth: 40, semi })).toBe(formatted);
    expect(transform(formatted).associatedEnums).toHaveLength(1);
  },
);
