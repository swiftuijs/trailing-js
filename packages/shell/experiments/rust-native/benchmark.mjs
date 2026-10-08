import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cpus, platform, arch, release, tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Command, Output, Subprocess } from '../../dist/index.js';
import { nativeRun } from '../../benchmarks/native.mjs';
import { rustRun } from './adapter.mjs';

const samples = 11;
const size = 1024 * 1024;
const nativeFixture = resolve(import.meta.dirname, 'target/fixture');
const nodeFixture = resolve(import.meta.dirname, '../../tests/fixtures/child.mjs');
execFileSync('cc', [
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  resolve(import.meta.dirname, 'fixture.c'),
  '-o',
  nativeFixture,
]);
const policy = (count) => Output.bytes({ limit: count });
const workloads = [
  {
    name: 'native-executable-inherit',
    command: Command.path('/usr/bin/true'),
    options: {},
    count: 512,
  },
  {
    name: 'node-inherit',
    command: Command.path(process.execPath, ['-e', '']),
    options: {},
    count: 24,
  },
  ...[size, 8 * size].map((bytes) => ({
    name: `native-dual-capture-${bytes}`,
    command: Command.path(nativeFixture, ['emit', String(bytes)]),
    options: { output: policy(bytes), error: policy(bytes) },
    count: bytes === size ? 64 : 16,
    expected: Buffer.alloc(bytes, 97),
    expectedError: Buffer.alloc(bytes, 98),
  })),
  {
    name: 'node-dual-capture-1048576',
    command: Command.path(process.execPath, [nodeFixture, 'large', String(size)]),
    options: { output: policy(size), error: policy(size) },
    count: 16,
    expected: Buffer.alloc(size, 97),
    expectedError: Buffer.alloc(size, 98),
  },
  {
    name: 'native-stdin-text-1048576',
    command: Command.path(nativeFixture, ['echo']),
    options: { input: 'x'.repeat(size), output: Output.text({ limit: size }) },
    count: 64,
    expected: 'x'.repeat(size),
  },
  {
    name: 'native-duplex-1048576',
    command: Command.path(nativeFixture, ['duplex']),
    options: { input: Buffer.alloc(size, 255), output: policy(size), error: policy(size) },
    count: 64,
    expected: Buffer.alloc(size, 255),
    expectedError: Buffer.alloc(size, 255),
  },
];
const runs = { native: nativeRun, sdk: Subprocess.run, rust: rustRun };
const orders = [
  ['native', 'sdk', 'rust'],
  ['rust', 'sdk', 'native'],
  ['sdk', 'rust', 'native'],
  ['native', 'rust', 'sdk'],
  ['rust', 'native', 'sdk'],
  ['sdk', 'native', 'rust'],
];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function confidence(ratios) {
  let seed = 123456789;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
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
function comparison(pairs, mode, baseline, key) {
  const ratios = pairs.map((pair) => pair[mode][key] / pair[baseline][key]);
  return { medianRatio: median(ratios), ratio95PercentInterval: confidence(ratios) };
}
async function operation(run, workload) {
  const cpu = process.cpuUsage(),
    start = performance.now();
  const result = await run(workload.command, workload.options);
  const wallMs = performance.now() - start,
    usage = process.cpuUsage(cpu);
  // Consume and verify every result outside the timer, preventing unchecked timings.
  assert.deepEqual(result.standardOutput, workload.expected);
  assert.deepEqual(result.standardError, workload.expectedError);
  assert.deepEqual(result.terminationStatus, { kind: 'exited', code: 0 });
  return { wallMs, parentCPUMs: (usage.user + usage.system) / 1000 };
}
const identities = {};
for (const file of [
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  'build.rs',
  'src/lib.rs',
  'build.mjs',
  'adapter.mjs',
  'fixture.c',
  'target/fixture',
  'benchmark.mjs',
  'observe.mjs',
  'cold-sdk.twill',
  'cold-rust.twill',
  'experiment.node',
  '../../src/index.ts',
  '../../src/values.ts',
  '../../src/errors.ts',
  '../../dist/index.js',
  '../../dist/values.js',
  '../../dist/errors.js',
  '../../benchmarks/native.mjs',
  '../../tests/fixtures/child.mjs',
  '../../../twill/bin/twill.mjs',
  '../../../twill/bin/run.mjs',
  ...readdirSync(resolve(import.meta.dirname, '../../../twill/dist'))
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => '../../../twill/dist/' + file),
])
  identities[file] = createHash('sha256')
    .update(readFileSync(resolve(import.meta.dirname, file)))
    .digest('hex');
