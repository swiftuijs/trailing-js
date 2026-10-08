import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  statSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cpus, platform, arch, release, tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Command, Output, Subprocess } from '../../shell/dist/index.js';
import { nativeRun } from '../../shell/benchmarks/native.mjs';

import { nativeTarget } from '../dist/platform.js';
const nativeImage = nativeTarget();
const rustRun = Subprocess.run;

assert.equal(
  process.platform,
  'linux',
  'This benchmark currently requires Linux and cc; platform correctness is checked separately',
);
const samples = 11;
// Check report dependencies before measuring; a missing tool must not discard
// a complete run only when the final report is being constructed.
const rustc = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
const cc = mkdirSync(resolve(import.meta.dirname, 'target'), { recursive: true });
execFileSync('cc', ['--version'], { encoding: 'utf8' }).split('\n')[0];
function optionalText(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
}
const cpuConstraints = {
  allowedCPUList: optionalText('/proc/self/status')?.match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1],
  cgroupV2Quota: optionalText('/sys/fs/cgroup/cpu.max'),
  cgroupV2Before: optionalText('/sys/fs/cgroup/cpu.stat'),
};
const concurrencyCPUIndex = process.argv.indexOf('--concurrency-cpus');
const concurrencyCPUs =
  concurrencyCPUIndex === -1 ? undefined : process.argv[concurrencyCPUIndex + 1];
