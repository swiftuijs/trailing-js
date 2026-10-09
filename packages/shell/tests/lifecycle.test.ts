import { afterEach, expect, it, vi } from 'vitest';
import { Worker } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { setMaxListeners } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Command, Output, Subprocess, ProcessAbortError } from '../src/index.twill';
const apiURL = new URL('../dist/index.js', import.meta.url).href;
const fixture = fileURLToPath(new URL('./fixtures/child.mjs', import.meta.url));
const roots: string[] = [],
  workers: Worker[] = [],
  pids: number[] = [];
afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.terminate();
  for (const pid of pids.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const root = () => {
  const path = mkdtempSync(join(tmpdir(), 'twill-shell-lifecycle-'));
  roots.push(path);
  return path;
};
const gone = (pid: number) => expect(() => process.kill(pid, 0)).toThrow();

it('snapshots default and relative cwd before asynchronous launch without normalizing Unix symlink traversal', () => {
  const folder = root();
  mkdirSync(join(folder, 'child'));
  mkdirSync(join(folder, 'real'));
  mkdirSync(join(folder, 'real', 'inner'));
  if (process.platform !== 'win32')
    symlinkSync(join(folder, 'real', 'inner'), join(folder, 'link'));
  const code = `
    import {Command,Output,Subprocess} from ${JSON.stringify(apiURL)};
    process.chdir(${JSON.stringify(folder)});
    const run=(cwd)=>Subprocess.run(Command.path(process.execPath,['-e','process.stdout.write(process.cwd())']),{cwd,output:Output.text({limit:4096})});
    const tasks=[run(),run('child')${process.platform !== 'win32' ? ",run('link/..')" : ''}];
    process.chdir(${JSON.stringify(tmpdir())});
    process.stdout.write(JSON.stringify((await Promise.all(tasks)).map(r=>r.standardOutput)));
  `;
  const values = JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      timeout: 10000,
    }).toString(),
  );
  const canonical = (path: string) =>
    process.platform === 'darwin' ? path.replace(/^\/private\/var\//, '/var/') : path;
  expect(values.map(canonical)).toEqual(
    [
      folder,
      join(folder, 'child'),
      ...(process.platform === 'win32' ? [] : [join(folder, 'real')]),
    ].map(canonical),
  );
});

it('coexists with handwritten Node spawn completion across concurrent commands', async () => {
  const native = (i: number) =>
    new Promise<{ processIdentifier: number; standardOutput: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [fixture, 'argv', String(i)], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const chunks: Buffer[] = [];
      child.stdout.on('data', (chunk) => chunks.push(chunk));
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0
          ? resolve({
              processIdentifier: child.pid!,
              standardOutput: Buffer.concat(chunks).toString(),
            })
          : reject(Error('Node child failed')),
      );
    });
  const results = await Promise.all(
    Array.from({ length: 48 }, (_, i) =>
      i % 2
        ? native(i)
        : Subprocess.run(Command.path(process.execPath, [fixture, 'argv', String(i)]), {
            output: Output.text({ limit: 1024 }),
          }),
    ),
  );
  results.forEach((result, i) => {
    expect(result.standardOutput).toBe(JSON.stringify([String(i)]));
    gone(result.processIdentifier);
  });
});

it.skipIf(process.platform !== 'darwin')(
  'reaps immediate native exits across concurrent batches',
  async () => {
    for (let batch = 0; batch < 8; batch++) {
      const results = await Promise.all(
        Array.from({ length: 32 }, () =>
          Subprocess.run(Command.path('/usr/bin/true'), {
            output: Output.discard(),
            error: Output.discard(),
          }),
        ).concat([
          Subprocess.run(Command.path(process.execPath, ['-e', '']), {
            output: Output.discard(),
            error: Output.discard(),
          }),
        ]),
      );
      for (const result of results) {
        expect(result.terminationStatus).toEqual({ kind: 'exited', code: 0 });
        gone(result.processIdentifier);
      }
    }
  },
);

