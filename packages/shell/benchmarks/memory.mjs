import assert from 'node:assert/strict';
import { resolve } from 'node:path';
const [mode, count] = process.argv.slice(2),
  size = Number(count);
const sdk = mode === 'sdk' ? await import('../dist/index.js') : undefined;
const run = sdk ? sdk.Subprocess.run : (await import('./native.mjs')).nativeRun;
const args = [resolve(import.meta.dirname, '../tests/fixtures/child.mjs'), 'large', String(size)];
const command = sdk
  ? sdk.Command.path(process.execPath, args)
  : { executable: process.execPath, arguments: args };
const policy = sdk ? sdk.Output.bytes({ limit: size }) : { kind: 'bytes', limit: size };
globalThis.gc();
const before = process.memoryUsage(),
  peak = { ...before };
function sample() {
  const memory = process.memoryUsage();
  for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], memory[key]);
}
const timer = setInterval(sample, 1);
try {
  const result = await run(command, { output: policy, error: policy });
  sample();
  assert.equal(result.standardOutput.length, size);
  assert.equal(result.standardError.length, size);
  assert.equal(result.standardOutput[0], 97);
  assert.equal(result.standardOutput[size - 1], 97);
  assert.equal(result.standardError[0], 98);
  assert.equal(result.standardError[size - 1], 98);
  console.log(
    JSON.stringify({
      mode,
      bytesPerStream: size,
      before,
      observedPeak: peak,
      delta: Object.fromEntries(Object.keys(peak).map((key) => [key, peak[key] - before[key]])),
    }),
  );
} finally {
  clearInterval(timer);
}
