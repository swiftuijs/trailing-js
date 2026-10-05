import { expect, it } from 'vitest';
import { transform } from '@swiftuijs/twill';
import { format } from '../src/index.js';
import { format as standalone } from '../src/standalone.js';

const sources = [
  'function f(v){guard const {nested:{value=2},...rest}=v else{return 0;}return [value,rest];}',
  'function f(v){guard const [first,...rest]:number[]|null=v else{throw Error();}return [first,rest];}',
  'function f(v){return switch(v){case 1: 2;default: throw Error("bad");};}',
  'const x=2+switch(v){case 1: {answer:3};default: {answer:4};}.answer;',
  'const x=switch(v){case {kind:"a",value:answer=3,...rest}: [answer,rest];case {kind:"b",value}: value;};',
  'const x=[1].map {n in switch(n){case 1: switch(n){case 1: 3;default: 0;};default: 0;}};',
  'function f(v){return switch(v){case {kind:"a",myTag,value=3}: myTag+value;default: 0;};}',
  'function f(v){return switch(v){/* subject */case {kind:"a", /* binding */ value}: value /* value */; // next\n default: 0;};}',
  'async function f(v){return switch(await v){case 1: await v;default: 0;};}',
  'function f(v){return (((switch(v){case {kind:"a",value}: (value+1);default: (0);})));}',
];
it.each(sources)('formats branching idempotently: %s', async (source) => {
  for (const semi of [true, false]) {
    const formatted = await format(source, { semi });
    expect(await format(formatted, { semi })).toBe(formatted);
    expect(await standalone(source, { semi })).toBe(formatted);
    expect(() => transform(formatted)).not.toThrow();
    // Formatting must preserve the exact lowered behavior, not merely parse.
    const nativeBefore = transform(source).code;
    const nativeAfter = transform(formatted).code;
    const prettier = await import('prettier');
    expect(await prettier.format(nativeAfter, { parser: 'typescript' })).toBe(
      await prettier.format(nativeBefore, { parser: 'typescript' }),
    );
  }
});
it('retains every original branch comment', async () => {
  const formatted = await format(sources[7]!);
  for (const comment of ['/* subject */', '/* binding */', '/* value */', '// next'])
    expect(formatted).toContain(comment);
});
