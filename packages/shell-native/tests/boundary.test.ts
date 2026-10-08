import { afterEach, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { createRequire } from 'node:module';
import * as bindings from '../src/bindings.js';
import {
  Command,
  Output,
  Subprocess,
  ProcessError,
  ProcessLaunchError,
  ProcessIOError,
  ProcessTeardownError,
} from '../src/index.js';
import type { NativeBindings, NativeFailure, NativeOutcome } from '../src/bindings.js';

afterEach(() => vi.restoreAllMocks());
const command = Command.path(process.execPath);
function backend(outcome: Partial<NativeOutcome> = {}) {
  const native: NativeBindings = {
    protocol: () => 1,
    start: vi.fn(() => ({
      id: 7,
      promise: Promise.resolve({ processIdentifier: 42, code: 0, cleanupErrors: [], ...outcome }),
    })),
    cancel: vi.fn(),
    shutdown: vi.fn(),
  };
  vi.spyOn(bindings, 'loadBackend').mockReturnValue(native);
  return native;
}
it('reports unavailable/incompatible addons and synchronous native start failures before launch', async () => {
  const cause = new Error('native image unavailable');
  vi.spyOn(bindings, 'loadBackend').mockImplementation(() => {
    throw cause;
  });
  await expect(Subprocess.run(command)).rejects.toMatchObject({
    name: 'ProcessLaunchError',
    cause,
  });
  vi.restoreAllMocks();
  const native = backend();
  vi.mocked(native.start).mockImplementation(() => {
    throw cause;
  });
  await expect(Subprocess.run(command)).rejects.toBeInstanceOf(ProcessLaunchError);
});
it.each([
  ['launch', 'ProcessLaunchError'],
  ['io', 'ProcessIOError'],
  ['process', 'ProcessError'],
  ['shutdown', 'ProcessError'],
  ['teardown', 'ProcessTeardownError'],
])('preserves typed %s failures and native OS error metadata', async (kind, name) => {
  backend({
    failure: { kind, stream: 'stderr', message: 'native fault', code: 'EACCES', osCode: 13 },
  });
  const failure = await Subprocess.run(command, { check: false }).catch((error) => error);
  expect(failure).toBeInstanceOf(ProcessError);
  expect(failure).toMatchObject({
    name,
    cause: { message: 'native fault', code: 'EACCES', errno: 13 },
  });
  if (kind === 'io') expect(failure.stream).toBe('stderr');
});
it('maps Windows and Unix signals independently of the host platform', async () => {
  backend({ code: undefined, windowsSignal: 'SIGKILL' });
  expect((await Subprocess.run(command, { check: false })).terminationStatus).toEqual({
    kind: 'signaled',
    signal: 'SIGKILL',
  });
  vi.restoreAllMocks();
  backend({ code: undefined, signal: 15 });
  expect((await Subprocess.run(command, { check: false })).terminationStatus).toEqual({
    kind: 'signaled',
    signal: 'SIGTERM',
  });
});
it('preserves primary failure, secondary I/O/reaping errors, partial captures and the unresolved PID', async () => {
  const failure: NativeFailure = {
    kind: 'io',
    stream: 'stdin',
    message: 'write failed',
    code: 'EPIPE',
  };
  backend({
    code: undefined,
    failure,
    standardOutput: Buffer.from('partial'),
    cleanupErrors: [
      { kind: 'io', stream: 'stderr', message: 'reader failed' },
      { kind: 'teardown', message: 'reap failed' },
    ],
    unresolvedProcessIdentifier: 42,
  });
  const error = await Subprocess.run(command, {
    output: Output.text({ limit: 1024 }),
    check: false,
  }).catch((error) => error);
  expect(error).toBeInstanceOf(ProcessIOError);
  expect(error).toMatchObject({
    stream: 'stdin',
    cause: { code: 'EPIPE' },
    standardOutput: 'partial',
    unresolvedProcessIdentifier: 42,
  });
  expect(error.cleanupErrors[0]).toBeInstanceOf(ProcessIOError);
  expect(error.cleanupErrors[1]).toBeInstanceOf(ProcessTeardownError);
});
it('disposes cancellation after a rejected native deferred, preserving its original exception', async () => {
  const controller = new AbortController(),
    cause = new Error('native task panic');
  const native = backend();
  vi.mocked(native.start).mockReturnValue({ id: 7, promise: Promise.reject(cause) });
  await expect(Subprocess.run(command, { signal: controller.signal })).rejects.toMatchObject({
    name: 'ProcessError',
    cause,
  });
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});
it('handles abort during native submission and keeps the exact arbitrary abort reason', async () => {
  const controller = new AbortController(),
    reason = { reason: 'during launch' };
  const native = backend({ code: undefined, failure: { kind: 'abort', message: 'abort' } });
  const original = vi.mocked(native.start).getMockImplementation()!;
  vi.mocked(native.start).mockImplementation((options) => {
    const job = original(options);
    controller.abort(reason);
    return job;
  });
  await expect(Subprocess.run(command, { signal: controller.signal })).rejects.toMatchObject({
    name: 'ProcessAbortError',
    cause: reason,
  });
  expect(native.cancel).toHaveBeenCalledWith(7, false);
});
it.each(['setup', 'io', 'completed'])(
  'handles cancellation registration failure after native %s settlement without abandoning ownership',
  async (kind) => {
    const controller = new AbortController(),
      cause = new Error('registration failure');
    const native = backend({
      failure:
        kind === 'completed' ? undefined : { kind, stream: 'stdin', message: 'earlier failure' },
    });
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation(() => {
      throw cause;
    });
    const error = await Subprocess.run(command, { signal: controller.signal }).catch(
      (error) => error,
    );
    expect(native.cancel).toHaveBeenCalledWith(7, true);
    if (kind === 'io') {
      expect(error).toBeInstanceOf(ProcessIOError);
      expect(error.cleanupErrors[0].cause).toBe(cause);
    } else expect(error).toMatchObject({ name: 'ProcessError', cause, processIdentifier: 42 });
  },
);
it.each(['success', 'failed'])(
  'preserves final decode errors after native %s cleanup',
  async (kind) => {
    const cause = new Error('decode failure'),
      bytes = Buffer.from('partial');
    vi.spyOn(bytes, 'toString').mockImplementation(() => {
      throw cause;
    });
    backend({
      standardOutput: bytes,
      failure:
        kind === 'failed'
          ? { kind: 'io', stream: 'stdin', message: 'earlier write failure' }
          : undefined,
    });
    const error = await Subprocess.run(command, { output: Output.text({ limit: 1024 }) }).catch(
      (error) => error,
    );
    expect(error).toBeInstanceOf(ProcessIOError);
    if (kind === 'failed') {
      expect(error.stream).toBe('stdin');
      expect(error.cleanupErrors[0].cause).toBe(cause);
    } else {
      expect(error.stream).toBe('stdout');
      expect(error.cause).toBe(cause);
    }
  },
);
it('rejects a malformed native success report rather than returning invalid checked metadata', async () => {
  backend({ code: undefined });
  await expect(Subprocess.run(command)).rejects.toMatchObject({
    name: 'ProcessError',
    message: 'Native subprocess operation failed',
  });
});
it('checks the prebuild protocol, caches a valid addon, and forwards the exit barrier', async () => {
  vi.resetModules();
  const fresh = await import('../src/bindings.js');
  expect(() => fresh.shutdownBackend()).not.toThrow();
  const native = createRequire(import.meta.url)(
    `../native/${process.platform}-${process.arch}.node`,
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
