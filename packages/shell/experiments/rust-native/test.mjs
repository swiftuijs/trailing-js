import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { Command, Output, Environment, Subprocess } from '../../dist/index.js';
import { rustRun } from './adapter.mjs';

const fixture = resolve(import.meta.dirname, '../../tests/fixtures/child.mjs');
const executable = resolve(import.meta.dirname, 'target/fixture');
execFileSync('cc', [
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  resolve(import.meta.dirname, 'fixture.c'),
  '-o',
  executable,
]);
const command = (mode, ...args) => Command.path(process.execPath, [fixture, mode, ...args]);
const capture = {
  output: Output.bytes({ limit: 64 * 1024 }),
  error: Output.bytes({ limit: 64 * 1024 }),
};
const { run: direct } = createRequire(import.meta.url)('./experiment.node');
const nativeOptions = {
  executable: '/usr/bin/true',
  arguments: [],
  discardOutput: false,
  discardError: false,
  timeoutMs: 5000,
};

test('literal argv and immutable reusable command agree with SDK', async () => {
  const args = ['space here', '$(false); &&', 'quotes\'"', '\n', '🪶', '--help'];
  const cmd = command('argv', ...args);
  for (const run of [rustRun, Subprocess.run]) {
    const result = await run(cmd, { output: Output.text({ limit: 1024 }) });
    assert.deepEqual(JSON.parse(result.standardOutput), args);
    assert.deepEqual(result.terminationStatus, { kind: 'exited', code: 0 });
    assert(result.processIdentifier > 0);
    assert(Object.isFrozen(result));
    const again = await run(cmd, { output: Output.text({ limit: 1024 }) });
    assert.notEqual(again.processIdentifier, result.processIdentifier);
  }
});

test('default EOF, empty input, inherited/discarded outputs', async () => {
  for (const run of [rustRun, Subprocess.run]) {
    assert.equal(
      (await run(command('none'), { output: Output.text({ limit: 16 }) })).standardOutput,
      '0',
    );
    for (const input of ['', Buffer.alloc(0)])
      assert.equal(
        (await run(command('echo'), { input, output: Output.text({ limit: 1 }) })).standardOutput,
        '',
      );
    const result = await run(command('large', '1024'), {
      output: Output.discard(),
      error: Output.discard(),
    });
    assert.equal(result.standardOutput, undefined);
    assert.equal(result.standardError, undefined);
    assert.equal((await run(Command.path('/usr/bin/true'))).terminationStatus.code, 0);
  }
});

test('binary views, split UTF-8, replacement decoding and finite byte limits', async () => {
  for (const run of [rustRun, Subprocess.run]) {
    const buffer = Buffer.from([1, 0, 255, 97, 2]);
    const input = new Uint8Array(buffer.buffer, buffer.byteOffset + 1, 3);
    assert.deepEqual(
      (await run(command('echo'), { input, ...capture })).standardOutput,
      Buffer.from([0, 255, 97]),
    );
    assert.equal(
      (await run(command('unicode-split'), { output: Output.text({ limit: 4 }) })).standardOutput,
      '🪶',
    );
    assert.equal(
      (await run(command('binary'), { output: Output.text({ limit: 2 }) })).standardOutput,
      '\ufffda',
    );
    await assert.rejects(run(command('unicode'), { output: Output.text({ limit: 3 }) }));
  }
});

test('concurrent streams and stdin exceed pipe capacity without deadlock', async () => {
  const size = 8 * 1024 * 1024;
  const policy = Output.bytes({ limit: size });
  for (const run of [rustRun, Subprocess.run]) {
    const emitted = await run(Command.path(executable, ['emit', String(size)]), {
      output: policy,
      error: policy,
    });
    assert.deepEqual(emitted.standardOutput, Buffer.alloc(size, 97));
    assert.deepEqual(emitted.standardError, Buffer.alloc(size, 98));
    const input = Buffer.alloc(size, 255);
    const echoed = await run(Command.path(executable, ['duplex']), {
      input,
      output: policy,
      error: policy,
    });
    assert.deepEqual(echoed.standardOutput, input);
    assert.deepEqual(echoed.standardError, input);
  }
});

