import { afterEach, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import childProcess, { ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Command,
  Environment,
  Output,
  Input,
  Subprocess,
  ProcessError,
  ProcessAbortError,
  ProcessTimeoutError,
  ProcessLaunchError,
  ProcessExitError,
  ProcessIOError,
  OutputLimitError,
  ProcessTeardownError,
} from '../src/index.twill';

const fixture = fileURLToPath(new URL('./fixtures/child.mjs', import.meta.url));
const roots: string[] = [];
const children: number[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const pid of children.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const command = (mode: string, ...args: string[]) =>
  Command.path(process.execPath, [fixture, mode, ...args]);
const text = () => Output.text({ limit: 4 * 1024 * 1024 });
const bytes = () => Output.bytes({ limit: 4 * 1024 * 1024 });
function root() {
  const path = mkdtempSync(join(tmpdir(), 'twill-shell-'));
  roots.push(path);
  return path;
}
function gone(pid: number) {
  expect(() => process.kill(pid, 0)).toThrow();
}
async function ready(file: string) {
  await vi.waitFor(() => expect(existsSync(file)).toBe(true), { timeout: 5000, interval: 10 });
  const pid = Number(readFileSync(file, 'utf8'));
  children.push(pid);
  return pid;
}

it('handles native synchronous spawn failure without constructing a child', async () => {
  const cause = Error('native failure');
  vi.spyOn(childProcess, 'spawn').mockImplementation(() => {
    throw cause;
  });
  await expect(Subprocess.run(command('argv'))).rejects.toMatchObject({
    name: 'ProcessLaunchError',
    cause,
  });
});
it.each(['stdout', 'stderr'] as const)(
  'joins a real child after a native %s stream error',
  async (stream) => {
    const original = childProcess.spawn;
    const cause = Error('read failure');
    vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
      const child = Reflect.apply(original, childProcess, args);
      children.push(child.pid!);
      queueMicrotask(() => child[stream]!.destroy(cause));
      return child;
    });
    await expect(
      Subprocess.run(command('wait', join(root(), 'pid')), { output: text(), error: text() }),
    ).rejects.toMatchObject({ name: 'ProcessIOError', stream, cause });
    for (const pid of children) gone(pid);
  },
);
it('handles native synchronous stdin failure through owned teardown', async () => {
  const original = childProcess.spawn,
    cause = Error('write failure');
  vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
    const child = Reflect.apply(original, childProcess, args);
    children.push(child.pid!);
    vi.spyOn(child.stdin!, 'end').mockImplementation(() => {
      throw cause;
    });
    return child;
  });
  await expect(
    Subprocess.run(command('wait', join(root(), 'pid')), { input: 'payload' }),
  ).rejects.toMatchObject({ name: 'ProcessIOError', stream: 'stdin', cause });
  for (const pid of children) gone(pid);
});
it('reports a failed termination attempt as secondary and preserves the abort cause', async () => {
  const marker = join(root(), 'pid'),
    controller = new AbortController();
  const pending = Subprocess.run(command('wait', marker), {
    signal: controller.signal,
    gracePeriodMs: 5,
    killTimeoutMs: 20,
  });
  const pid = await ready(marker);
  const original = ChildProcess.prototype.kill;
  const kill = vi.spyOn(ChildProcess.prototype, 'kill').mockImplementation(function (
    this: ChildProcess,
    signal,
  ) {
    if (signal === 'SIGTERM') throw Error('signal unavailable');
    return original.call(this, signal);
  });
  controller.abort('primary');
  await expect(pending).rejects.toMatchObject({
    name: 'ProcessAbortError',
    cause: 'primary',
    cleanupErrors: [expect.objectContaining({ message: 'Subprocess termination signal failed' })],
  });
  kill.mockRestore();
  gone(pid);
});
it('reports an unresolved pid when the native backend cannot terminate the owned child', async () => {
  const marker = join(root(), 'pid'),
    controller = new AbortController();
  const pending = Subprocess.run(command('ignore-term', marker), {
    signal: controller.signal,
    gracePeriodMs: 5,
    killTimeoutMs: 20,
    output: text(),
  });
  const pid = await ready(marker);
  const kill = vi.spyOn(ChildProcess.prototype, 'kill').mockReturnValue(false);
  controller.abort('primary');
  await expect(pending).rejects.toMatchObject({
    name: 'ProcessAbortError',
    cause: 'primary',
    unresolvedProcessIdentifier: pid,
    cleanupErrors: expect.arrayContaining([expect.any(ProcessTeardownError)]),
  });
  kill.mockRestore();
  process.kill(pid, 'SIGKILL');
  await vi.waitFor(() => gone(pid));
});

