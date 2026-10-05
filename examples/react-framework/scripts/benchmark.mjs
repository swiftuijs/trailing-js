import { buildFramework } from './build.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cpus, platform, arch } from 'node:os';
import { gzipSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const metadata = JSON.parse(readFileSync(resolve(root, 'sources.json'), 'utf8'));
function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50Milliseconds: sorted[Math.floor(sorted.length / 2)],
    p95Milliseconds: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    samples,
  };
}
const builds = { native: [], twill: [] };
for (let sample = -3; sample < 15; sample++) {
  // Alternate order to reduce a fixed first-build/cache advantage.
  for (const variant of sample % 2 ? ['native', 'twill'] : ['twill', 'native']) {
    const result = await buildFramework(variant === 'twill', false, false);
    if (sample >= 0) builds[variant].push(result.milliseconds);
  }
}
const results = {};
for (const variant of ['native', 'twill']) {
  const runtime = JSON.parse(
    execFileSync(process.execPath, [resolve(root, 'scripts/runtime-worker.mjs'), variant], {
      encoding: 'utf8',
    }),
  );
  const code = readFileSync(resolve(root, `dist/${variant}-production/index.js`));
  results[variant] = {
    build: summarize(builds[variant]),
    runtime: {
      ...summarize(runtime.samples),
      checksum: runtime.checksum,
      maxRSSKiB: runtime.maxRSSKiB,
    },
    bytes: code.length,
    gzipBytes: gzipSync(code).length,
  };
}
const report = {
  scope: metadata.scope,
  upstreamCommit: metadata.commit,
  upstreamVersion: metadata.tag,
  modules: metadata.files.length,
  guards: metadata.files.reduce((sum, file) => sum + file.guards, 0),
  trailingCallbacks: metadata.files.reduce((sum, file) => sum + file.closures, 0),
  recordedAt: new Date().toISOString(),
  environment: { node: process.version, os: platform(), arch: arch(), cpu: cpus()[0]?.model },
  methodology:
    'Build: Vite production, 3 warmups and 15 interleaved samples, write=false; source preparation/process startup excluded. Runtime: one isolated process per variant, 10 warmup batches and 15 samples; 10,000 createElement/cloneElement/Children.toArray operations per batch. Same source graph, Flow erasure, feature flags, target and minifier; not the upstream official Rollup pipeline or a full renderer benchmark.',
  results,
};
const option = process.argv.indexOf('--output');
const destination =
  option >= 0
    ? resolve(process.cwd(), process.argv[option + 1])
    : resolve(root, 'dist/benchmark.json');
writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(results).map(([variant, value]) => [
        variant,
        {
          buildP50: value.build.p50Milliseconds,
          runtimeP50: value.runtime.p50Milliseconds,
          bytes: value.bytes,
          gzipBytes: value.gzipBytes,
        },
      ]),
    ),
    null,
    2,
  ),
);