it.skipIf(process.platform !== 'linux')(
  'matches Node status for unnamed realtime signals',
  async () => {
    const arguments_ = ['-e', 'process.kill(process.pid,34)'];
    const expected = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, arguments_, { stdio: 'ignore' });
      child.once('error', reject);
      child.once('close', (code, signal) =>
        resolve(signal === null ? { kind: 'exited', code } : { kind: 'signaled', signal }),
      );
    });
    const result = await Subprocess.run(Command.path(process.execPath, arguments_), {
      check: false,
    });
    expect(result.terminationStatus).toEqual(expected);
    gone(result.processIdentifier);
  },
);

it('copies byte input before returning to JS and snapshots the inherited environment at submission', async () => {
  const bytes = Uint8Array.from([1, 255, 128]);
  const before = process.env.TWILL_NATIVE_SNAPSHOT;
  process.env.TWILL_NATIVE_SNAPSHOT = 'before';
  try {
    const input = Subprocess.run(Command.path(process.execPath, [fixture, 'echo']), {
      input: bytes,
      output: Output.bytes({ limit: 1024 }),
    });
    const env = Subprocess.run(Command.path(process.execPath, [fixture, 'env']), {
      output: Output.text({ limit: 64 * 1024 }),
    });
    bytes.fill(0);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    process.env.TWILL_NATIVE_SNAPSHOT = 'after';
    expect((await input).standardOutput).toEqual(Buffer.from([1, 255, 128]));
    expect(JSON.parse((await env).standardOutput).env.TWILL_NATIVE_SNAPSHOT).toBe('before');
  } finally {
    if (before === undefined) delete process.env.TWILL_NATIVE_SNAPSHOT;
    else process.env.TWILL_NATIVE_SNAPSHOT = before;
  }
});

function startWorker(folder: string, count = 4) {
  const worker = new Worker(
    `
    const {parentPort,workerData}=require('node:worker_threads');
    const fs=require('node:fs');
    (async()=>{
      const {Command,Output,Subprocess}=await import(workerData.apiURL);
      const controller=new AbortController();
      const markers=Array.from({length:workerData.count},(_,i)=>workerData.folder+'/'+i);
      const tasks=markers.map(marker=>Subprocess.run(Command.path(process.execPath,[workerData.fixture,'ignore-term',marker]),{signal:controller.signal,output:Output.discard(),gracePeriodMs:10,killTimeoutMs:1000}));
      tasks.forEach(task=>task.catch(()=>{}));
      while(!markers.every(marker=>fs.existsSync(marker))) await new Promise(r=>setTimeout(r,5));
      parentPort.postMessage(markers.map(marker=>Number(fs.readFileSync(marker,'utf8'))));
      parentPort.once('message',async()=>{controller.abort();await Promise.allSettled(tasks);parentPort.postMessage('joined')});
    })().catch(error=>{throw error});
  `,
    { eval: true, workerData: { apiURL, fixture, folder, count } },
  );
  workers.push(worker);
  return worker;
}
const message = (worker: Worker) =>
  new Promise<unknown>((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });

it('cooperatively cancels and joins worker children before termination without affecting another worker', async () => {
  const first = startWorker(root(), 8),
    second = startWorker(root());
  const [owned, other] = (await Promise.all([message(first), message(second)])) as [
    number[],
    number[],
  ];
  pids.push(...owned, ...other);
  const joined = message(first);
  first.postMessage('cancel');
  expect(await joined).toBe('joined');
  owned.forEach(gone);
  await first.terminate();
  for (const pid of other) expect(() => process.kill(pid, 0)).not.toThrow();
  const otherJoined = message(second);
  second.postMessage('cancel');
  expect(await otherJoined).toBe('joined');
  other.forEach(gone);
  await second.terminate();
});

it('cancels and awaits outstanding work before setting process.exitCode', () => {
  const marker = join(root(), 'pid');
  const code = `
    import fs from 'node:fs';
    import {Command,Output,Subprocess} from ${JSON.stringify(apiURL)};
    const controller = new AbortController();
    const task = Subprocess.run(Command.path(process.execPath,[${JSON.stringify(fixture)},'ignore-term',${JSON.stringify(marker)}]),{signal:controller.signal,output:Output.discard(),gracePeriodMs:10});
    task.catch(()=>{});
    while(!fs.existsSync(${JSON.stringify(marker)})) await new Promise(r=>setTimeout(r,5));
    controller.abort();
    await task.catch(error=>{if(error.name!=='ProcessAbortError')throw error});
    process.exitCode=23;
  `;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 10000 });
  } catch (error) {
    expect((error as { status: number }).status).toBe(23);
  }
  const pid = Number(readFileSync(marker, 'utf8'));
  pids.push(pid);
  gone(pid);
});

