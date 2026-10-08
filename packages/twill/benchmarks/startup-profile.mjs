import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, release } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'twill-startup-profile-'));
const loader = process.env.TWILL_PROFILE_LOADER ?? resolve(root, 'packages/twill/dist/loader.js');
try {
  const script = join(directory, 'script.twill');
  const wrapper = join(directory, 'profile-loader.mjs');
  const launch = join(directory, 'launch.mjs');
  const report = join(directory, 'phases.json');
  const source =
    'const values: number[] = [1,2].map { value in value*2 };console.log(JSON.stringify(values));';
  writeFileSync(script, source);
  // This instrumented hook measures loader import vs source load. It adds its own
  // overhead and is diagnostic only; the ordinary binary supplies timing evidence.
  writeFileSync(
    wrapper,
    `import {performance} from 'node:perf_hooks';import {writeFileSync} from 'node:fs';
let hooks;let phases;
export async function initialize(data){const start=performance.now();hooks=await import(${JSON.stringify(pathToFileURL(loader).href)});hooks.initialize(data);phases={loaderImportMs:performance.now()-start,loads:[]};}
export async function resolve(...args){return hooks.resolve(...args);}
export async function load(...args){const start=performance.now();const result=await hooks.load(...args);phases.loads.push({url:args[0],ms:performance.now()-start});writeFileSync(${JSON.stringify(report)},JSON.stringify(phases));return result;}`,
  );
  writeFileSync(
    launch,
    `import {register} from 'node:module';register(${JSON.stringify(pathToFileURL(wrapper).href)},import.meta.url,{data:{cache:process.env.TWILL_CACHE!=='0'}});await import(${JSON.stringify(pathToFileURL(script).href)});`,
  );
  const pairs = [];
  for (let i = 0; i < 5; i++) {
    const pair = {};
    for (const name of ['uncached', 'miss', 'hit']) {
      const cache = join(directory, 'cache');
      if (name === 'miss') rmSync(cache, { recursive: true, force: true });
      const output = execFileSync(process.execPath, [launch], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TWILL_CACHE: name === 'uncached' ? '0' : '1',
          TWILL_CACHE_DIR: cache,
        },
      });
      assert.deepEqual(JSON.parse(output), [2, 4]);
      pair[name] = JSON.parse(readFileSync(report, 'utf8'));
    }
    pairs.push(pair);
  }
  console.log(
    JSON.stringify(
      {
        workload:
          'Instrumented loader hook: dynamic loader import and per-module load, no SDK or subprocess. Five fresh interpreter observations per mode; all retained.',
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          os: release(),
          cpu: cpus()[0]?.model,
        },
        gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
        sourceSHA256: createHash('sha256').update(source).digest('hex'),
        loaderPath: loader,
        loaderSHA256: createHash('sha256').update(readFileSync(loader)).digest('hex'),
        pairs,
        limitations:
          'Instrumentation changes startup and excludes interpreter/hook-worker initialization. Use script-startup.mjs for ordinary binary wall time. On the original eager loader, compiler imports belong to loaderImportMs; on the lazy loader they belong to a miss load.',
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
