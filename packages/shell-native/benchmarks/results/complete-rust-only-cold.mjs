// Complete only the cold stage of the retained acceptance checkpoint.
// Warm, concurrency, memory and lifecycle samples are never repeated or edited.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { cpus, platform, arch, release, tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { nativeTarget } from '../../dist/platform.js';
const benchmarkDirectory = resolve(import.meta.dirname, '..');
const checkpointPath = resolve(import.meta.dirname, 'rust-only-cold-resolution.partial.json.txt');
const checkpointBytes = readFileSync(checkpointPath);
const checkpoint = JSON.parse(checkpointBytes);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function optionalText(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
}
assert.equal(process.version, 'v24.19.0');
assert.equal(process.platform, 'linux');
assert.equal(checkpoint.gitHead, '68080131f2a897677e35804db7bc4138a142726f');
assert.equal(checkpoint.gitStatus, '');
assert.equal(execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(), '');
assert.equal(checkpoint.stage, 'cancellation');
const changedFile = 'cold-rust.twill';
const identities = checkpoint.sourceAndBuildSHA256;
const coldIdentities = {};
for (const [file, before] of Object.entries(identities)) {
  const current = hash(readFileSync(resolve(benchmarkDirectory, file)));
  if (file !== changedFile) assert.equal(current, before, 'Measured source/build changed: ' + file);
  coldIdentities[file] = current;
}
assert.equal(
  readFileSync(resolve(benchmarkDirectory, changedFile), 'utf8'),
  "import { Command, Subprocess } from '../../shell/dist/index.js';\nawait Subprocess.run(Command.path('/usr/bin/true'));\n",
);
assert.notEqual(coldIdentities[changedFile], identities[changedFile]);
const cpuConstraints = checkpoint.cpuConstraints;
assert.equal(
  optionalText('/proc/self/status')?.match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1],
  cpuConstraints.allowedCPUList,
);
assert.equal(optionalText('/sys/fs/cgroup/cpu.max'), cpuConstraints.cgroupV2Quota);
const results = checkpoint.results,
  memory = checkpoint.memory,
  concurrency = checkpoint.concurrency,
  contention = checkpoint.contention,
  cancellation = checkpoint.cancellation;
assert.equal(results.length, 7);
results.forEach((row) => assert.equal(row.pairs.length, 11));
assert.equal(memory.length, 2);
memory.forEach((row) => assert.equal(row.pairs.length, 5));
assert.equal(concurrency.length, 3);
assert.deepEqual(
  concurrency.map((row) => [row.children, row.poolSize, row.pairs.length]),
  [
    [32, '4', 48],
    [128, '4', 48],
    [32, '32', 4],
  ],
);
assert.equal(contention.length, 5);
assert.equal(cancellation.length, 5);
for (const row of [...results, ...concurrency.filter((row) => row.poolSize === '4')])
  assert(
    row.rustVersusNative.wall.medianRatio <= 1.1 &&
      row.rustVersusNative.wall.ratio95PercentInterval.upper <= 1.1,
  );
const rustc = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
const cc = execFileSync('cc', ['--version'], { encoding: 'utf8' }).split('\n')[0];
const gitHead = checkpoint.gitHead,
  gitStatus = checkpoint.gitStatus;
const nativeImage = nativeTarget();
const samples = 11,
  concurrencySamples = 48,
  concurrencyCPUs = '0-3';
const orders = [
  ['native', 'rust'],
  ['rust', 'native'],
];
function save(stage) {
  checkpoint.stage = stage;
  writeFileSync(
    resolve(benchmarkDirectory, 'target/rust-only-cold-continuation.partial.json'),
    JSON.stringify(checkpoint, null, 2) + '\n',
  );
}
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
        resolve(benchmarkDirectory, '../../twill/bin/twill.mjs'),
        resolve(benchmarkDirectory, rust ? 'cold-rust.twill' : 'cold-native.twill'),
      ]
    : [resolve(benchmarkDirectory, 'observe.mjs'), mode, 'cold'];
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
  nativeArtifactBytes: statSync(resolve(benchmarkDirectory, `../native/${nativeImage}.node`)).size,
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
report.completion = {
  reason:
    'The engine package no longer depends on the public SDK. Correct only the unexecuted Rust cold fixture to import the same compiled public entry relatively; all measured runtime/build sources are unchanged.',
  checkpoint: 'rust-only-cold-resolution.partial.json.txt',
  checkpointSHA256: hash(checkpointBytes),
  coldGitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  continuationSourceSHA256: hash(readFileSync(import.meta.filename)),
  coldSourceAndBuildSHA256: coldIdentities,
  metadataScope:
    'Node version, affinity, quota and every original source/build digest are verified before completion. Toolchain and host labels are read while completing the cold stage; the compiled C fixture identity is unchanged.',
};
const output = process.argv[2];
assert(output, 'Expected output path');
writeFileSync(resolve(output), JSON.stringify(report, null, 2) + '\n');
for (const row of [...results, ...concurrency.filter((row) => row.poolSize === '4')])
  assert(
    row.rustVersusNative.wall.medianRatio <= 1.1 &&
      row.rustVersusNative.wall.ratio95PercentInterval.upper <= 1.1,
    'Native parity gate failed',
  );
console.log(
  'All seven warm and both default-pool gates pass; eleven cold pairs completed with unchanged runtime/build identities.',
);
