import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { runDefers } from '../../runtime/dist/helpers/v1.js';
import { dynamicSource, dynamicNative, emittedRuntime, bundleScopes } from './runtime-fixtures.mjs';
process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
const inputs = [0, 1, 5, 25],
  iterations = 100_000,
  samples = 15,
  warmups = 5,
  trials = 3;
const sources = {
  native: dynamicNative,
  inline: emittedRuntime(dynamicSource, 'inline'),
  external: emittedRuntime(dynamicSource, 'external'),
};
function execute(source) {
  const imported = source.match(/import \{ runDefers as (\w+) \} from [^;]+;\s*/);
  return Function(
    imported?.[1] ?? 'unused',
    (imported ? source.replace(imported[0], '') : source) + ';return run;',
  )(runDefers);
}
const worker = process.argv.indexOf('--worker');
if (worker >= 0) {
  const variant = process.argv[worker + 1],
    input = Number(process.argv[worker + 2]),
    fn = execute(sources[variant]);
  let sum = 0;
  const record = (value) => {
    sum += value;
  };
  const firstStart = performance.now();
  const firstValue = fn(input, record);
  const firstCallMs = performance.now() - firstStart;
  assert.equal(firstValue, input);
  const task = () => {
    sum = 0;
    let returned = 0;
    for (let i = 0; i < iterations; i++) returned += fn(input, record);
    return sum + returned;
  };
  for (let i = 0; i < warmups; i++) task();
  const times = [];
  let checksum;
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    checksum = task();
    times.push(performance.now() - start);
  }
  console.log(JSON.stringify({ firstCallMs, checksum, samplesMs: times }));
  process.exit(0);
}
for (const input of inputs) {
  const outcomes = Object.values(sources).map((source) => {
    const events = [];
    const value = execute(source)(input, (x) => events.push(x));
    return { value, events };
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[0], outcomes[2]);
}
const results = [];
for (const input of inputs) {
  const runs = { native: [], inline: [], external: [] };
  for (let trial = 0; trial < trials; trial++)
    for (const variant of trial % 2
      ? ['external', 'inline', 'native']
      : ['native', 'inline', 'external'])
      runs[variant].push(
        JSON.parse(
          execFileSync(
            process.execPath,
            [fileURLToPath(import.meta.url), '--worker', variant, String(input)],
            { encoding: 'utf8' },
          ),
        ),
      );
  const stats = {};
  for (const [variant, observations] of Object.entries(runs)) {
    const times = observations.flatMap((run) => run.samplesMs).sort((a, b) => a - b);
    assert(observations.every((run) => run.checksum === runs.native[0].checksum));
    stats[variant] = {
      medianMs: times[Math.floor(times.length / 2)],
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      checksum: observations[0].checksum,
      trials: observations,
    };
  }
  results.push({
    registrations: input,
    ...stats,
    inlineRatio: stats.inline.medianMs / stats.native.medianMs,
    externalRatio: stats.external.medianMs / stats.native.medianMs,
  });
}
const bundles = [];
for (const scopes of [1, 10, 100]) {
  const values = {};
  for (const variant of ['inline', 'external']) {
    const bundle = await bundleScopes(scopes, variant);
    values[variant] = {
      bytes: Buffer.byteLength(bundle.code),
      gzipBytes: gzipSync(bundle.code, { level: 9 }).length,
      buildMs: bundle.buildMs,
      inputs: bundle.inputs,
    };
  }
  bundles.push({ scopes, ...values });
}
const digest = createHash('sha256');
for (const directory of ['packages/twill/dist', 'packages/runtime/dist/helpers'])
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith('.js'))
    .sort())
    digest.update(directory + '/' + name + '\0' + readFileSync(directory + '/' + name));
const report = {
  timestamp: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  buildDigest: digest.digest('hex'),
  benchmarkDigest: createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .update(readFileSync(new URL('./runtime-fixtures.mjs', import.meta.url)))
    .digest('hex'),
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  methodology: {
    iterations,
    samples,
    warmups,
    trials,
    runtime:
      'All workers generate every mode before timing. Three isolated processes per variant, alternating launch order; aggregate all 45 samples. Handwritten native baseline has equivalent closures, lazy stack, reverse order and cleanup error replacement. First call is an unsampled observation per process; no cross-engine/cold-start guarantee.',
    bundle:
      'Minified ES2022 ESM, separate synthetic modules and real packaged helper; helper bytes included; gzip level 9. Build times are single observations including compilation/bundling.',
    scope:
      'Dynamic registration only; single direct cleanup and async paths are unchanged. Not a comparison against minimal single native finally, nor an application speed guarantee.',
  },
  results,
  bundles,
};
const output = process.argv.indexOf('--output');
if (output >= 0) writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--verify-performance'))
  for (const result of results)
    for (const mode of ['inline', 'external'])
      assert(
        result[mode + 'Ratio'] <= 1.1,
        `${mode}, ${result.registrations} registrations: exceeds the native-comparable 1.10 ratio target; retain all observations and investigate`,
      );
