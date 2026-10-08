import { expect, it } from 'vitest';
import { format, formatGenerated } from '../src/index.twill';
import { format as standalone, formatGenerated as generated } from '../src/standalone.twill';
import { transform } from '@swiftuijs/twill';

it.each([
  ['code.twill', 'export const doubled=[1,2,3].map { n in n*2 };'],
  [
    'code.twill',
    'export function run(value:number|undefined){defer {void 1};guard const n=value else {return 0;}return n;}',
  ],
  ['view.twillx', 'export const view=Card({title:"Hi"}) { "Hello" };'],
  [
    'view.twillx',
    'export const view=Card({}) {for(const item of items){Text({key:item}){item};}};',
  ],
])('matches Node formatting and is idempotent for %s', async (filepath, source) => {
  const options = { filepath, singleQuote: true };
  const output = await standalone(source, options);
  expect(output).toBe(await format(source, options));
  expect(await standalone(output, options)).toBe(output);
  const lowered = transform(source, { filename: filepath }).code;
  expect(await generated(lowered, options)).toBe(await formatGenerated(lowered, options));
});
