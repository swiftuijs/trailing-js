import { expect, it } from 'vitest';
import { format } from '../src/index';
import { format as standalone } from '../src/standalone';
import { transform } from '@swiftuijs/twill';
import { format as nativeFormat } from 'prettier';
import ts from 'typescript';
const native = (source: string) =>
  ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, removeComments: true },
  }).outputText;
const sources = [
  'function read(state){return switch(state){case enum State.failed({error}):throw error;default:0;};}',
  'function read(state){return switch(state){case enum State.loaded({}):0;case enum State.failed():throw new Error();};}',
  'export enum State<T>{case idle;case loaded(value:T);}export function read(state:State<number>){return switch(state){case enum State.idle():0;case enum State.loaded({value:amount}):amount;};}',
  'const result=switch(state){case enum NS.State.loaded({value=3,nested:{id},...rest}):[value,id,rest];default:throw new Error();};',
  'function read(state){return switch(state){case enum /*ref*/ State.loaded(/*before*/ { /*binding*/value} /*after*/):value /*result*/;default:0;};}',
  'function read(state){return switch(state){case enum State.idle(/*empty*/):0;default:0;};}',
  'const result=switch(state){case enum State.loaded({value}):switch(value){case 1:2;default:0;};case {kind:"idle"}:0;};',
];
const preferred = sources.map((source) =>
  source.replaceAll('switch(state)', 'match(state)').replaceAll('case enum', 'case'),
);
preferred.push(
  'function read(state){return match /*subject*/ ((state), /*comma*/){ /*arms*/ case State.loaded({value}):value;default:0;};}',
);
it.each([...sources, ...preferred])(
  'formats enum patterns without lowering and preserves behavior: %s',
  async (source) => {
    for (const semi of [true, false]) {
      const formatted = await format(source, { semi });
      expect(formatted).toContain(source.includes('case enum') ? 'case enum' : 'match');
      expect(await format(formatted, { semi })).toBe(formatted);
      expect(await standalone(source, { semi })).toBe(formatted);
      expect(await nativeFormat(native(transform(formatted).code), { parser: 'typescript' })).toBe(
        await nativeFormat(native(transform(source).code), { parser: 'typescript' }),
      );
      for (const comment of source.match(/\/\*.*?\*\//g) ?? [])
        expect(formatted).toContain(comment);
    }
  },
);
