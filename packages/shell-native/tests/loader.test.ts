import { expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { nativeTarget } from '../src/platform.js';
import type { NativeBindings } from '../src/bindings.js';
it('checks the prebuild protocol, caches a valid addon, and forwards the exit barrier', async () => {
  vi.resetModules();
  const fresh = await import('../src/bindings.js');
  expect(() => fresh.shutdownBackend()).not.toThrow();
  const native = createRequire(import.meta.url)(
    `../native/${nativeTarget()}.node`,
  ) as NativeBindings;
  vi.spyOn(native, 'protocol').mockReturnValue(0);
  expect(() => fresh.loadBackend()).toThrow('expected protocol 1');
  vi.restoreAllMocks();
  expect(fresh.loadBackend()).toBe(native);
  expect(fresh.loadBackend()).toBe(native);
  const shutdown = vi.spyOn(native, 'shutdown').mockImplementation(() => {});
  fresh.shutdownBackend();
  expect(shutdown).toHaveBeenCalledOnce();
});
