import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const [mode, measurement, count] = process.argv.slice(2);
const sdk = mode === 'native' ? undefined : await import('../../dist/index.js');
const run =
  mode === 'native'
    ? (await import('../../benchmarks/native.mjs')).nativeRun
    : mode === 'sdk'
      ? sdk.Subprocess.run
      : (await import('./adapter.mjs')).rustRun;
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
    }),
  );
} else {
  await run(command('/usr/bin/true'));
}
