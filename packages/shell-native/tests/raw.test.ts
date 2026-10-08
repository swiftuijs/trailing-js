import { nativeTarget } from '../src/platform.twill';
import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import type { NativeBindings, NativeOptions } from '../src/bindings.twill';
const native = createRequire(import.meta.url)(`../native/${nativeTarget()}.node`) as NativeBindings;
const valid: NativeOptions = {
  executable: process.execPath,
  arguments: [],
  environment: {},
  inheritInput: false,
  discardOutput: true,
  discardError: true,
  gracePeriodMs: 0,
  killTimeoutMs: 1000,
};
it.each([
  { executable: '' },
  { executable: 'bad\0exe' },
  { arguments: ['bad\0arg'] },
  { cwd: '' },
  { cwd: 'bad\0cwd' },
  { environment: { '': 'value' } },
  { environment: { 'bad=key': 'value' } },
  { environment: { KEY: 'bad\0value' } },
  { inheritInput: true, input: Buffer.from('x') },
  ...[0, -1, NaN, Infinity, 0.5, 2 ** 32].map((timeoutMs) => ({ timeoutMs })),
  ...[0, -1, NaN, Infinity, 1.5, 2 ** 53].map((outputLimit) => ({
    outputLimit,
    discardOutput: false,
  })),
  { outputLimit: 10, discardOutput: true },
  { errorLimit: 10, discardError: true },
  { gracePeriodMs: -1 },
  { gracePeriodMs: 2 ** 32 },
  { killTimeoutMs: 0 },
])('rejects malformed direct native arguments before launching: %j', (invalid) => {
  expect(() => native.start({ ...valid, ...invalid })).toThrow();
});
