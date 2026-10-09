import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
// Load identical modules in both modes. Only the measured coordinator differs.
import { Subprocess } from '../dist/index.js';
import { nativeRun } from './native.mjs';
import { workloads } from './workloads.mjs';

const [mode, name] = process.argv.slice(2);
assert(mode === 'native' || mode === 'sdk');
const workload = workloads.find((row) => row.name === name);
assert(workload, 'Unknown workload');
const run = mode === 'native' ? nativeRun : Subprocess.run;
async function operation(run, workload) {
  const cpu = process.cpuUsage(),
    start = performance.now();
  const result = await run(workload.command, workload.options);
  const wallMs = performance.now() - start,
    usage = process.cpuUsage(cpu);
  // Consume and verify every result outside the timer, preventing unchecked timings.
  if (Buffer.isBuffer(workload.expected)) assert(result.standardOutput.equals(workload.expected));
  else assert.deepEqual(result.standardOutput, workload.expected);
  if (Buffer.isBuffer(workload.expectedError))
    assert(result.standardError.equals(workload.expectedError));
  else assert.deepEqual(result.standardError, workload.expectedError);
  assert.deepEqual(result.terminationStatus, { kind: 'exited', code: 0 });
  return { wallMs, parentCPUMs: (usage.user + usage.system) / 1000 };
}

for (let n = 0; n < 8; n++) await operation(run, workload);
const observations = [];
for (let n = 0; n < workload.count; n++) observations.push(await operation(run, workload));
console.log(
  JSON.stringify({
    wallMs: observations.reduce((total, row) => total + row.wallMs, 0),
    parentCPUMs: observations.reduce((total, row) => total + row.parentCPUMs, 0),
    observations,
  }),
);
