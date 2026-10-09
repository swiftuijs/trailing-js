// Compare two built distributions without sharing V8 call-site feedback.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transform as minify } from 'esbuild';

const here = fileURLToPath(import.meta.url);
const repository = resolve(dirname(here), '../../..');
const current = resolve(dirname(here), '../dist');
const samples = 15;
const callbacks = Array.from(
  { length: 1000 },
  (_, i) => `export const value${i}=[1,2,3].map { x in x*2 };`,
).join('\n');
const projectSource = callbacks.split('\n').slice(0, 500).join('\n');
const moduleSource = 'export const values:number[]=[1,2,3].map { n in n*2 };';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const option = (name) => process.argv[process.argv.indexOf(name) + 1];
const summary = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  return {
    samplesMs: values,
    medianMs: ordered[Math.floor(ordered.length / 2)],
    p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
  };
};
function measure(task, warmups = 5) {
  for (let i = 0; i < warmups; i++) task();
  const timings = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    task();
    timings.push(performance.now() - start);
  }
  return summary(timings);
}
function cleanupSource(count, dynamic = false) {
  const cleanups = dynamic
    ? `for(let i=0;i<${count};i++) defer { state.cleanup+=i+1; }`
    : Array.from({ length: count }, (_, i) => `defer { state.cleanup+=${i + 1}; }`).join('');
  return `function run(state) { ${cleanups} state.body++; return state.body; }`;
}
function nativeSource(count, dynamic = false) {
  let body = 'state.body++; return state.body;';
  if (dynamic) body = `try {${body}} finally {for(let i=${count}-1;i>=0;i--) state.cleanup+=i+1;}`;
  else
    for (let i = count - 1; i >= 0; i--) body = `try {${body}} finally {state.cleanup+=${i + 1};}`;
  return `function run(state) { ${body} }`;
}

if (process.argv.includes('--worker')) {
  const distribution = resolve(option('--dist'));
  const name = option('--case');
  const root = option('--root');
  const { transform } = await import(pathToFileURL(join(distribution, 'index.js')));
  let result;
  if (name === 'transform-1000') {
    const output = transform(callbacks, { filename: 'large.twill' });
    result = {
      ...measure(() => transform(callbacks, { filename: 'large.twill' })),
      sourceDigest: hash(callbacks),
      generatedDigest: hash(output.code),
    };
  } else if (name.startsWith('editor-')) {
    const { TwillProject } = await import(pathToFileURL(join(distribution, 'project.js')));
    const project = new TwillProject(join(root, 'tsconfig.json'), {}, { recover: true });
    const filename = join(root, 'large.twill');
    let revision = 0;
    result = {
      ...measure(() => {
        if (name === 'editor-edited-diagnostics-500')
          project.update(filename, projectSource + `\nexport const revision=${revision++};`);
        assert.deepEqual(project.diagnostics(filename), []);
      }),
      sourceDigest: hash(projectSource),
    };
    project.dispose();
  } else if (name === 'compile-100-modules') {
    const chunk = readdirSync(distribution).find((file) => /^loader-compiler-.*\.js$/.test(file));
    assert.ok(chunk, 'build the compiler before measuring');
    const { compileModule } = await import(pathToFileURL(join(distribution, chunk)));
    result = {
      ...measure(() => {
        for (let i = 0; i < 100; i++) {
          const emitted = compileModule(moduleSource, join(root, `module${i}.twill`), true);
          assert.ok(emitted.source.includes('sourceMappingURL=data:'));
        }
      }),
      sourceDigest: hash(moduleSource),
      includesStartup: false,
    };
  } else {
    const dynamic = name === 'defer-dynamic-100';
    const count = dynamic ? 100 : Number(name.at(-1));
    const source = cleanupSource(count, dynamic);
    const code =
      option('--variant') === 'native'
        ? nativeSource(count, dynamic)
        : transform(source, { language: 'js' }).code;
    const generated = await minify(code, { minify: true, minifyIdentifiers: false });
    const native = await minify(nativeSource(count, dynamic), {
      minify: true,
      minifyIdentifiers: false,
    });
    const run = Function(code + '; return run;')();
    const iterations = dynamic ? 10000 : 100000;
    function batch() {
      const state = { body: 0, cleanup: 0 };
      for (let i = 0; i < iterations; i++) run(state);
      assert.deepEqual(state, {
        body: iterations,
        cleanup: (iterations * count * (count + 1)) / 2,
      });
    }
    result = {
      ...measure(batch, 50),
      iterations,
      sourceDigest: hash(source),
      generatedCode: code,
      minifiedBytes: Buffer.byteLength(generated.code),
      nativeMinifiedBytes: Buffer.byteLength(native.code),
      matchesNativeCode: generated.code === native.code,
    };
  }
  console.log(JSON.stringify(result));
  process.exit(0);
}