it('keeps unrelated filesystem work available with one libuv worker and many live commands', () => {
  const folder = root();
  const code = `
    import fs from 'node:fs';
    import {readFile} from 'node:fs/promises';
    import {Command,Output,Subprocess} from ${JSON.stringify(apiURL)};
    const controller=new AbortController();
    const markers=Array.from({length:32},(_,i)=>${JSON.stringify(folder)}+'/'+i);
    const tasks=markers.map(marker=>Subprocess.run(Command.path(process.execPath,[${JSON.stringify(fixture)},'wait',marker]),{signal:controller.signal,output:Output.discard(),gracePeriodMs:0}));
    tasks.forEach(task=>task.catch(()=>{}));
    while(!markers.every(marker=>fs.existsSync(marker))) await new Promise(r=>setTimeout(r,5));
    await readFile(${JSON.stringify(fixture)});
    controller.abort();
    const results=await Promise.allSettled(tasks);
    if(results.some(r=>r.status!=='rejected'||r.reason.name!=='ProcessAbortError')) throw Error('Incorrect settlement');
    for(const marker of markers){const pid=Number(fs.readFileSync(marker,'utf8'));try{process.kill(pid,0);throw Error('Unreaped child')}catch(e){if(e.code!=='ESRCH')throw e}}
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], {
    timeout: 12000,
    env: { ...process.env, UV_THREADPOOL_SIZE: '1' },
  });
});

it.runIf(process.platform === 'linux')(
  'does not retain inherited-descriptor snapshots for a burst of already-started commands',
  async () => {
    await Subprocess.run(Command.path(process.execPath, ['-e', '']));
    const baseline = readdirSync('/proc/self/fd').length;
    const controller = new AbortController();
    setMaxListeners(0, controller.signal);
    const tasks = Array.from({ length: 64 }, () =>
      Subprocess.run(Command.path(process.execPath, ['-e', 'setInterval(()=>{},10000)']), {
        signal: controller.signal,
        gracePeriodMs: 0,
      }),
    );
    tasks.forEach((task) => task.catch(() => {}));
    try {
      // Node may retain one process handle/descriptor per live child; no
      // accumulated copies of inherited output descriptors are needed.
      expect(readdirSync('/proc/self/fd').length).toBeLessThanOrEqual(baseline + 64 + 3);
    } finally {
      controller.abort();
    }
    for (const task of tasks) {
      const failure = await task.catch((error) => error);
      expect(failure).toBeInstanceOf(ProcessAbortError);
      gone(failure.processIdentifier);
    }
  },
);

it.runIf(process.platform === 'linux')(
  'releases capture buffers and process/pipe descriptors after repeated concurrent completion/cancellation',
  async () => {
    const baseline = readdirSync('/proc/self/fd').length;
    const controller = new AbortController();
    const runs = Array.from({ length: 32 }, (_, i) =>
      Subprocess.run(Command.path(process.execPath, [fixture, 'argv', String(i)]), {
        output: Output.text({ limit: 1024 }),
      }),
    );
    const results = await Promise.all(runs);
    results.forEach((result, i) => {
      expect(result.standardOutput).toBe(JSON.stringify([String(i)]));
      gone(result.processIdentifier);
    });
    const cancelled = Array.from({ length: 32 }, () =>
      Subprocess.run(Command.path(process.execPath, [fixture, 'wait', join(root(), 'pid')]), {
        signal: controller.signal,
        output: Output.discard(),
        gracePeriodMs: 0,
      }),
    );
    cancelled.forEach((task) => task.catch(() => {}));
    controller.abort();
    for (const task of cancelled)
      expect(await task.catch((error) => error)).toBeInstanceOf(ProcessAbortError);
    await vi.waitFor(
      () => expect(readdirSync('/proc/self/fd').length).toBeLessThanOrEqual(baseline + 3),
      { timeout: 5000 },
    );
    // Reading through the host pool still works after all operations finish.
    expect((await readFile(fixture)).byteLength).toBeGreaterThan(0);
  },
);
