import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { platform, arch, cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Command, Output, Subprocess } from '../dist/index.js';
import { nativeRun } from './native.mjs';
import { nativeTarget } from '../../shell-native/dist/platform.js';
const args = process.argv.slice(2),
  outputIndex = args.indexOf('--output');
const samples = 9,
  repetitions = 64,
  tolerance = 1.1;
const size = 1024 * 1024;
const fixture = resolve(import.meta.dirname, '../tests/fixtures/child.mjs');
const workloads = [
  ...(process.platform !== 'win32' && existsSync('/usr/bin/true')
    ? [
        {
          name: 'native-executable-inherit',
          command: Command.path('/usr/bin/true'),
          options: {},
          count: 512,
          expected: undefined,
        },
      ]
    : []),
  {
    name: 'node-inherit',
    command: Command.path(process.execPath, ['-e', '']),
    options: {},
    count: repetitions,
    expected: undefined,
  },
  {
    name: 'dual-binary-capture',
    command: Command.path(process.execPath, [fixture, 'large', String(size)]),
    options: { output: Output.bytes({ limit: size }), error: Output.bytes({ limit: size }) },
    count: repetitions,
    expected: Buffer.alloc(size, 97),
    expectedError: Buffer.alloc(size, 98),
  },
  {
    name: 'stdin-text-capture',
    command: Command.path(process.execPath, [fixture, 'echo']),
    options: { input: 'x'.repeat(size), output: Output.text({ limit: size }) },
    count: repetitions,
    expected: 'x'.repeat(size),
  },
];
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const identities = {};
for (const file of [
  'src/index.twill',
  'src/values.twill',
  'src/errors.twill',
  'src/cwd.twill',
  'src/environment.twill',
  'dist/index.js',
  'dist/values.js',
  'dist/errors.js',
  'dist/cwd.js',
  'dist/environment.js',
  'benchmarks/native.mjs',
  'benchmarks/run.mjs',
  'benchmarks/memory.mjs',
  'benchmarks/cold.twill',
  'tests/fixtures/child.mjs',
])
  identities[file] = hash(resolve(import.meta.dirname, '..', file));
// The public SDK delegates to Rust: identify the implementation actually measured.
for (const file of [
  'src/index.twill',
  'src/bindings.twill',
  'src/platform.twill',
  'src/libc.twill',
  'dist/index.js',
  'dist/bindings.js',
  'dist/platform.js',
  'dist/libc.js',
  'crate/Cargo.toml',
  'crate/Cargo.lock',
  'crate/rust-toolchain.toml',
  'crate/build.rs',
  'crate/src/lib.rs',
  'crate/src/process.rs',
  'crate/src/platform.rs',
  `native/${nativeTarget()}.node`,
])
  identities[`../shell-native/${file}`] = hash(
    resolve(import.meta.dirname, '../../shell-native', file),
  );
const results = [];
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
// Paired bootstrap of the median; deterministic resampling and raw pairs stay in the report.
function confidence(ratios) {
  let seed = 123456789;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const medians = Array.from({ length: 10000 }, () =>
    median(
      Array.from({ length: ratios.length }, () => ratios[Math.floor(random() * ratios.length)]),
    ),
  ).sort((a, b) => a - b);
  return {
    method: 'paired bootstrap median, 10000 deterministic resamples',
    lower: medians[250],
    upper: medians[9750],
  };
}
async function batch(run, workload, count) {
  const cpu = process.cpuUsage(),
    start = performance.now();
  for (let i = 0; i < count; i++) await run(workload.command, workload.options);
  const wallMs = performance.now() - start,
    usage = process.cpuUsage(cpu);
  return {
    wallMs,
    cpuUserMs: usage.user / 1000,
    cpuSystemMs: usage.system / 1000,
    operations: count,
  };
}
for (const workload of workloads) {
  for (const run of [nativeRun, Subprocess.run]) {
    const result = await run(workload.command, workload.options);
    assert.deepEqual(result.standardOutput, workload.expected);
    assert.deepEqual(result.standardError, workload.expectedError);
    assert.deepEqual(result.terminationStatus, { kind: 'exited', code: 0 });
    await batch(run, workload, 8);
  }
  const pairs = [];
  for (let i = 0; i < samples; i++) {
    const pair = {
      order: i % 2 ? ['sdk', 'native'] : ['native', 'sdk'],
      native: { wallMs: 0, cpuUserMs: 0, cpuSystemMs: 0, operations: workload.count },
      sdk: { wallMs: 0, cpuUserMs: 0, cpuSystemMs: 0, operations: workload.count },
    };
    // Interleave individual operations so OS load/CPU scaling affects both contemporaneously.
    for (let operation = 0; operation < workload.count; operation++) {
      const order = (i + operation) % 2 ? ['sdk', 'native'] : ['native', 'sdk'];
      for (const label of order) {
        const sample = await batch(label === 'sdk' ? Subprocess.run : nativeRun, workload, 1);
        for (const key of ['wallMs', 'cpuUserMs', 'cpuSystemMs']) pair[label][key] += sample[key];
      }
    }
    pair.wallRatio = pair.sdk.wallMs / pair.native.wallMs;
    pairs.push(pair);
  }
  const ratio = median(pairs.map((p) => p.wallRatio));
  const interval = confidence(pairs.map((p) => p.wallRatio));
  results.push({
    name: workload.name,
    argv: [workload.command.executable, ...workload.command.arguments],
    inputBytes: workload.options.input?.length ?? 0,
    outputByteLimit: workload.options.output?.limit ?? null,
    errorByteLimit: workload.options.error?.limit ?? null,
    pairs,
    medianWallRatio: ratio,
    wallRatio95PercentInterval: interval,
    assessment:
      interval.upper <= tolerance
        ? 'within tolerance in sampled environment'
        : interval.lower > tolerance
          ? 'regression'
          : 'inconclusive',
    medianParentCPURatio: median(
      pairs.map(
        (p) => (p.sdk.cpuUserMs + p.sdk.cpuSystemMs) / (p.native.cpuUserMs + p.native.cpuSystemMs),
      ),
    ),
    medianNativeWallMs: median(pairs.map((p) => p.native.wallMs)),
    medianSDKWallMs: median(pairs.map((p) => p.sdk.wallMs)),
    withinTolerance: ratio <= tolerance,
  });
  console.log(
    `${workload.name}: SDK/native ${ratio.toFixed(3)} (${samples} paired samples, ${workload.count} operations/sample)`,
  );
}