it('joins the child when cancellation happens during native launch', async () => {
  const original = childProcess.spawn,
    controller = new AbortController();
  vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
    const child = Reflect.apply(original, childProcess, args);
    children.push(child.pid!);
    controller.abort('launch race');
    return child;
  });
  await expect(
    Subprocess.run(command('wait', join(root(), 'pid')), {
      signal: controller.signal,
      output: text(),
    }),
  ).rejects.toMatchObject({ name: 'ProcessAbortError', cause: 'launch race' });
  for (const pid of children) gone(pid);
});
it('joins after cancellation registration fails on a modified native signal', async () => {
  const original = childProcess.spawn,
    controller = new AbortController(),
    cause = Error('listener unavailable');
  vi.spyOn(controller.signal, 'addEventListener').mockImplementation(() => {
    throw cause;
  });
  vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
    const child = Reflect.apply(original, childProcess, args);
    children.push(child.pid!);
    return child;
  });
  await expect(
    Subprocess.run(command('wait', join(root(), 'pid')), {
      signal: controller.signal,
      output: text(),
    }),
  ).rejects.toMatchObject({ message: 'Subprocess cancellation setup failed', cause });
  for (const pid of children) gone(pid);
});
it('retains the first failure when both native output streams fail', async () => {
  const original = childProcess.spawn,
    first = Error('first'),
    second = Error('second');
  vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
    const child = Reflect.apply(original, childProcess, args);
    children.push(child.pid!);
    queueMicrotask(() => {
      child.stdout!.emit('error', first);
      child.stderr!.emit('error', second);
    });
    return child;
  });
  await expect(
    Subprocess.run(command('wait', join(root(), 'pid')), { output: text(), error: text() }),
  ).rejects.toMatchObject({
    name: 'ProcessIOError',
    cause: first,
    cleanupErrors: [expect.objectContaining({ cause: second })],
  });
  for (const pid of children) gone(pid);
});
it('joins a write-enabled launch failure with all three owned pipes', async () => {
  await expect(
    Subprocess.run(Command.path(join(root(), 'missing')), {
      input: 'payload',
      output: text(),
      error: text(),
    }),
  ).rejects.toBeInstanceOf(ProcessLaunchError);
});
it('handles an I/O error observed after the native exit event', async () => {
  const original = childProcess.spawn,
    cause = Error('late read');
  vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
    const child = Reflect.apply(original, childProcess, args);
    children.push(child.pid!);
    child.once('exit', () => child.stdout!.emit('error', cause));
    return child;
  });
  await expect(Subprocess.run(command('argv'), { output: text() })).rejects.toMatchObject({
    name: 'ProcessIOError',
    cause,
  });
  for (const pid of children) gone(pid);
});
it('bounds a lost backend close notification separately from an unresolved live pid', async () => {
  const original = childProcess.spawn,
    marker = join(root(), 'pid'),
    controller = new AbortController();
  vi.spyOn(childProcess, 'spawn').mockImplementation((...args: any[]) => {
    const child = Reflect.apply(original, childProcess, args);
    child.once('exit', () => child.removeAllListeners('close'));
    return child;
  });
  const pending = Subprocess.run(command('wait', marker), {
    signal: controller.signal,
    gracePeriodMs: 5,
    killTimeoutMs: 20,
    output: text(),
  });
  const pid = await ready(marker);
  controller.abort('primary');
  await expect(pending).rejects.toMatchObject({
    name: 'ProcessAbortError',
    cause: 'primary',
    unresolvedProcessIdentifier: undefined,
    cleanupErrors: [expect.objectContaining({ message: 'Subprocess I/O did not close' })],
  });
  gone(pid);
});

it('closes owned pipes held by an unowned descendant after the direct child exits', async () => {
  const marker = join(root(), 'descendant');
  const pending = Subprocess.run(command('descendant', marker), {
    output: text(),
    error: text(),
    timeoutMs: 1000,
  });
  pending.catch(() => {});
  const descendant = await ready(marker);
  const error = await pending.catch((error) => error);
  expect(error).toBeInstanceOf(ProcessTimeoutError);
  expect(error.terminationStatus).toEqual({ kind: 'exited', code: 0 });
  gone(error.processIdentifier);
  // Direct-child ownership never implies process-tree termination.
  expect(() => process.kill(descendant, 0)).not.toThrow();
  process.kill(descendant, 'SIGKILL');
});

it('rejects a final UTF-8 decoding failure after joining the child', async () => {
  const original = Buffer.prototype.toString,
    cause = Error('decode allocation failed');
  vi.spyOn(Buffer.prototype, 'toString').mockImplementation(function (
    this: Buffer,
    ...args: any[]
  ) {
    if (this.length === 4 && this[0] === 240 && this[1] === 159) throw cause;
    return Reflect.apply(original, this, args);
  });
  const error = await Subprocess.run(command('unicode'), { output: text() }).catch(
    (error) => error,
  );
  expect(error).toMatchObject({ name: 'ProcessIOError', stream: 'stdout', cause });
  gone(error.processIdentifier);
});
it('preserves an abort when captured output cannot be decoded during cleanup', async () => {
  const controller = new AbortController(),
    marker = join(root(), 'pid');
  const pending = Subprocess.run(command('wait', marker), {
    signal: controller.signal,
    output: text(),
  });
  const pid = await ready(marker),
    original = Buffer.prototype.toString,
    cause = Error('decode allocation failed');
  vi.spyOn(Buffer.prototype, 'toString').mockImplementation(function (
    this: Buffer,
    ...args: any[]
  ) {
    if (this.length === 5 && this[0] === 114 && this[1] === 101) throw cause;
    return Reflect.apply(original, this, args);
  });
  controller.abort('primary');
  await expect(pending).rejects.toMatchObject({
    name: 'ProcessAbortError',
    cause: 'primary',
    cleanupErrors: [expect.objectContaining({ name: 'ProcessIOError', cause })],
  });
  gone(pid);
});
it('rejects a final byte concatenation failure without leaking the child', async () => {
  const original = Buffer.concat,
    cause = Error('buffer allocation failed');
  vi.spyOn(Buffer, 'concat').mockImplementation((chunks, length) => {
    if (length === 1048576 && chunks[0]?.[0] === 97) throw cause;
    return original(chunks, length);
  });
  const error = await Subprocess.run(command('large', '1048576'), {
    output: bytes(),
    error: Output.discard(),
  }).catch((error) => error);
  expect(error).toMatchObject({ name: 'ProcessIOError', stream: 'stdout', cause });
  gone(error.processIdentifier);
});
