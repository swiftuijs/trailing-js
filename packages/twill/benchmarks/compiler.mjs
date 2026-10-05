import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { transform, originalPosition } from '../dist/index.js';
import { transform as minify } from 'esbuild';
import twill from '../dist/rollup.js';

process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));

const samples = 15;
function measure(task, warmups = 5) {
  for (let i = 0; i < warmups; i++) task();
  const timings = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    task();
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  return { medianMs: timings[Math.floor(samples / 2)], p95Ms: timings.at(-1) };
}
const plugin = twill({ root: process.cwd() });
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
  const options = { filename: 'benchmark.twill' };
  const mapped = transform(sugar, options);
  const uiSource = Array.from(
    { length: count },
    (_, i) => `export const view${i} = Card { Label { "child" }; if (true) "tail"; };`,
  ).join('\n');
  const stages = {
    transformTS: measure(() => transform(sugar, options)),
    transformJS: measure(() => transform(sugar, { filename: 'benchmark.twill', language: 'js' })),
    unchangedTS: measure(() => transform(plain, options)),
    pluginTS: measure(() => pluginTransform.call(context, sugar, 'benchmark.twill')),
    transformUI: measure(() => transform(uiSource, { filename: 'benchmark.twillx' })),
    pluginUI: measure(() => pluginTransform.call(context, uiSource, 'benchmark.twillx')),
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
  results.push({
    callbacks: count,
    bytes: Buffer.byteLength(sugar),
    uiViews: count,
    uiBytes: Buffer.byteLength(uiSource),
    stages,
  });
  console.log(JSON.stringify(results.at(-1)));
}
// Code identity after ordinary host minification is stronger evidence than a
// noisy runtime timing ratio. It proves there is no added helper or dispatch.
const input = 'export function run(values) { return values.map() { value in value * 2 }; }';
const expected =
  'export function run(values) { return values.map((value) => { return value * 2; }); }';
const emitted = await minify(transform(input, { filename: 'runtime.twill', language: 'js' }).code, {
  minify: true,
});
const reference = await minify(expected, { minify: true });
if (emitted.code !== reference.code) throw new Error('Runtime equivalence check failed');
// Component sugar uses only the same operations as handwritten native JSX.
for (const runtime of ['react', 'vue']) {
  const sugar = 'export function App() { return Card { "child"; "tail"; }; }';
  const native =
    runtime === 'vue'
      ? 'export function App() { return (<Card>{({default:()=>{const __twillChildren0=[];__twillChildren0.push("child");__twillChildren0.push("tail");return __twillChildren0;}})}</Card>); }'
      : 'export function App() { return (<Card>{(()=>{const __twillChildren0=[];__twillChildren0.push("child");__twillChildren0.push("tail");return __twillChildren0.length===1?__twillChildren0[0]:__twillChildren0;})()}</Card>); }';
  const emittedTS = transform(sugar, { filename: 'runtime.twillx', jsxImportSource: runtime }).code;
  const compile = async (source) =>
    minify(
      ts.transpileModule(source, {
        fileName: 'runtime.tsx',
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: runtime,
        },
      }).outputText,
      { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false },
    );
  assert.equal(
    (await compile(emittedTS)).code,
    (await compile(native)).code,
    `${runtime} component runtime must match equivalent native JSX`,
  );
}
// A native finally loop is the allocation-free reference for this workload.
// Defer deliberately adds registration closures and a lazy stack. Keep results
// observable and warm both functions; report overhead rather than hiding it.
const cleanupResults = [];
const iterations = 10000;
for (const registrations of [1, 10, 100]) {
  const source = `function run(state) {
    for (let i = 0; i < ${registrations}; i++) defer { state.cleanup += i + 1; }
    state.body++; return state.body;
  }`;
  const native = `function run(state) {
    try { state.body++; return state.body; }
    finally { for (let i = ${registrations} - 1; i >= 0; i--) state.cleanup += i + 1; }
  }`;
  const compiled = Function(
    transform(source, { filename: 'cleanup.twill', language: 'js' }).code + '; return run;',
  )();
  const handwritten = Function(native + '; return run;')();
  const batch = (run) => {
    const state = { body: 0, cleanup: 0 };
    let observed = 0;
    for (let i = 0; i < iterations; i++) observed ^= run(state);
    assert.equal(state.body, iterations);
    assert.equal(state.cleanup, (iterations * registrations * (registrations + 1)) / 2);
    return observed;
  };
  // More runtime warmup batches let the engine settle its optimization tiers;
  // the compiler stages above retain their original five-warmup methodology.
  const defer = measure(() => batch(compiled), 50);
  const nativeFinally = measure(() => batch(handwritten), 50);
  cleanupResults.push({
    kind: 'dynamic-loop',
    registrations,
    iterations,
    defer,
    nativeFinally,
    medianRatio: defer.medianMs / nativeFinally.medianMs,
  });
  console.log(JSON.stringify(cleanupResults.at(-1)));
}
// A single direct statement needs only a callback and native finally.
{
  const source = 'function run(state) { defer { state.cleanup += 1; } state.body++; return state.body; }';
  const output = transform(source, { filename: 'single.twill', language: 'js' }).code;
  const minimal = 'function run(state) { let cleanup; try { cleanup = () => { state.cleanup += 1; }; state.body++; return state.body; } finally { cleanup?.(); } }';
  assert.equal((await minify(output, { minify: true })).code, (await minify(minimal, { minify: true })).code);
  const compiled = Function(output + '; return run;')();
  const native = Function('return function run(state) { try { state.body++; return state.body; } finally { state.cleanup += 1; } };')();
  const batch = (run) => {
    const state = { body: 0, cleanup: 0 };
    let observed = 0;
    for (let index = 0; index < iterations; index++) observed ^= run(state);
    assert.equal(state.body, iterations);
    assert.equal(state.cleanup, iterations);
    return observed;
  };
  const defer = measure(() => batch(compiled), 50);
  const nativeFinally = measure(() => batch(native), 50);
  cleanupResults.push({
    kind: 'single-direct',
    registrations: 1,
    iterations,
    generatedBytes: Buffer.byteLength(output),
    matchesMinimalCallbackFinally: true,
    defer,
    nativeFinally,
    medianRatio: defer.medianMs / nativeFinally.medianMs,
  });
  console.log(JSON.stringify(cleanupResults.at(-1)));
}
const report = {
  timestamp: new Date().toISOString(),
  version: JSON.parse(readFileSync('packages/twill/package.json', 'utf8')).version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  buildDigest: createHash('sha256')
    .update(
      readdirSync('packages/twill/dist')
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => name + '\0' + readFileSync('packages/twill/dist/' + name, 'utf8'))
        .join('\0'),
    )
    .digest('hex'),
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  methodology: {
    samples,
    warmups: 5,
    cleanupWarmups: 50,
    sourceMaps: 'high-resolution with embedded source',
    includesStartup: false,
    ordinaryClosureRuntimeCodeIdentical: true,
    componentRuntimeCodeIdenticalToNativeJSX: ['react', 'vue'],
    cleanupReference:
      'Handwritten native finally loop; same observable additions, no registration closures or stack. Batch assertions included in both timings.',
  },
  results,
  cleanupResults,
};
console.log(JSON.stringify(report));
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const path = process.argv[outputIndex + 1];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
}