test('child-local cwd/environment isolation and PATH lookup', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'twill-rust-env-'));
  try {
    const environment = Environment.replace({ PROBE: 'value', PATH: '/usr/bin:/bin' });
    const result = await rustRun(command('env'), {
      cwd,
      environment,
      output: Output.text({ limit: 8192 }),
    });
    const parsed = JSON.parse(result.standardOutput);
    assert.equal(parsed.cwd, cwd);
    assert.equal(parsed.env.PROBE, 'value');
    assert.equal(parsed.env.HOME, undefined);
    assert.equal((await rustRun(Command.name('true'), { environment })).terminationStatus.code, 0);
    assert.equal(process.env.PROBE, undefined);
    assert.notEqual(process.cwd(), cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('nonzero exits and signals preserve status, check defaults to rejection', async () => {
  for (const run of [rustRun, Subprocess.run]) {
    await assert.rejects(run(command('exit', '7'), capture));
    const result = await run(command('exit', '7'), { ...capture, check: false });
    assert.deepEqual(result.terminationStatus, { kind: 'exited', code: 7 });
    assert.equal(result.standardOutput.toString(), 'out');
    assert.equal(result.standardError.toString(), 'err');
    const signaled = await run(command('signal'), { check: false });
    assert.deepEqual(signaled.terminationStatus, { kind: 'signaled', signal: 'SIGTERM' });
  }
});

test('launch and write failures reject without abandoning a child', async () => {
  await assert.rejects(rustRun(Command.path('/missing/twill-rust-executable')));
  await assert.rejects(rustRun(command('env'), { cwd: '/missing/twill-rust-cwd' }));
  await assert.rejects(rustRun(command('early-input'), { input: Buffer.alloc(8 * 1024 * 1024) }));
});

test('direct native validation rejects NUL, invalid bounds and environment before launch', () => {
  for (const options of [
    { executable: 'bad\0path' },
    { arguments: ['bad\0argument'] },
    { cwd: 'bad\0cwd' },
    { environment: { 'BAD=KEY': 'value' } },
    { environment: { key: 'bad\0value' } },
    { environment: { '': 'value' } },
    { outputLimit: 0 },
    { errorLimit: 0 },
    { outputLimit: 64 * 1024 * 1024 + 1 },
    { timeoutMs: 0 },
    { timeoutMs: 60001 },
    { outputLimit: 1, discardOutput: true },
    { outputLimit: 1.5 },
    { outputLimit: NaN },
    { outputLimit: 2 ** 32 + 1 },
    { timeoutMs: NaN },
    { timeoutMs: 1.5 },
  ])
    assert.throws(() => direct({ ...nativeOptions, ...options }));
});

test('input is snapshotted before the asynchronous worker reads it', async () => {
  const input = Buffer.alloc(1024 * 1024, 97);
  const result = rustRun(Command.path(executable, ['echo']), {
    input,
    output: Output.bytes({ limit: input.length }),
  });
  input.fill(98);
  assert.deepEqual((await result).standardOutput, Buffer.alloc(input.length, 97));
});

test('adapter rejects unsupported cancellation/unknown policies instead of pretending SDK parity', async () => {
  for (const options of [
    { signal: new AbortController().signal },
    { gracePeriodMs: 1 },
    { input: {} },
    { output: { kind: 'unknown' } },
    { output: { kind: 'bytes', limit: NaN } },
    { timeoutMs: 0.5 },
    { environment: Environment.inherit() },
  ])
    await assert.rejects(rustRun(Command.path('/usr/bin/true'), options));
});

test('overflow and hard deadline terminate and reap the directly owned child', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'twill-rust-reap-'));
  try {
    for (const kind of ['overflow', 'timeout']) {
      const marker = join(directory, kind);
      const code = `require('node:fs').writeFileSync(process.argv[1],String(process.pid));${kind === 'overflow' ? 'process.stdout.write(Buffer.alloc(100000));' : ''}setInterval(()=>{},1000);`;
      await assert.rejects(
        rustRun(Command.path(process.execPath, ['-e', code, marker]), {
          output: Output.bytes({ limit: 16 }),
          timeoutMs: 1000,
        }),
        kind === 'overflow' ? /limit/ : /deadline/,
      );
      const pid = Number(readFileSync(marker, 'utf8'));
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('descriptor-retaining descendant cannot indefinitely retain captured pipes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'twill-rust-descendant-'));
  const marker = join(directory, 'pid');
  try {
    await assert.rejects(
      rustRun(command('descendant', marker), { ...capture, timeoutMs: 1000 }),
      /deadline/,
    );
    assert(existsSync(marker));
    const pid = Number(readFileSync(marker, 'utf8'));
    // Ownership is explicitly direct-child-only. Clean up the escaped fixture ourselves.
    process.kill(pid, 'SIGKILL');
  } finally {
    if (existsSync(marker)) {
      try {
        process.kill(Number(readFileSync(marker, 'utf8')), 'SIGKILL');
      } catch {}
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('worker-pool queues settle exactly once and release native buffers/descriptors', async () => {
  const before = readdirSync('/proc/self/fd').length;
  const results = await Promise.all(
    Array.from({ length: 32 }, () => rustRun(command('binary'), capture)),
  );
  assert.equal(new Set(results.map((result) => result.processIdentifier)).size, 32);
  for (const result of results) assert.deepEqual(result.standardOutput, Buffer.from([255, 97]));
  for (let i = 0; i < 4; i++) globalThis.gc?.();
  // libuv initializes a small pool/eventfd set lazily; repeated runs must be stable.
  const warmed = readdirSync('/proc/self/fd').length;
  assert(warmed < before + 8);
  await Promise.all(Array.from({ length: 32 }, () => rustRun(Command.path('/usr/bin/true'))));
  assert.equal(readdirSync('/proc/self/fd').length, warmed);
});
