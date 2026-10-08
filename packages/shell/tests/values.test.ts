import { expect, it } from 'vitest';
import { Command, Environment, Output, Input, Subprocess } from '../src/index.js';
import { childEnvironment } from '../src/values.js';

it.each([null, 0, ''] as unknown[])('rejects invalid argument collections %j', (value) => {
  expect(() => Command.path(process.execPath, value as string[])).toThrow(TypeError);
});
it.each([null, undefined, 0, {}, '\0'])('rejects invalid individual arguments %j', (value) => {
  expect(() => Command.path(process.execPath, [value as string])).toThrow(TypeError);
});
it.each(['', '\0', '/bin/node', 'a\\b', 'C:node'])(
  'requires a bare valid executable name %j',
  (value) => expect(() => Command.name(value)).toThrow(TypeError),
);
it('requires an explicit absolute path and accepts default empty argv', () => {
  expect(() => Command.path('relative')).toThrow(TypeError);
  expect(() => Command.path('')).toThrow(TypeError);
  expect(Command.path(process.execPath).arguments).toEqual([]);
  expect(Command.name('node').arguments).toEqual([]);
});
it.each([
  {},
  { limit: 0 },
  { limit: -1 },
  { limit: 1.5 },
  { limit: Infinity },
  { limit: NaN },
  { limit: Number.MAX_SAFE_INTEGER + 1 },
])('validates finite positive byte limits %j', (options) => {
  expect(() => Output.text(options as { limit: number })).toThrow(TypeError);
  expect(() => Output.bytes(options as { limit: number })).toThrow(TypeError);
});
it('freezes policies, snapshots own environment keys and rejects malformed environment data', () => {
  expect(Object.isFrozen(Output.text({ limit: 10 }))).toBe(true);
  expect(Object.isFrozen(Input.inherit())).toBe(true);
  const env = JSON.parse('{"KEY":"value","__proto__":"literal"}');
  expect(Environment.replace(env).values.KEY).toBe('value');
  expect(Environment.replace(env).values.__proto__).toBe('literal');
  for (const values of [
    null,
    [],
    0,
    '',
    { 'a=b': 'x' },
    { '': 'x' },
    { 'a\0': 'x' },
    { A: 0 },
    { A: '\0' },
  ])
    expect(() => Environment.replace(values as any)).toThrow(TypeError);
  expect(Environment.inherit().values).toEqual({});
});
it('normalizes Windows environment keys and removes values case-insensitively', () => {
  const saved = { ...process.env };
  try {
    process.env.TWILL_CASE = 'one';
    process.env.twill_case = 'two';
    const env = childEnvironment(
      Environment.inherit({ tWiLl_CaSe: undefined, VALUE: 'three' }),
      'win32',
    )!;
    expect(Object.keys(env).some((key) => key.toUpperCase() === 'TWILL_CASE')).toBe(false);
    expect(env.VALUE).toBe('three');
    const replaced = childEnvironment(
      Environment.replace({ PATH: 'first', Path: 'second' }),
      'win32',
    )!;
    expect(Object.keys(replaced)).toEqual(['Path']);
    expect(replaced.Path).toBe('second');
    expect(childEnvironment(Environment.replace({ KEEP: 'ok', DROP: undefined }), 'linux')).toEqual(
      { KEEP: 'ok' },
    );
    expect(childEnvironment(undefined)).toBeUndefined();
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
it.each([
  null,
  [],
  0,
  { cwd: '' },
  { cwd: '\0' },
  { cwd: 0 },
  { environment: {} },
  { output: null },
  { error: null },
  { output: {} },
  { input: {} },
  { check: 1 },
  { signal: {} },
  { timeoutMs: 0 },
  { timeoutMs: Infinity },
  { gracePeriodMs: -1 },
  { killTimeoutMs: 0 },
  { timeoutMs: 2147483648 },
  { shell: true },
  { output: { ...Output.text({ limit: 1 }), limit: Infinity } },
  { output: { ...Output.inherit(), kind: 'unknown' } },
])('rejects invalid run options before launch %j', async (options) => {
  await expect(
    Subprocess.run(Command.path(process.execPath), options as any),
  ).rejects.toBeInstanceOf(TypeError);
});
it('requires a constructed command and rejects detached byte views before launch', async () => {
  await expect(Subprocess.run({} as Command)).rejects.toBeInstanceOf(TypeError);
  const input = new Uint8Array(2);
  structuredClone(input, { transfer: [input.buffer] });
  await expect(Subprocess.run(Command.path(process.execPath), { input })).rejects.toBeInstanceOf(
    TypeError,
  );
});
