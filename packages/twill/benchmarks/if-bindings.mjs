import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { transform } from '../dist/index.js';
import { transform as minify } from 'esbuild';

const cases = [
  {
    name: 'identifier',
    inputs: [null, undefined, 0, 2, 7],
    sugar: 'function run(input){if const value=input{return value*2;}return 0;}',
    native: 'function run(input){if(input!==null&&input!==void 0){return input*2;}return 0;}',
  },
  {
    name: 'single-evaluation-call',
    inputs: [null, undefined, 0, 2, 7],
    sugar:
      'function lookup(value){return value;}function run(input){if const value=lookup(input){return value*2;}return 0;}',
    native:
      'function lookup(value){return value;}function run(input){const value=lookup(input);if(value!==null&&value!==void 0){return value*2;}return 0;}',
  },
  {
    name: 'object-destructuring',
    inputs: [null, undefined, { value: 0 }, { value: 2 }, { value: 7 }],
    sugar: 'function run(input){if const {value}=input{return value*2;}return 0;}',
    native:
      'function run(input){if(input!==null&&input!==void 0){const {value}=input;return value*2;}return 0;}',
  },
  {
    name: 'array-default-rest',
    inputs: [null, undefined, [], [0, 2], [7, 2, 3]],
    sugar:
      'function run(input){if const [first=2,...rest]=input{return first+rest.length;}return 0;}',
    native:
      'function run(input){if(input!==null&&input!==void 0){const [first=2,...rest]=input;return first+rest.length;}return 0;}',
  },
];
const iterations = 1_000_000,
  samples = 15,
  trials = 7;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const worker = process.argv.indexOf('--worker');
if (worker >= 0) {
  const item = cases[Number(process.argv[worker + 1])];
  const code =
    process.argv[worker + 2] === 'dialect'
      ? transform(item.sugar, { language: 'js' }).code
      : item.native;
  const fn = Function(code + ';return run;')();
  const start = performance.now();
  const coldResult = fn(item.inputs[0]);
  const coldCallMs = performance.now() - start;
  const execute = () => {
    let checksum = 0;
    for (let i = 0; i < iterations; i++) checksum += fn(item.inputs[i % item.inputs.length]);
    return checksum;
  };
  for (let i = 0; i < 5; i++) execute();
  const timings = [];
  let checksum;
  for (let i = 0; i < samples; i++) {
    const begin = performance.now();
    checksum = execute();
    timings.push(performance.now() - begin);
  }
  console.log(
    JSON.stringify({ timings, medianMs: median(timings), checksum, coldCallMs, coldResult }),
  );
  process.exit(0);
}
const digest = (content) => createHash('sha256').update(content).digest('hex');
const results = [];
for (const [index, item] of cases.entries()) {
  const generated = transform(item.sugar, { language: 'js' }).code;
  assert(
    !/=>|Promise|import |__twillDefers/.test(generated),
    'Branch binding must not add a closure/runtime/scheduling',
  );
  assert.equal(
    (generated.match(/function\b/g) || []).length,
    (item.native.match(/function\b/g) || []).length,
  );
  const dialect = Function(generated + ';return run;')(),
    native = Function(item.native + ';return run;')();
  for (const input of item.inputs) assert.equal(dialect(input), native(input));
  const run = (variant) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), '--worker', String(index), variant],
        { encoding: 'utf8' },
      ),
    );
  const measurements = [];
  for (let trial = 0; trial < trials; trial++) {
    const pair = {};
    for (const variant of trial % 2 ? ['native', 'dialect'] : ['dialect', 'native'])
      pair[variant] = run(variant);
    assert.equal(pair.dialect.checksum, pair.native.checksum);
    measurements.push({ ...pair, ratio: pair.dialect.medianMs / pair.native.medianMs });
  }
  const minified = (await minify(generated, { minify: true })).code,
    nativeMinified = (await minify(item.native, { minify: true })).code;
  results.push({
    name: item.name,
    sugar: item.sugar,
    native: item.native,
    generated,
    minified,
    nativeMinified,
    bytes: Buffer.byteLength(minified),
    nativeBytes: Buffer.byteLength(nativeMinified),
    generatedSha256: digest(generated),
    measurements,
    ratio: median(measurements.map((m) => m.ratio)),
    extraClosures: 0,
    extraRuntimeImports: 0,
  });
}
const report = {
  node: process.version,
  cpu: cpus()[0]?.model,
  iterations,
  samples,
  trials,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256: Object.fromEntries(
    ['src/parser.js', 'src/compiler.ts', 'benchmarks/if-bindings.mjs'].map((path) => [
      path,
      digest(readFileSync(new URL('../' + path, import.meta.url))),
    ]),
  ),
  buildSha256: digest(readFileSync(new URL('../dist/index.js', import.meta.url))),
  scope:
    'Isolated warmed V8 processes, alternating trial order; natural handwritten nullish branches. All wall-time samples and cold calls are retained. Rest allocation belongs to native destructuring in both variants. No cross-engine/application speed guarantee.',
  results,
};
const output = process.argv.indexOf('--output');
if (output >= 0) writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--verify-performance'))
  for (const item of results)
    assert(item.ratio <= 1.1, `${item.name}: ${item.ratio.toFixed(3)}x native exceeds 1.10x`);