if (concurrencyCPUIndex !== -1) {
  assert(
    concurrencyCPUs && /^[0-9,-]+$/.test(concurrencyCPUs),
    'Expected --concurrency-cpus CPU list',
  );
  execFileSync('taskset', ['-c', concurrencyCPUs, '/usr/bin/true']);
}
const size = 1024 * 1024;
const nativeFixture = resolve(import.meta.dirname, 'target/fixture');
const nodeFixture = resolve(import.meta.dirname, '../../shell/tests/fixtures/child.mjs');
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
    count: 96,
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
const runs = { native: nativeRun, rust: rustRun };
const orders = [
  ['native', 'rust'],
  ['rust', 'native'],
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
  if (Buffer.isBuffer(workload.expected)) assert(result.standardOutput.equals(workload.expected));
  else assert.deepEqual(result.standardOutput, workload.expected);
  if (Buffer.isBuffer(workload.expectedError))
    assert(result.standardError.equals(workload.expectedError));
  else assert.deepEqual(result.standardError, workload.expectedError);
  assert.deepEqual(result.terminationStatus, { kind: 'exited', code: 0 });
  return { wallMs, parentCPUMs: (usage.user + usage.system) / 1000 };
}
const identities = {};
for (const file of [
  '../crate/Cargo.toml',
  '../crate/Cargo.lock',
  '../crate/rust-toolchain.toml',
  '../crate/build.rs',
  '../crate/src/lib.rs',
  '../crate/src/process.rs',
  '../crate/src/platform.rs',
  '../../shell/src/index.ts',
  '../src/bindings.ts',
  '../../shell/src/environment.ts',
  '../../shell/src/cwd.ts',
  '../src/platform.ts',
  '../src/libc.ts',
  '../dist/platform.js',
  '../dist/libc.js',
  '../../shell/dist/environment.js',
  '../../shell/dist/cwd.js',
  '../dist/index.js',
  '../dist/bindings.js',
  '../scripts/build.mjs',
  '../scripts/identity.mjs',
  `../native/${nativeImage}.node`,
  `../native/${nativeImage}.json`,
  'fixture.c',
  'target/fixture',
  'benchmark.mjs',
  'observe.mjs',
  'cold-native.twill',
  'cold-rust.twill',
  '../../shell/src/index.ts',
  '../../shell/src/values.ts',
  '../../shell/src/errors.ts',
  '../../shell/dist/index.js',
  '../../shell/dist/values.js',
  '../../shell/dist/errors.js',
  '../../shell/benchmarks/native.mjs',
  '../../shell/tests/fixtures/child.mjs',
  '../../twill/bin/twill.mjs',
  '../../twill/bin/run.mjs',
  ...readdirSync(resolve(import.meta.dirname, '../../twill/dist'))
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => '../../twill/dist/' + file),
])
  identities[file] = createHash('sha256')
    .update(readFileSync(resolve(import.meta.dirname, file)))
    .digest('hex');
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const gitStatus = execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim();
assert.equal(gitStatus, '', 'Commit the measured sources before timing');
const checkpoint = { gitHead, gitStatus, cpuConstraints };
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
    rustVersusNative: {
      wall: comparison(pairs, 'rust', 'native', 'wallMs'),
      parentCPU: comparison(pairs, 'rust', 'native', 'parentCPUMs'),
    },
  };
  results.push(result);
  delete checkpoint.activeWorkload;
  save('warm');
  console.error(
    `${result.name}: Rust/Node wall ${result.rustVersusNative.wall.medianRatio.toFixed(3)}, parent CPU ${result.rustVersusNative.parentCPU.medianRatio.toFixed(3)}`,
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
// Forty-eight paired samples for the default-pool acceptance workloads;
// short initial runs had inconclusive tail intervals even at twelve pairs.
const concurrencySamples = 48;
checkpoint.concurrency = concurrency;
for (const [poolSize, children] of [
  ['4', 32],
  ['4', 128],
  ['32', 32],
]) {
  const pairs = [];
  for (
    let sample = 0;
    sample < (poolSize === '4' ? concurrencySamples : orders.length * 2);
    sample++
  ) {
    const pair = { order: orders[sample % orders.length] };
    for (const mode of pair.order)
      pair[mode] = JSON.parse(
        execFileSync(
          concurrencyCPUs ? 'taskset' : process.execPath,
          [
            ...(concurrencyCPUs ? ['-c', concurrencyCPUs, process.execPath] : []),
            resolve(import.meta.dirname, 'observe.mjs'),
            mode,
            'concurrency',
            String(children),
          ],
          { encoding: 'utf8', env: { ...process.env, UV_THREADPOOL_SIZE: poolSize } },
        ),
      );
    pairs.push(pair);
  }
  concurrency.push({
    poolSize,
    children,
    pairs,
    rustVersusNative: { wall: comparison(pairs, 'rust', 'native', 'wallMs') },
  });
  save('concurrency');
}
const contention = [],
  cancellation = [];
checkpoint.contention = contention;
checkpoint.cancellation = cancellation;
for (let sample = 0; sample < 5; sample++) {
  const pair = { order: orders[sample % orders.length] };
  for (const mode of pair.order)
    pair[mode] = JSON.parse(
      execFileSync(
        process.execPath,
        [resolve(import.meta.dirname, 'observe.mjs'), mode, 'contention'],
        { encoding: 'utf8', env: { ...process.env, UV_THREADPOOL_SIZE: '1' } },
      ),
    );
  contention.push(pair);
  save('filesystem');
  const cancelPair = { order: sample % 2 ? ['rust', 'native'] : ['native', 'rust'] };
  for (const mode of cancelPair.order)
    cancelPair[mode] = JSON.parse(
      execFileSync(
        process.execPath,
        [resolve(import.meta.dirname, 'observe.mjs'), mode, 'cancellation'],
        { encoding: 'utf8' },
      ),
    );
  cancellation.push(cancelPair);
  save('cancellation');
}
const cache = mkdtempSync(resolve(tmpdir(), 'twill-rust-cold-'));
const coldModes = [
  'native',
  'rust',
  'source-native-cached',
  'source-rust-cached',
  'source-native-uncached',
  'source-rust-uncached',
];
function cold(mode) {
  const isSource = mode.startsWith('source-');
  const rust = mode.includes('rust');
  const command = isSource
    ? [
        resolve(import.meta.dirname, '../../twill/bin/twill.mjs'),
        resolve(import.meta.dirname, rust ? 'cold-rust.twill' : 'cold-native.twill'),
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
  backend: '@swiftuijs/twill-shell Rust-only SDK',
  node: process.version,
  platform: platform(),
  arch: arch(),
  kernel: release(),
  cpu: cpus()[0]?.model,
  cpuConstraints: { ...cpuConstraints, cgroupV2After: optionalText('/sys/fs/cgroup/cpu.stat') },
  rustc,
  cc,
  gitHead,
  gitStatus,
  sourceAndBuildSHA256: identities,
  nativeArtifactBytes: statSync(resolve(import.meta.dirname, `../native/${nativeImage}.node`)).size,
  samples,
  concurrencySamples,
  concurrencyCPUs,
  orderPermutations: orders,
  scope:
    'Linux production-contract direct-child backend; success workloads interleaved/checked against natural handwritten Node. Parent CPU includes Rust reactor, excludes child CPU. Native copies input/snapshots cwd/environment and performs the full shared SDK contract. Independent async scheduling; no libuv worker per child. Failure ownership/cancellation is measured separately; no child acceleration, compiler port, containment, pipeline or cross-platform performance claim.',
  results,
  memory,
  concurrency,
  contention,
  cancellation,
  cold: {
    pairs: coldPairs,
    medianWallMs: Object.fromEntries(
      coldModes.map((mode) => [mode, median(coldPairs.map((pair) => pair[mode].wallMs))]),
    ),
    sourceRustVersusNativeCached: comparison(
      coldPairs,
      'source-rust-cached',
      'source-native-cached',
      'wallMs',
    ),
    sourceRustVersusNativeUncached: comparison(
      coldPairs,
      'source-rust-uncached',
      'source-native-uncached',
      'wallMs',
    ),
    scope:
      'Fresh Node interpreter/backend imports/one /usr/bin/true child. Source modes use the actual Twill runner with validated hit or disabled cache; OS/filesystem caches warm. Each direct mode imports only its backend; Rust uses the same SDK Command constructor. No standalone Rust interpreter.',
  },
};
save('complete');
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
  assert(process.argv[outputIndex + 1], 'Missing --output path');
  writeFileSync(resolve(process.argv[outputIndex + 1]), JSON.stringify(report, null, 2) + '\n');
} else process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--verify-performance'))
  for (const result of [...results, ...concurrency.filter((row) => row.poolSize === '4')])
    assert(
      result.rustVersusNative.wall.medianRatio <= 1.1 &&
        result.rustVersusNative.wall.ratio95PercentInterval.upper <= 1.1,
      `Native parity gate failed: ${result.name ?? 'concurrency-' + result.children}`,
    );
