import { afterEach, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import childProcess, { ChildProcess } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  chmodSync,
  realpathSync,
} from 'node:fs';
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
} from '../src/index.js';

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

it('preserves literal argv and snapshots reusable commands without starting at construction', async () => {
  const args = ['', 'space and "quotes"', '$(echo injected); | & * ?', 'line\nbreak', '中文🪶'];
  const argv = [fixture, 'argv', ...args];
  const cmd = Command.path(process.execPath, argv);
  argv.splice(0, argv.length, 'invalid');
  expect(Object.isFrozen(cmd)).toBe(true);
  expect(Object.isFrozen(cmd.arguments)).toBe(true);
  const [a, b] = await Promise.all([
    Subprocess.run(cmd, { output: text() }),
    Subprocess.run(cmd, { output: text() }),
  ]);
  expect(JSON.parse(a.standardOutput)).toEqual(args);
  expect(b.standardOutput).toBe(a.standardOutput);
  expect(a.processIdentifier).not.toBe(b.processIdentifier);
  gone(a.processIdentifier);
  gone(b.processIdentifier);
});
it('searches a named executable using the selected PATH', async () => {
  const result = await Subprocess.run(
    Command.name(basename(process.execPath), [fixture, 'argv', 'found']),
    { environment: Environment.inherit({ PATH: dirname(process.execPath) }), output: text() },
  );
  expect(result.standardOutput).toBe('["found"]');
});
it('isolates cwd and snapshots environment updates while inheriting at launch', async () => {
  const key = 'TWILL_SHELL_TEST_PARENT',
    prior = process.env[key];
  try {
    process.env[key] = 'before';
    const updates = { TWILL_SHELL_TEST_UPDATE: 'snapshot', [key]: undefined };
    const env = Environment.inherit(updates);
    updates.TWILL_SHELL_TEST_UPDATE = 'mutated';
    process.env[key] = 'after';
    const cwd = root(),
      original = process.cwd(),
      parent = { ...process.env };
    const [a, b] = await Promise.all([
      Subprocess.run(command('env'), { cwd, environment: env, output: text() }),
      Subprocess.run(command('env'), {
        environment: Environment.replace({ TWILL_SHELL_TEST_UPDATE: 'replacement' }),
        output: text(),
      }),
    ]);
    expect(JSON.parse(a.standardOutput)).toMatchObject({
      cwd: realpathSync(cwd),
      env: { TWILL_SHELL_TEST_UPDATE: 'snapshot' },
    });
    expect(JSON.parse(a.standardOutput).env[key]).toBeUndefined();
    expect(JSON.parse(b.standardOutput).env.TWILL_SHELL_TEST_UPDATE).toBe('replacement');
    expect(JSON.parse(b.standardOutput).env[key]).toBeUndefined();
    expect(process.cwd()).toBe(original);
    expect(process.env).toEqual(parent);
    const inherited = await Subprocess.run(command('env'), { output: text() });
    expect(JSON.parse(inherited.standardOutput).env[key]).toBe('after');
  } finally {
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
});
it('captures status and bounded output on unsuccessful exits, or returns status when unchecked', async () => {
  const options = { output: text(), error: bytes() };
  await expect(Subprocess.run(command('exit', '7'), options)).rejects.toMatchObject({
    name: 'ProcessExitError',
    result: {
      terminationStatus: { kind: 'exited', code: 7 },
      standardOutput: 'out',
      standardError: Buffer.from('err'),
    },
    cleanupErrors: [],
  });
  const result = await Subprocess.run(command('exit', '7'), { ...options, check: false });
  expect(result.terminationStatus).toEqual({ kind: 'exited', code: 7 });
  gone(result.processIdentifier);
  expect(new ProcessExitError(result)).toBeInstanceOf(ProcessError);
});
it.skipIf(process.platform === 'win32')(
  'preserves signal termination as a distinct status',
  async () => {
    const result = await Subprocess.run(command('signal'), { check: false });
    expect(result.terminationStatus).toEqual({ kind: 'signaled', signal: 'SIGTERM' });
    await expect(Subprocess.run(command('signal'))).rejects.toBeInstanceOf(ProcessExitError);
  },
);
it('reports native launch failures independently of exit checking', async () => {
  await expect(
    Subprocess.run(Command.path(join(root(), 'missing')), { check: false }),
  ).rejects.toMatchObject({
    name: 'ProcessLaunchError',
    cause: { code: 'ENOENT' },
    processIdentifier: undefined,
  });
  await expect(
    Subprocess.run(command('argv'), { cwd: join(root(), 'missing') }),
  ).rejects.toBeInstanceOf(ProcessLaunchError);
});
it.skipIf(process.platform === 'win32')('reports non-executable paths', async () => {
  const path = join(root(), 'non-executable');
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o600);
  await expect(Subprocess.run(Command.path(path))).rejects.toMatchObject({
    name: 'ProcessLaunchError',
    cause: { code: 'EACCES' },
  });
});
it('handles no input, string input and byte views with native backpressure', async () => {
  expect(
    (await Subprocess.run(command('none'), { input: Input.none(), output: text() })).standardOutput,
  ).toBe('0');
  expect((await Subprocess.run(command('none'), { output: text() })).standardOutput).toBe('0');
  expect(
    (await Subprocess.run(command('echo'), { input: '', output: text() })).standardOutput,
  ).toBe('');
  const source = Buffer.from('prefix🪶suffix');
  const view = source.subarray(6, 10);
  expect(
    (await Subprocess.run(command('echo'), { input: view, output: bytes() })).standardOutput,
  ).toEqual(view);
  const large = 'x'.repeat(2 * 1024 * 1024);
  expect(
    (await Subprocess.run(command('echo'), { input: large, output: text() })).standardOutput,
  ).toBe(large);
});
it('captures binary and UTF-8 with byte limits rather than character counts', async () => {
  expect((await Subprocess.run(command('binary'), { output: bytes() })).standardOutput).toEqual(
    Buffer.from([255, 97]),
  );
  expect((await Subprocess.run(command('binary'), { output: text() })).standardOutput).toBe('�a');
  expect(
    (await Subprocess.run(command('unicode-split'), { output: Output.text({ limit: 4 }) }))
      .standardOutput,
  ).toBe('🪶');
  expect(
    (await Subprocess.run(command('unicode'), { output: Output.text({ limit: 4 }) }))
      .standardOutput,
  ).toBe('🪶');
  await expect(
    Subprocess.run(command('unicode'), { output: Output.text({ limit: 3 }) }),
  ).rejects.toMatchObject({
    name: 'OutputLimitError',
    stream: 'stdout',
    limit: 3,
    standardOutput: '',
  });
});
it('drains both large output streams concurrently and rejects either overflow', async () => {
  const size = 1024 * 1024;
  const result = await Subprocess.run(command('large', String(size)), {
    output: Output.bytes({ limit: size }),
    error: Output.bytes({ limit: size }),
  });
  expect(result.standardOutput.equals(Buffer.alloc(size, 97))).toBe(true);
  expect(result.standardError.equals(Buffer.alloc(size, 98))).toBe(true);
  for (const stream of ['output', 'error'] as const) {
    const capture = Output.bytes({ limit: 1 });
    const options = {
      output: stream === 'output' ? capture : Output.discard(),
      error: stream === 'error' ? capture : Output.discard(),
      check: false,
    };
    await expect(Subprocess.run(command('large', String(size)), options)).rejects.toBeInstanceOf(
      OutputLimitError,
    );
  }
});
it('uses inherited and discarded stdio without retaining output or input', async () => {
  const quiet = Command.path(process.execPath, ['-e', '']);
  const a = await Subprocess.run(quiet),
    b = await Subprocess.run(command('large', '65536'), {
      output: Output.discard(),
      error: Output.discard(),
      input: Input.inherit(),
    });
  expect(a.standardOutput).toBeUndefined();
  expect(a.standardError).toBeUndefined();
  expect(b.standardOutput).toBeUndefined();
  expect(b.standardError).toBeUndefined();
});
it('rejects stdin write errors and joins the child even when checking is disabled', async () => {
  await expect(
    Subprocess.run(command('early-input'), { input: Buffer.alloc(8 * 1024 * 1024), check: false }),
  ).rejects.toMatchObject({ name: 'ProcessIOError', stream: 'stdin' });
});
it('launches nothing for an already-aborted signal', async () => {
  const controller = new AbortController(),
    marker = join(root(), 'pid');
  const reason = { message: 'cancel' };
  controller.abort(reason);
  await expect(
    Subprocess.run(command('wait', marker), { signal: controller.signal }),
  ).rejects.toMatchObject({
    name: 'ProcessAbortError',
    cause: reason,
    processIdentifier: undefined,
  });
  expect(existsSync(marker)).toBe(false);
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});
it.each(['wait', 'graceful', 'ignore-term'])(
  'cancels %s and waits for the owned child to close',
  async (mode) => {
    const controller = new AbortController(),
      marker = join(root(), 'pid'),
      reason = Error('cancel');
    // Another listener cannot suppress SDK cancellation.
    controller.signal.addEventListener('abort', (event) => event.stopImmediatePropagation(), {
      once: true,
    });
    const pending = Subprocess.run(command(mode, marker), {
      signal: controller.signal,
      gracePeriodMs: 20,
      output: text(),
      check: false,
    });
    const pid = await ready(marker);
    controller.abort(reason);
    await expect(pending).rejects.toMatchObject({
      name: 'ProcessAbortError',
      cause: reason,
      processIdentifier: pid,
      unresolvedProcessIdentifier: undefined,
    });
    gone(pid);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  },
);
it('times out and clears every abort listener after joined teardown', async () => {
  const marker = join(root(), 'pid'),
    controller = new AbortController();
  const pending = Subprocess.run(command('ignore-term', marker), {
    timeoutMs: 1000,
    gracePeriodMs: 20,
    signal: controller.signal,
    output: text(),
  });
  pending.catch(() => {});
  const pid = await ready(marker);
  await expect(pending).rejects.toMatchObject({
    name: 'ProcessTimeoutError',
    timeoutMs: 1000,
    processIdentifier: pid,
  });
  gone(pid);
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});
it('clears signal listeners/timers after successful close and ignores later abort', async () => {
  const controller = new AbortController();
  const result = await Subprocess.run(command('argv'), {
    signal: controller.signal,
    timeoutMs: 5000,
    output: text(),
  });
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  controller.abort();
  expect(result.standardOutput).toBe('[]');
  gone(result.processIdentifier);
});
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
    cleanupErrors: expect.arrayContaining([
      expect.objectContaining({ message: 'Subprocess I/O did not close' }),
    ]),
  });
  gone(pid);
});

