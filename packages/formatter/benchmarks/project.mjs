import { TwillProject, virtualFilename } from '@swiftuijs/twill/project';
import { format } from '@swiftuijs/twill-formatter';
import { performance } from 'node:perf_hooks';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));

const child = process.argv.indexOf('--files');
if (child >= 0) {
  const count = Number(process.argv[child + 1]);
  const root = mkdtempSync(join(tmpdir(), 'twill-benchmark-'));
  let project;
  try {
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          types: [],
        },
        include: ['**/*'],
      }),
    );
    for (let index = 0; index < count; index++) {
      const extension = index % 3 === 0 ? '.ts' : '.twill';
      writeFileSync(
        join(root, `file${index}${extension}`),
        index % 3 === 0
          ? `export const value${index}: number[] = [1,2,3].map(n => n * 2);`
          : `export const value${index}: number[] = [1,2,3].map { n in n * 2 };`,
      );
    }
    const main = join(root, 'main.twill');
    const source =
      Array.from(
        { length: count },
        (_, i) => `import {value${i}} from './file${i}${i % 3 === 0 ? '.ts' : '.twill'}';`,
      ).join('\n') + '\nexport const answer = value1.map { n in n.toFixed(2) };';
    writeFileSync(main, source);
    const start = performance.now();
    project = new TwillProject(join(root, 'tsconfig.json'));
    assert.deepEqual(project.diagnostics(), []);
    const coldCheckMs = performance.now() - start;
    const measure = (task) => {
      const timings = [];
      for (let i = 0; i < 15; i++) {
        const start = performance.now();
        task(i);
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      return { p50Ms: timings[7], p95Ms: timings[14] };
    };
    const warmCheck = measure(() => assert.deepEqual(project.diagnostics(), []));
    const offset = source.indexOf('toFixed');
    const warmHover = measure(() =>
      assert(
        project.service.getQuickInfoAtPosition(
          virtualFilename(main),
          project.toGeneratedOffset(main, offset),
        ),
      ),
    );
    const changedHover = measure((i) => {
      project.update(main, source + `\n// edit ${i}`);
      assert(
        project.service.getQuickInfoAtPosition(
          virtualFilename(main),
          project.toGeneratedOffset(main, offset),
        ),
      );
    });
    const largeSource = Array.from(
      { length: 1000 },
      (_, i) => `export const value${i}=[1,2,3].map { n in n*2 };`,
    ).join('\n');
    const formatStart = performance.now();
    await format(largeSource, { filepath: 'large.twill' });
    const format1000ClosuresMs = performance.now() - formatStart;
    console.log(
      JSON.stringify({
        sourceFiles: count + 1,
        coldCheckMs,
        warmCheck,
        warmHover,
        changedHover,
        format1000ClosuresMs,
        peakRssMiB: process.resourceUsage().maxRSS / 1024,
      }),
    );
  } finally {
    project?.dispose();
    rmSync(root, { recursive: true, force: true });
  }
} else {
  const results = [100, 500, 1000].map((count) =>
    JSON.parse(
      execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--files', String(count)], {
        encoding: 'utf8',
      }),
    ),
  );
  const report = {
    timestamp: new Date().toISOString(),
    node: process.version,
    cpu: cpus()[0]?.model,
    methodology:
      'Isolated child process per size. 1/3 native TS, 2/3 Twill, one import fan-in. Cold virtual check includes TS libraries; 15 warm/edit samples. Synthetic workload, excludes VS Code UI, native bridge, bundler and application runtime. Formatter timing is a cold single sample.',
    results,
  };
  const at = process.argv.indexOf('--output');
  if (at >= 0) {
    const output = process.argv[at + 1];
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2));
}
