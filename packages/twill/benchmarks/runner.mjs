import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, cpus, release } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'twill-runner-benchmark-'));
const samples = 15;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const hash = (file) =>
  createHash('sha256')
    .update(readFileSync(resolve(root, file)))
    .digest('hex');
try {
  const source =
    '#!/usr/bin/env twill\nconst values: number[] = [1,2].map { value in value * 2 };\n';
  const file = join(directory, 'script.twill');
  writeFileSync(file, source);
  const commands = {
    loader: [
      '--enable-source-maps',
      '--import',
      resolve(root, 'packages/twill/dist/register.js'),
      file,
    ],
    runner: [resolve(root, 'packages/twill/bin/twill.mjs'), file],
  };
  const measure = (args) => {
    const start = performance.now();
    execFileSync(process.execPath, args, { cwd: directory, stdio: 'ignore' });
    return performance.now() - start;
  };
  for (const args of Object.values(commands)) measure(args);
  const pairs = [];
  for (let i = 0; i < samples; i++) {
    const pair = {};
    for (const name of i % 2 === 0 ? ['loader', 'runner'] : ['runner', 'loader'])
      pair[name] = measure(commands[name]);
    pairs.push(pair);
  }
  const ratios = pairs.map(({ loader, runner }) => runner / loader);
  let seed = 34;
  const bootstrap = [];
  for (let i = 0; i < 10000; i++) {
    const sample = [];
    for (let j = 0; j < ratios.length; j++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      sample.push(ratios[seed % ratios.length]);
    }
    bootstrap.push(median(sample));
  }
  bootstrap.sort((a, b) => a - b);
  const identities = {};
  for (const path of [
    'packages/twill/bin/twill.mjs',
    'packages/twill/bin/run.mjs',
    'packages/twill/src/loader.ts',
    'packages/twill/dist/loader.js',
    'packages/twill/dist/register.js',
  ])
    identities[path] = hash(path);
  const result = {
    workload:
      'Fresh Node processes executing identical Twill source; existing loader vs direct twill binary, no subprocess SDK or command execution.',
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      os: release(),
      cpu: cpus()[0]?.model,
    },
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceSHA256: createHash('sha256').update(source).digest('hex'),
    identities,
    commands,
    samples,
    pairs,
    mediansMs: {
      loader: median(pairs.map((p) => p.loader)),
      runner: median(pairs.map((p) => p.runner)),
    },
    pairedMedianRatio: median(ratios),
    paired95PercentInterval: [bootstrap[250], bootstrap[9749]],
    limitations:
      'Includes OS launch and source compilation; a local cold-start observation, not native-Node parity or a general speedup. No samples removed. Source and built entry identities identify this worktree.',
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
