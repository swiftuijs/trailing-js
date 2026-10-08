import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, release } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'twill-script-startup-'));
const samples = 21;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sha = (source) => createHash('sha256').update(source).digest('hex');
const cli = resolve(repository, 'packages/twill/bin/twill.mjs');
const cache = join(root, 'cache');
const native = join(root, 'native.mjs');
const script = join(root, 'script.twill');
const source =
  '#!/usr/bin/env twill\nconst values: number[] = [1,2].map { value in value * 2 };\nconsole.log(JSON.stringify({values,cpu:process.cpuUsage(),rss:process.resourceUsage().maxRSS}));\n';
const nativeSource =
  'const values = [1,2].map(value => value * 2);\nconsole.log(JSON.stringify({values,cpu:process.cpuUsage(),rss:process.resourceUsage().maxRSS}));\n';
const commands = {
  native: [native],
  uncached: [cli, script],
  miss: [cli, script],
  hit: [cli, script],
};
const measure = (name) => {
  if (name === 'miss') rmSync(cache, { recursive: true, force: true });
  const start = performance.now();
  const result = spawnSync(process.execPath, commands[name], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, TWILL_CACHE: name === 'uncached' ? '0' : '1', TWILL_CACHE_DIR: cache },
  });
  const wallMs = performance.now() - start;
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  assert.deepEqual(value.values, [2, 4]);
  return {
    wallMs,
    interpreterCpuMs: (value.cpu.user + value.cpu.system) / 1000,
    peakRssKiB: value.rss,
  };
};
try {
  writeFileSync(script, source);
  writeFileSync(native, nativeSource);
  for (const name of ['native', 'uncached', 'miss', 'hit']) measure(name);
  const pairs = [];
  for (let i = 0; i < samples; i++) {
    // Prime the hit once outside timing, then alternate ordering with isolated cold misses.
    const pair = {};
    if (i % 2 === 0)
      for (const name of ['native', 'uncached', 'miss', 'hit']) pair[name] = measure(name);
    else for (const name of ['hit', 'miss', 'uncached', 'native']) pair[name] = measure(name);
    pairs.push(pair);
  }
  const ratios = pairs.map(({ hit, uncached }) => hit.wallMs / uncached.wallMs);
  let seed = 35;
  const bootstrap = [];
  for (let i = 0; i < 10000; i++) {
    const draw = [];
    for (let j = 0; j < ratios.length; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      draw.push(ratios[seed % ratios.length]);
    }
    bootstrap.push(median(draw));
  }
  bootstrap.sort((a, b) => a - b);
  const identities = {};
  for (const folder of ['packages/twill/src', 'packages/twill/dist', 'packages/twill/bin']) {
    for (const file of readdirSync(resolve(repository, folder)).sort()) {
      if (/\.(?:ts|js|mjs)$/.test(file))
        identities[folder + '/' + file] = sha(readFileSync(resolve(repository, folder, file)));
    }
  }
  const result = {
    workload:
      'Fresh Node processes: tiny typed Twill callback vs equivalent native JS. No SDK or child commands. Hit entries persist between launches; miss cache removal is outside timing.',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      os: release(),
      cpu: cpus()[0]?.model,
    },
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim(),
    sourceSHA256: sha(source),
    nativeSourceSHA256: sha(nativeSource),
    identities,
    commands,
    samples,
    pairs,
    medians: Object.fromEntries(
      Object.keys(commands).map((name) => [
        name,
        {
          wallMs: median(pairs.map((p) => p[name].wallMs)),
          interpreterCpuMs: median(pairs.map((p) => p[name].interpreterCpuMs)),
          peakRssKiB: median(pairs.map((p) => p[name].peakRssKiB)),
        },
      ]),
    ),
    pairedHitUncachedMedianRatio: median(ratios),
    paired95PercentInterval: [bootstrap[250], bootstrap[9749]],
    pairedMissUncachedMedianRatio: median(pairs.map((p) => p.miss.wallMs / p.uncached.wallMs)),
    completedCacheBytes: readdirSync(cache).reduce(
      (total, file) => total + statSync(join(cache, file)).size,
      0,
    ),
    limitations:
      'All samples retained. Filesystem/OS caches are warm, interpreters are fresh. CPU is the entire interpreter including compiler/hook worker, not external commands. maxRSS is an OS observation, not a cap. This is one Linux/Node workload; hit improvement is not native startup parity or a Rust measurement.',
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
