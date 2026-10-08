import { expect, it } from 'vitest';
import { transform } from '@swiftuijs/twill';
import { format } from '../src/index.twill';
import { format as standalone } from '../src/standalone.twill';
import * as prettier from 'prettier';

const sources = [
  'function f(input){if const value=(factory() {/**\n * ; () annotation\n */ ()=>input})(){return value;}return 0;}',
  'function f(input){if const value=(factory() {/* keep */ ()=>input})(){return value;}return 0;}',
  'function f(input){if const value=(factory() {\n// keep\n()=>input})(){return value;}return 0;}',
  'function f(input){const __TwillIf0=3;if const value=input{return value+__TwillIf0;}return 0;}',
  'function f(input){if const value=input{return value;}return 0;}',
  'function f(input){if const {nested:{value=2},...rest}:Record<string,any>|null=input{return [value,rest];}else{return 0;}}',
  'function f(input){if const [first=2,...rest]=input{return [first,rest];}else if const x=lookup(){return x;}else if(ready){return 2;}else{return 0;}}',
  'function f(input){if const value=(lookup(input) {x in x+1}){return value;}return 0;}',
  'function f(input){if const value=1+(lookup(input) {x in x+1}){return value;}return 0;}',
  'function f(input){if const value=(lookup(input) {x in x+1}).toString(){return value;}return 0;}',
  'function f(input){if const value=(factory() {()=>input})(){return value;}return 0;}',
  'function f(input){if const value=input?(lookup(input) {x in x+1}):null{return value;}return 0;}',
  'function f(input){if const value=lookup(input, [1].map {x in x+1}){return value;}return 0;}',
  'async function f(input){if const value=await lookup(input){defer {close(value);}return value;}return 0;}',
  'function f(input){if(ready)if const value=input{}else{}else other();}',
  'function f(input){if const value=match(input){case State.ok():3;default:0;}{return value;}return 0;}',
  'function f(input){if const {value}={value:input}{return value;}return 0;}',
  'function f(input){if /* intro */ const { /* pattern */ value /* name */ } /* annotation */ = /* init */ lookup(input) /* body */ { /* success */ use(value); } /* else */ else { /* failure */ missing(); }}',
];
it.each(sources)(
  'formats if bindings with native behavior and standalone parity: %s',
  async (source) => {
    for (const semi of [true, false]) {
      const formatted = await format(source, { semi });
      expect(await format(formatted, { semi })).toBe(formatted);
      expect(await standalone(source, { semi })).toBe(formatted);
      expect(await prettier.format(transform(formatted).code, { parser: 'typescript' })).toBe(
        await prettier.format(transform(source).code, { parser: 'typescript' }),
      );
      expect(formatted.replaceAll('__TwillIf0', '')).not.toMatch(/__Twill|__twill/);
    }
  },
);
it('retains every comment at the binding, initializer and branch boundaries', async () => {
  const formatted = await format(sources.at(-1)!);
  for (const comment of [
    'intro',
    'pattern',
    'name',
    'annotation',
    'init',
    'body',
    'success',
    'else',
    'failure',
  ])
    expect(formatted).toContain(`/* ${comment} */`);
});
it('retains necessary trailing-call grouping without adding it to ordinary calls', async () => {
  expect(
    await format('function f(input){if const value=(lookup(input) {x in x+1}){return value;}}'),
  ).toContain('value = (lookup(input)');
  expect(await format('function f(input){if const value=lookup(input){return value;}}')).toContain(
    'value = lookup(input)',
  );
});