assert.ok(process.argv.includes('--baseline'), 'pass --baseline /absolute/path/to/unchanged/dist');
const baseline = resolve(option('--baseline'));
const root = mkdtempSync(join(tmpdir(), 'twill-refinement-'));
const results = [];
try {
  writeFileSync(
    join(root, 'base.json'),
    '{"compilerOptions":{"strict":true,"target":"ES2022","module":"ESNext","moduleResolution":"Bundler"}}',
  );
  writeFileSync(join(root, 'tsconfig.json'), '{"extends":"./base.json","include":["*.twill"]}');
  writeFileSync(join(root, 'large.twill'), projectSource);
  for (let i = 0; i < 100; i++) writeFileSync(join(root, `module${i}.twill`), moduleSource);
  for (const name of [
    'transform-1000',
    'editor-diagnostics-500',
    'editor-edited-diagnostics-500',
    'compile-100-modules',
    'defer-direct-1',
    'defer-direct-4',
    'defer-dynamic-100',
  ]) {
    const pairs = [];
    for (let round = 0; round < 3; round++) {
      const pair = {};
      const order = round % 2 ? ['current', 'baseline'] : ['baseline', 'current'];
      if (name.startsWith('defer-')) order.splice(round % 2 ? 0 : 2, 0, 'native');
      for (const variant of order)
        pair[variant] = JSON.parse(
          execFileSync(
            process.execPath,
            [
              here,
              '--worker',
              '--case',
              name,
              '--dist',
              variant === 'baseline' ? baseline : current,
              '--root',
              root,
              '--variant',
              variant,
            ],
            { encoding: 'utf8' },
          ),
        );
      assert.equal(pair.baseline.sourceDigest, pair.current.sourceDigest);
      if (name === 'transform-1000')
        assert.equal(pair.baseline.generatedDigest, pair.current.generatedDigest);
      if (name.startsWith('defer-direct')) assert.equal(pair.current.matchesNativeCode, true);
      pairs.push({ order, ...pair });
    }
    const ratio = summary(
      pairs.map((pair) => pair.current.medianMs / pair.baseline.medianMs),
    ).medianMs;
    results.push({ name, currentToBaselineRatio: ratio, pairs });
    console.log(JSON.stringify({ name, currentToBaselineRatio: ratio }));
  }
  // Full cold processes execute the same module graph, with caching disabled
  // through the register entry. No internal phase timer substitutes for startup.
  const entry = join(root, 'entry.twill');
  writeFileSync(
    entry,
    Array.from(
      { length: 100 },
      (_, i) => `import {values as v${i}} from './module${i}.twill';`,
    ).join('\n') +
      '\nconsole.log(' +
      Array.from({ length: 100 }, (_, i) => `v${i}[2]`).join('+') +
      ');',
  );
  const cold = [];
  for (let round = 0; round < 9; round++) {
    const pair = { order: round % 2 ? ['current', 'baseline'] : ['baseline', 'current'] };
    for (const variant of pair.order) {
      const dist = variant === 'baseline' ? baseline : current;
      const start = performance.now();
      assert.equal(
        execFileSync(
          process.execPath,
          ['--import', pathToFileURL(join(dist, 'register.js')).href, entry],
          { encoding: 'utf8' },
        ).trim(),
        '600',
      );
      pair[variant] = performance.now() - start;
    }
    cold.push(pair);
  }
  results.push({
    name: 'cold-script-100-imports',
    pairs: cold,
    currentToBaselineRatio: summary(cold.map((pair) => pair.current / pair.baseline)).medianMs,
  });
  const identity = (dist) => ({
    directory: dist,
    buildDigest: hash(
      readdirSync(dist)
        .filter((file) => /\.(?:js|cjs)$/.test(file))
        .sort()
        .map((file) => file + '\0' + readFileSync(join(dist, file), 'utf8'))
        .join('\0'),
    ),
  });
  const report = {
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model,
    },
    currentCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim(),
    currentDiffDigest: hash(execFileSync('git', ['diff', 'HEAD'], { cwd: repository })),
    baseline: identity(baseline),
    current: identity(current),
    methodology: {
      samples,
      warmups: 5,
      cleanupWarmups: 50,
      pairedWorkers: 3,
      alternatingOrder: true,
      sourceMaps: 'high-resolution with embedded source',
      coldProcessPairs: 9,
      scope: 'shared-host synthetic fixtures; not universal speedups',
    },
    results,
  };
  if (process.argv.includes('--output')) {
    const filename = resolve(option('--output'));
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, JSON.stringify(report, null, 2) + '\n');
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
