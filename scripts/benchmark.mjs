import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { transform, originalPosition } from '../dist/index.js';
import { transform as minify } from 'esbuild';
import trailing from '../dist/rollup.js';

const samples = 15;
function measure(task) {
  for (let i = 0; i < 5; i++) task();
  const timings = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    task();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  return { medianMs: timings[Math.floor(samples / 2)], p95Ms: timings.at(-1) };
}
const plugin = trailing({ root: process.cwd() });
const pluginTransform =
  typeof plugin.transform === 'function' ? plugin.transform : plugin.transform.handler;
const context = { addWatchFile() {} };
const results = [];
for (const count of [10, 100, 1000]) {
  const sugar = Array.from(
    { length: count },
    (_, i) => `export const value${i} = [1,2,3].map() { value in value * 2 };`,
  ).join('\n');
  const plain = sugar.replaceAll(
    '.map() { value in value * 2 }',
    '.map((value) => { return value * 2; })',
  );
  const options = { filename: 'benchmark.tts' };
  const mapped = transform(sugar, options);
  const stages = {
    transformTS: measure(() => transform(sugar, options)),
    transformJS: measure(() => transform(sugar, { filename: 'benchmark.tjs' })),
    unchangedTS: measure(() => transform(plain, options)),
    pluginJS: measure(() => pluginTransform.call(context, sugar, 'benchmark.tjs')),
    pluginTS: measure(() => pluginTransform.call(context, sugar, 'benchmark.tts')),
    typescriptOnly: measure(() =>
      ts.transpileModule(plain, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
          inlineSources: true,
        },
      }),
    ),
    map100Positions: measure(() => {
      for (let i = 0; i < 100; i++) originalPosition(mapped, (i % count) + 1, 45);
    }),
  };
  results.push({ callbacks: count, bytes: Buffer.byteLength(sugar), stages });
  console.log(JSON.stringify(results.at(-1)));
}
// Code identity after ordinary host minification is stronger evidence than a
// noisy runtime timing ratio. It proves there is no added helper or dispatch.
const input = 'export function run(values) { return values.map() { value in value * 2 }; }';
const expected =
  'export function run(values) { return values.map((value) => { return value * 2; }); }';
const emitted = await minify(transform(input, { filename: 'runtime.tjs' }).code, { minify: true });
const reference = await minify(expected, { minify: true });
if (emitted.code !== reference.code) throw new Error('Runtime equivalence check failed');
const report = {
  timestamp: new Date().toISOString(),
  version: JSON.parse(readFileSync('package.json', 'utf8')).version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  buildDigest: createHash('sha256')
    .update(
      readdirSync('dist')
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => name + '\0' + readFileSync('dist/' + name, 'utf8'))
        .join('\0'),
    )
    .digest('hex'),
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  methodology: {
    samples,
    warmups: 5,
    sourceMaps: 'high-resolution with embedded source',
    includesStartup: false,
    runtimeCodeIdentical: true,
  },
  results,
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const path = process.argv[outputIndex + 1];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
}
