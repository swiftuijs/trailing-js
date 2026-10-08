import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
function cpuState() {
  try {
    return readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8').trim();
  } catch {
    return undefined;
  }
}

const [mode, measurement, count] = process.argv.slice(2);
const sdk = mode === 'native' ? undefined : await import('../../shell/dist/index.js');
let run = sdk ? sdk.Subprocess.run : (await import('../../shell/benchmarks/native.mjs')).nativeRun;
// The success baseline deliberately has no cancellation implementation.
// Measure this workload with ordinary Node spawn, SIGTERM/grace/SIGKILL/close.
if (mode === 'native' && measurement === 'cancellation') {
  const { spawn } = await import('node:child_process');
  run = (command, options) =>
    new Promise((resolve, reject) => {
      const child = spawn(command.executable, command.arguments, {
        shell: false,
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      child.stdout.resume();
      let grace;
      const abort = () => {
        child.kill('SIGTERM');
        grace = setTimeout(() => child.kill('SIGKILL'), options.gracePeriodMs);
      };
      options.signal.addEventListener('abort', abort, { once: true });
      child.once('error', reject);
      child.once('close', () => {
        clearTimeout(grace);
        options.signal.removeEventListener('abort', abort);
        reject(
          Object.assign(new Error('Cancelled', { cause: options.signal.reason }), {
            name: 'ProcessAbortError',
            processIdentifier: child.pid,
          }),
        );
      });
    });
}
const command = (executable, args = []) =>
  sdk ? sdk.Command.path(executable, args) : { executable, arguments: args };
const policy = (limit) => (sdk ? sdk.Output.bytes({ limit }) : { kind: 'bytes', limit });
if (measurement === 'memory') {
  const size = Number(count);
  // Initialize the same child path and any lazy native workers before the baseline.
  await run(command('/usr/bin/true'));
  globalThis.gc();
  const before = process.memoryUsage(),
    peak = { ...before };
  function sample() {
    const value = process.memoryUsage();
    for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], value[key]);
  }
  const timer = setInterval(sample, 1);
  const result = await run(
    command(resolve(import.meta.dirname, 'target/fixture'), ['emit', String(size)]),
    {
      output: policy(size),
      error: policy(size),
    },
  );
  sample();
  clearInterval(timer);
  assert.equal(result.standardOutput.length, size);
  assert.equal(result.standardError.length, size);
  assert.equal(result.standardOutput[0], 97);
  assert.equal(result.standardError[size - 1], 98);
  console.log(
    JSON.stringify({
      mode,
      bytesPerStream: size,
      before,
      observedPeak: peak,
      delta: Object.fromEntries(Object.keys(peak).map((key) => [key, peak[key] - before[key]])),
      maxRSSKiB: process.resourceUsage().maxRSS,
      scope:
        '1 ms parent memory observations plus settlement; no hard peak guarantee. Native allocator bytes may be absent from V8 external/arrayBuffers.',
    }),
  );
} else if (measurement === 'concurrency') {
  const countValue = Number(count);
  const cgroupV2Before = cpuState();
  const allowedCPUList = readFileSync('/proc/self/status', 'utf8').match(
    /^Cpus_allowed_list:\s*(.*)$/m,
  )?.[1];
  const cpu = process.cpuUsage(),
    start = performance.now();
  await Promise.all(
    Array.from({ length: countValue }, () =>
      run(command(process.execPath, ['-e', 'setTimeout(()=>{},100)'])),
    ),
  );
  const usage = process.cpuUsage(cpu);
  console.log(
    JSON.stringify({
      mode,
      children: countValue,
      wallMs: performance.now() - start,
      parentCPUMs: (usage.user + usage.system) / 1000,
      uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE ?? 'default (4)',
      cgroupV2Before,
      allowedCPUList,
      cgroupV2After: cpuState(),
    }),
  );
} else if (measurement === 'contention' || measurement === 'cancellation') {
  const fs = await import('node:fs'),
    { readFile } = await import('node:fs/promises'),
    { tmpdir } = await import('node:os');
  const folder = fs.mkdtempSync(resolve(tmpdir(), 'twill-native-bench-'));
  const owned = [];
  try {
    if (measurement === 'contention') {
      const release = resolve(folder, 'release'),
        markers = Array.from({ length: 32 }, (_, i) => resolve(folder, String(i)));
      const code =
        'const fs=require("node:fs");fs.writeFileSync(process.argv[1]+".tmp",String(process.pid));fs.renameSync(process.argv[1]+".tmp",process.argv[1]);const timer=setInterval(()=>{if(fs.existsSync(process.argv[2])){clearInterval(timer)}},5)';
      const tasks = markers.map((marker) =>
        run(command(process.execPath, ['-e', code, marker, release])),
      );
      tasks.forEach((task) => task.catch(() => {}));
      const deadline = Date.now() + 15000;
      while (!markers.every((marker) => fs.existsSync(marker))) {
        assert(Date.now() < deadline);
        await new Promise((r) => setTimeout(r, 5));
      }
      const identifiers = markers.map((marker) => Number(fs.readFileSync(marker, 'utf8')));
      identifiers.forEach((pid) => assert(Number.isSafeInteger(pid) && pid > 0));
      owned.push(...identifiers);
      const start = performance.now();
      assert((await readFile(import.meta.filename)).length > 0);
      const filesystemWallMs = performance.now() - start;
      fs.writeFileSync(release, 'exit');
      const results = await Promise.all(tasks);
      results.forEach((r) => assert.equal(r.terminationStatus.code, 0));
      console.log(
        JSON.stringify({
          mode,
          children: 32,
          filesystemWallMs,
          uvThreadpoolSize: process.env.UV_THREADPOOL_SIZE,
        }),
      );
    } else {
      const controller = new AbortController(),
        marker = resolve(folder, 'pid');
      const code =
        'const fs=require("node:fs");process.on("SIGTERM",()=>{});fs.writeFileSync(process.argv[1]+".tmp",String(process.pid));fs.renameSync(process.argv[1]+".tmp",process.argv[1]);setInterval(()=>{},1000)';
      const task = run(command(process.execPath, ['-e', code, marker]), {
        signal: controller.signal,
        gracePeriodMs: 20,
        killTimeoutMs: 1000,
        output: policy(1024),
      });
      task.catch(() => {});
      const deadline = Date.now() + 10000;
      while (!fs.existsSync(marker)) {
        assert(Date.now() < deadline);
        await new Promise((r) => setTimeout(r, 5));
      }
      const pid = Number(fs.readFileSync(marker, 'utf8'));
      assert(Number.isSafeInteger(pid) && pid > 0);
      owned.push(pid);
      const start = performance.now();
      controller.abort('benchmark');
      const error = await task.catch((error) => error);
      const cancellationWallMs = performance.now() - start;
      assert.equal(error.name, 'ProcessAbortError');
      assert.equal(error.processIdentifier, pid);
      assert.equal(error.unresolvedProcessIdentifier, undefined);
      assert.throws(() => process.kill(pid, 0));
      console.log(JSON.stringify({ mode, cancellationWallMs, gracePeriodMs: 20, joined: true }));
    }
  } finally {
    for (const pid of owned) {
      if (!Number.isSafeInteger(pid) || pid <= 0) continue;
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
    fs.rmSync(folder, { recursive: true, force: true });
  }
} else {
  await run(command('/usr/bin/true'));
}
