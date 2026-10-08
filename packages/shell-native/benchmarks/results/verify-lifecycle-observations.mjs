import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = resolve(import.meta.dirname, '..');
const [input, output] = process.argv.slice(2);
assert(input && output, 'Expected complete input report and output path');
const bytes = readFileSync(input);
const report = JSON.parse(bytes);
const sha = (value) => createHash('sha256').update(value).digest('hex');
for (const [name, digest] of Object.entries(report.sourceAndBuildSHA256)) {
  if (name === 'observe.mjs') continue;
  assert.equal(
    sha(readFileSync(resolve(directory, name))),
    digest,
    'Measured build changed: ' + name,
  );
}
assert.equal(process.version, report.node);
assert.equal(
  readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim(),
  report.cpuConstraints.cgroupV2Quota,
);
assert.equal(
  readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(.*)$/m)?.[1],
  report.cpuConstraints.allowedCPUList,
);
const observer = resolve(directory, 'observe.mjs');
report.lifecycleReview = {
  startedUTC: new Date().toISOString(),
  baseReportSHA256: sha(bytes),
  scriptSHA256: sha(readFileSync(fileURLToPath(import.meta.url))),
  observerSHA256: sha(readFileSync(observer)),
  scope:
    'Repeat only five filesystem-contention and five cancellation pairs after making PID markers atomic and rejecting nonpositive identifiers before cleanup. All warm, memory, concurrency and cold observations remain unchanged. Original lifecycle observations remain in the retained base report. The original interrupted checkpoint already contains both complete 48-pair default-pool concurrency rows and the expanded-pool diagnostic; the continuation reason incorrectly described 128-child concurrency as incomplete.',
};
report.contention = [];
report.cancellation = [];
for (let sample = 0; sample < 5; sample++) {
  const pair = { order: report.orderPermutations[sample % 6] };
  for (const mode of pair.order)
    pair[mode] = JSON.parse(
      execFileSync(process.execPath, [observer, mode, 'contention'], {
        encoding: 'utf8',
        env: { ...process.env, UV_THREADPOOL_SIZE: '1' },
      }),
    );
  report.contention.push(pair);
  const cancelPair = { order: sample % 2 ? ['rust', 'sdk'] : ['sdk', 'rust'] };
  for (const mode of cancelPair.order)
    cancelPair[mode] = JSON.parse(
      execFileSync(process.execPath, [observer, mode, 'cancellation'], {
        encoding: 'utf8',
      }),
    );
  report.cancellation.push(cancelPair);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
report.lifecycleReview.completedUTC = new Date().toISOString();
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
for (const row of [...report.results, ...report.concurrency.filter((row) => row.poolSize === '4')])
  assert(
    row.rustVersusNative.wall.medianRatio <= 1.1 &&
      row.rustVersusNative.wall.ratio95PercentInterval.upper <= 1.1,
  );
console.log('All unchanged parity gates pass; atomic-marker lifecycle observations completed');