const memory = [];
for (const size of [1048576, 8388608]) {
  const pairs = [];
  for (let i = 0; i < 3; i++) {
    const pair = { order: i % 2 ? ['sdk', 'native'] : ['native', 'sdk'] };
    for (const mode of pair.order)
      pair[mode] = JSON.parse(
        execFileSync(
          process.execPath,
          ['--expose-gc', resolve(import.meta.dirname, 'memory.mjs'), mode, String(size)],
          { encoding: 'utf8' },
        ),
      );
    pairs.push(pair);
  }
  memory.push({
    bytesPerStream: size,
    pairs,
    scope:
      'Isolated parent processes; 1ms sampling plus immediate post-settlement observation. Not a hard peak/RSS bound.',
  });
}
console.log('Isolated capture memory samples collected at 1 MiB and 8 MiB per stream.');
const coldStart = [];
for (let i = 0; i < 9; i++) {
  const pair = { order: i % 2 ? ['sdk', 'native', 'twill'] : ['twill', 'native', 'sdk'] };
  for (const mode of pair.order) {
    const entry = new URL(mode === 'sdk' ? '../dist/index.js' : './native.mjs', import.meta.url)
      .href;
    const code =
      mode === 'sdk'
        ? `import {Command,Subprocess} from ${JSON.stringify(entry)};await Subprocess.run(Command.path(process.execPath,['-e','']));`
        : `import {nativeRun} from ${JSON.stringify(entry)};await nativeRun({executable:process.execPath,arguments:['-e','']});`;
    const args =
      mode === 'twill'
        ? ['--import', '@swiftuijs/twill/register', resolve(import.meta.dirname, 'cold.twill')]
        : ['--input-type=module', '-e', code];
    const start = performance.now();
    execFileSync(process.execPath, args, {
      cwd: resolve(import.meta.dirname, '..'),
      stdio: 'ignore',
    });
    pair[mode] = { wallMs: performance.now() - start };
  }
  coldStart.push(pair);
}
const execFileSamples = [];
const captureWorkload = workloads.find((workload) => workload.name === 'dual-binary-capture');
const execFileRun = (command) =>
  new Promise((resolve, reject) => {
    const child = execFile(
      command.executable,
      command.arguments,
      { encoding: 'buffer', maxBuffer: size },
      (error, stdout, stderr) =>
        error ? reject(error) : resolve({ standardOutput: stdout, standardError: stderr }),
    );
    child.stdin.end();
  });
const reference = await execFileRun(captureWorkload.command);
assert(reference.standardOutput.equals(captureWorkload.expected));
assert(reference.standardError.equals(captureWorkload.expectedError));
for (let i = 0; i < 9; i++)
  execFileSamples.push(await batch(execFileRun, captureWorkload, captureWorkload.count));
const report = {
  schemaVersion: 1,
  node: process.version,
  platform: platform(),
  arch: arch(),
  cpu: cpus()[0]?.model,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: import.meta.dirname,
    encoding: 'utf8',
  }).trim(),
  sourceAndBuildSHA256: identities,
  scope:
    'Successful direct-child execution. Paired warm samples alternate order for each individual operation; CPU is parent-only. Cold startup and isolated memory observations are separate. Cancellation, concurrency and process trees are not inferred.',
  samples,
  tolerance,
  results,
  memory,
  coldStart: {
    pairs: coldStart,
    medianWallMs: Object.fromEntries(
      ['native', 'sdk', 'twill'].map((mode) => [
        mode,
        median(coldStart.map((pair) => pair[mode].wallMs)),
      ]),
    ),
    scope:
      'Node startup, imports and one empty Node child; Twill additionally loads the existing compiler once. Separate from warm SDK execution.',
  },
  execFileReference: {
    samples: execFileSamples,
    medianWallMs: median(execFileSamples.map((sample) => sample.wallMs)),
    scope:
      'Native execFile binary capture with same per-stream limit and EOF. It internally creates stdin pipe; reference only, not the spawn gate.',
  },
};
if (outputIndex !== -1)
  writeFileSync(
    resolve(process.cwd(), args[outputIndex + 1]),
    JSON.stringify(report, null, 2) + '\n',
  );
if (args.includes('--verify-performance'))
  assert(
    results.every(
      (r) => r.withinTolerance && r.assessment === 'within tolerance in sampled environment',
    ),
    'Shell/native wall ratio exceeds 1.10 or its paired confidence interval is inconclusive; inspect all raw samples.',
  );