const checkpoint = {};
function save(stage) {
  writeFileSync(
    resolve(import.meta.dirname, 'target/benchmark-partial.json'),
    JSON.stringify({ stage, sourceAndBuildSHA256: identities, ...checkpoint }, null, 2) + '\n',
  );
}
const results = [];
checkpoint.results = results;
for (const workload of workloads) {
  for (const run of Object.values(runs)) for (let n = 0; n < 8; n++) await operation(run, workload);
  const pairs = [];
  for (let sample = 0; sample < samples; sample++) {
    const pair = {
      native: { wallMs: 0, parentCPUMs: 0 },
      sdk: { wallMs: 0, parentCPUMs: 0 },
      rust: { wallMs: 0, parentCPUMs: 0 },
      operations: workload.count,
      sample,
    };
    for (let count = 0; count < workload.count; count++) {
      for (const mode of orders[(sample + count) % orders.length]) {
        const observation = await operation(runs[mode], workload);
        for (const key of ['wallMs', 'parentCPUMs']) pair[mode][key] += observation[key];
      }
    }
    pairs.push(pair);
    checkpoint.activeWorkload = { name: workload.name, pairs };
    save('warm');
  }
  const result = {
    name: workload.name,
    argv: [workload.command.executable, ...workload.command.arguments],
    inputBytes: workload.options.input?.length ?? 0,
    outputByteLimit: workload.options.output?.limit ?? null,
    errorByteLimit: workload.options.error?.limit ?? null,
    pairs,
    medianWallMsPerOperation: Object.fromEntries(
      Object.keys(runs).map((mode) => [
        mode,
        median(pairs.map((pair) => pair[mode].wallMs / workload.count)),
      ]),
    ),
    rustVersusSDK: {
      wall: comparison(pairs, 'rust', 'sdk', 'wallMs'),
      parentCPU: comparison(pairs, 'rust', 'sdk', 'parentCPUMs'),
    },
    rustVersusNative: {
      wall: comparison(pairs, 'rust', 'native', 'wallMs'),
      parentCPU: comparison(pairs, 'rust', 'native', 'parentCPUMs'),
    },
    sdkVersusNative: { wall: comparison(pairs, 'sdk', 'native', 'wallMs') },
  };
  results.push(result);
  delete checkpoint.activeWorkload;
  save('warm');
  console.error(
    `${result.name}: Rust/SDK wall ${result.rustVersusSDK.wall.medianRatio.toFixed(3)}, parent CPU ${result.rustVersusSDK.parentCPU.medianRatio.toFixed(3)}`,
  );
}