it('matches native descriptor ownership when an unowned descendant outlives the parent', async () => {
  const nativeMarker = join(root(), 'native-descendant');
  const native = childProcess.spawn(process.execPath, [fixture, 'descendant', nativeMarker], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(native.pid!);
  native.stdout!.resume();
  native.stderr!.resume();
  let nativeClosed = false;
  const closed = new Promise<void>((resolve, reject) => {
    native
      .once('close', () => {
        nativeClosed = true;
        resolve();
      })
      .once('error', reject);
  });
  const exited = new Promise<number | null>((resolve) =>
    native.once('exit', (code) => resolve(code)),
  );
  const nativeDescendant = await ready(nativeMarker);
  expect(await exited).toBe(0);
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  // Observe same-platform native pipe ownership rather than assuming POSIX descriptor behavior.
  const retainedNativePipe = !nativeClosed;
  process.kill(nativeDescendant, 'SIGKILL');
  await closed;
  gone(native.pid!);

  const marker = join(root(), 'sdk-descendant');
  const pending = Subprocess.run(command('descendant', marker), {
    output: text(),
    error: text(),
    timeoutMs: 1000,
  });
  pending.catch(() => {});
  const descendant = await ready(marker),
    outcome = await pending.catch((error) => error);
  expect(outcome.terminationStatus).toEqual({ kind: 'exited', code: 0 });
  if (retainedNativePipe) expect(outcome).toBeInstanceOf(ProcessTimeoutError);
  else {
    expect(outcome).not.toBeInstanceOf(ProcessError);
    expect(outcome.standardOutput).toBe('');
    expect(outcome.standardError).toBe('');
  }
  gone(outcome.processIdentifier);
  // Direct-child ownership never implies process-tree termination on either platform.
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
