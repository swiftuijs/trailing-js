import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const observer = root + '/packages/shell-native/benchmarks/observe.mjs';
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const orders = [
  ['native', 'sdk', 'rust'],
  ['rust', 'sdk', 'native'],
  ['sdk', 'rust', 'native'],
  ['native', 'rust', 'sdk'],
  ['rust', 'native', 'sdk'],
  ['sdk', 'native', 'rust'],
];
const result = {
  dateUTC: new Date().toISOString(),
  node: process.version,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  trackedDiff: execFileSync('git', ['diff', '--stat'], { cwd: root, encoding: 'utf8' }),
  observerSHA256: sha(observer),
  nativeMetadata: JSON.parse(readFileSync(root + '/packages/shell-native/native/linux-x64.json')),
  cpuMax: readFileSync('/sys/fs/cgroup/cpu.max', 'utf8'),
  pairs: [],
};
for (let sample = 0; sample < 12; sample++) {
  const pair = {
    sample,
    order: orders[sample % 6],
    affinityOrder: sample % 2 ? ['0-3', '0-4'] : ['0-4', '0-3'],
  };
  for (const affinity of pair.affinityOrder) {
    const row = { cpuBefore: readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8') };
    for (const mode of pair.order)
      row[mode] = JSON.parse(
        execFileSync(
          'taskset',
          ['-c', affinity, process.execPath, observer, mode, 'concurrency', '32'],
          { env: { ...process.env, UV_THREADPOOL_SIZE: '4' }, encoding: 'utf8' },
        ),
      );
    row.cpuAfter = readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8');
    pair[affinity] = row;
  }
  result.pairs.push(pair);
  writeFileSync(
    '/tmp/twill-native-concurrency-diagnostic.json',
    JSON.stringify(result, null, 2) + '\n',
  );
  console.log(
    sample,
    ...['0-4', '0-3'].map((affinity) => ({
      affinity,
      ratio: pair[affinity].rust.wallMs / pair[affinity].native.wallMs,
      timings: Object.fromEntries(
        orders[0].map((mode) => [mode, Math.round(pair[affinity][mode].wallMs)]),
      ),
    })),
  );
}