const memory = [];
checkpoint.memory = memory;
for (const bytes of [size, 8 * size]) {
  const pairs = [];
  for (let sample = 0; sample < 5; sample++) {
    const pair = { order: orders[sample % orders.length] };
    for (const mode of pair.order)
      pair[mode] = JSON.parse(
        execFileSync(
          process.execPath,
          [
            '--expose-gc',
            resolve(import.meta.dirname, 'observe.mjs'),
            mode,
            'memory',
            String(bytes),
          ],
          { encoding: 'utf8' },
        ),
      );
    pairs.push(pair);
  }
  memory.push({ bytesPerStream: bytes, pairs });
  save('memory');
}
const concurrency = [];
checkpoint.concurrency = concurrency;
for (const poolSize of ['4', '32']) {
  const pairs = [];
  for (let sample = 0; sample < 5; sample++) {
    const pair = { order: orders[sample % orders.length] };
    for (const mode of pair.order)
      pair[mode] = JSON.parse(
        execFileSync(
          process.execPath,
          [resolve(import.meta.dirname, 'observe.mjs'), mode, 'concurrency', '32'],
          { encoding: 'utf8', env: { ...process.env, UV_THREADPOOL_SIZE: poolSize } },
        ),
      );
    pairs.push(pair);
  }
  concurrency.push({ poolSize, children: 32, pairs });
  save('concurrency');
}
const cache = mkdtempSync(resolve(tmpdir(), 'twill-rust-cold-'));
const coldModes = [
  'native',
  'sdk',
  'rust',
  'source-sdk-cached',
  'source-rust-cached',
  'source-sdk-uncached',
  'source-rust-uncached',
];
function cold(mode) {
  const isSource = mode.startsWith('source-');
  const rust = mode.includes('rust');
  const command = isSource
    ? [
        resolve(import.meta.dirname, '../../../twill/bin/twill.mjs'),
        resolve(import.meta.dirname, rust ? 'cold-rust.twill' : 'cold-sdk.twill'),
      ]
    : [resolve(import.meta.dirname, 'observe.mjs'), mode, 'cold'];
  const start = performance.now();
  execFileSync(process.execPath, command, {
    encoding: 'utf8',
    env: {
      ...process.env,
      TWILL_CACHE_DIR: cache,
      ...(mode.endsWith('uncached') ? { TWILL_CACHE: '0' } : { TWILL_CACHE: '1' }),
    },
  });
  return { wallMs: performance.now() - start };
}
const coldPairs = [];
checkpoint.coldPairs = coldPairs;
try {
  for (const mode of coldModes) cold(mode);
  for (let sample = 0; sample < samples; sample++) {
    const order = Array.from(
      { length: coldModes.length },
      (_, i) => coldModes[(sample + i) % coldModes.length],
    );
    const pair = { order };
    for (const mode of order) pair[mode] = cold(mode);
    coldPairs.push(pair);
    save('cold');
  }
} finally {
  rmSync(cache, { recursive: true, force: true });
}
const report = {
  schemaVersion: 1,
  dateUTC: new Date().toISOString(),
  node: process.version,
  platform: platform(),
  arch: arch(),
  kernel: release(),
  cpu: cpus()[0]?.model,
  rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
  cc: execFileSync('cc', ['--version'], { encoding: 'utf8' }).split('\n')[0],
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  gitStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  sourceAndBuildSHA256: identities,
  nativeArtifactBytes: statSync(resolve(import.meta.dirname, 'experiment.node')).size,
  samples,
  orderPermutations: orders,
  scope:
    'Linux successful direct-child subset; all individual operations interleaved and checked. Parent CPU includes Rust worker threads, excludes child CPU. Rust snapshots input and uses a hard direct-child deadline, generic errors and libuv pool; it is not full SDK contract parity. No child acceleration, compiler port, containment, pipeline or cross-platform claim.',
  results,
  memory,
  concurrency,
  cold: {
    pairs: coldPairs,
    medianWallMs: Object.fromEntries(
      coldModes.map((mode) => [mode, median(coldPairs.map((pair) => pair[mode].wallMs))]),
    ),
    sourceRustVersusSDKCached: comparison(
      coldPairs,
      'source-rust-cached',
      'source-sdk-cached',
      'wallMs',
    ),
    sourceRustVersusSDKUncached: comparison(
      coldPairs,
      'source-rust-uncached',
      'source-sdk-uncached',
      'wallMs',
    ),
    scope:
      'Fresh Node interpreter/backend imports/one /usr/bin/true child. Source modes use the actual Twill runner with validated hit or disabled cache; OS/filesystem caches warm. Each direct mode imports only its backend; Rust uses the same SDK Command constructor. No standalone Rust interpreter.',
  },
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
