import { expect, it } from 'vitest';
import { transform, TwillSyntaxError } from '../src/compiler';
import { recoverTransform } from '../src/recovery';
it.each([
  'users.map { .',
  'users.map { .name',
  'run({value: [1,2]',
  'run { value in (value + 1',
  'run { (() => 1)()',
])('repairs bounded unfinished editor input while strict compilation rejects it: %s', (source) => {
  expect(() => transform(source)).toThrow(TwillSyntaxError);
  const result = recoverTransform(source, { filename: 'editor.twill' });
  expect(result.map.sourcesContent).toEqual([source]);
  expect(result.code.length).toBeLessThan(source.length + 300);
});
it('keeps a complete document unchanged and refuses interior errors or unbounded nesting', () => {
  const source = 'const value = [1].map { n in n + 1 };';
  expect(recoverTransform(source, {}).code).toBe(transform(source).code);
  for (const invalid of [
    'const = ;',
    'run { value in + * value };',
    '((((((((((((1',
    '\"unterminated',
    'const value = 1 +',
  ])
    expect(() => recoverTransform(invalid, {})).toThrow(TwillSyntaxError);
});
it('ignores quoted and commented delimiters when completing suffixes', () => {
  const source = 'run { value in const marker = "})]"; /* } ] */ value';
  const result = recoverTransform(source, { filename: 'editor.twill' });
  expect(result.map.sourcesContent).toEqual([source]);
  expect(result.code).toContain('const marker = "})]"');
  expect(() =>
    Function('run', result.code)((body: (value: number) => unknown) => body(3)),
  ).not.toThrow();
});

it('maps successive interior repairs before providing completion in later callbacks', () => {
  const source = 'const users=[{active:true}]; const values=users.map { . }.map { . };';
  const result = recoverTransform(source, { filename: 'editor.twill' });
  expect(result.code.match(/\.\s*__twillIncomplete/g)).toHaveLength(2);
  expect(result.map.sourcesContent).toEqual([source]);
  expect(() => transform(source)).toThrow(TwillSyntaxError);
});
