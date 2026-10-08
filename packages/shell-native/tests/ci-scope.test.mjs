import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ciScope, eventScope } from '../scripts/ci-scope.mjs';

const all = { core: true, native: true, shell: true, experiment: true };
const docs = { core: false, native: false, shell: false, experiment: false };

test('prose/site/skill/evidence PRs keep documentation checks without unrelated native jobs', () => {
  assert.deepEqual(
    ciScope([
      'AGENTS.md',
      'README.md',
      'packages/shell-native/README.md',
      'docs/scripting.md',
      'skills/twill/SKILL.md',
      'apps/docs/.vitepress/theme/Logo.vue',
      'packages/shell-native/benchmarks/results/platform.json',
      'packages/shell-native/benchmarks/results/exact-source.mjs.txt',
    ]),
    docs,
  );
});
test('compiler/runner/export/runtime changes retain core and Windows/macOS runner verification', () => {
  for (const path of [
    'packages/twill/src/compiler.ts',
    'packages/twill/bin/run.mjs',
    'packages/export/tests/export.test.ts',
    'packages/runtime/src/index.ts',
  ])
    assert.deepEqual(ciScope([path]), {
      core: true,
      native: false,
      shell: true,
      experiment: false,
    });
});
test('native sources, ABI selection, tests, toolchains and shared shell contracts select all targets', () => {
  for (const path of [
    'packages/shell-native/crate/src/platform.rs',
    'packages/shell-native/src/platform.ts',
    'packages/shell-native/crate/Cargo.lock',
    'packages/shell-native/ci/Dockerfile.musl',
    'packages/shell-native/tests/consumer.mjs',
    'packages/shell/tests/contract.ts',
  ]) {
    const scope = ciScope([path]);
    assert.equal(scope.core, true);
    assert.equal(scope.native, true);
    assert.equal(scope.shell, true);
  }
});
test('historical experiment changes do not invalidate the production native matrix', () => {
  assert.deepEqual(ciScope(['packages/shell/experiments/rust-native/src/lib.rs']), {
    core: true,
    native: false,
    shell: false,
    experiment: true,
  });
});
test('mixed paths union their affected checks; tooling/editor/example code keeps core verification', () => {
  for (const path of [
    'packages/highlight/src/index.ts',
    'packages/formatter/src/index.ts',
    'editors/vscode/src/extension.ts',
    'examples/react/src/App.twillx',
  ])
    assert.deepEqual(ciScope(['docs/ai.md', path]), {
      core: true,
      native: false,
      shell: false,
      experiment: false,
    });
  assert.deepEqual(ciScope(['docs/ai.md', 'packages/shell/src/index.ts']), all);
});
test('dependency/build/workflow and unknown paths never fall through to a reduced run', () => {
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    '.npmrc',
    '.github/workflows/ci.yml',
    'scripts/verify-release.mjs',
    'new-package/build.js',
    'LICENSE',
  ])
    assert.deepEqual(ciScope([path]), all);
});
test('non-PR and forced release events always select the full matrix without consulting a diff', () => {
  for (const eventName of ['push', 'schedule', 'workflow_dispatch', 'workflow_call', undefined])
    assert.deepEqual(eventScope({ eventName, eventPath: '/not-present' }).scope, all);
  assert.deepEqual(eventScope({ eventName: 'pull_request', forceFull: true }).scope, all);
});
test('missing/malformed events or unavailable base history fail conservatively', () => {
  assert.deepEqual(eventScope({ eventName: 'pull_request', eventPath: '/not-present' }).scope, all);
});
test('actual PR CLI writes reduced outputs for docs, and includes every commit in its diff', () => {
  const folder = mkdtempSync(join(tmpdir(), 'twill-ci-docs-'));
  const cwd = join(folder, 'repo');
  mkdirSync(cwd);
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => {
    git('add', '.');
    git(
      '-c',
      'user.name=Twill CI',
      '-c',
      'user.email=ci@example.invalid',
      'commit',
      '-m',
      'fixture',
    );
    return git('rev-parse', 'HEAD');
  };
  const eventPath = join(folder, 'event.json');
  const output = join(folder, 'outputs');
  try {
    git('init', '--quiet');
    writeFileSync(join(cwd, 'README.md'), '# base\n');
    const base = commit();
    writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: base } } }));
    writeFileSync(join(cwd, 'README.md'), '# changed docs\n');
    commit();
    const result = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('../scripts/ci-scope.mjs', import.meta.url))],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: join(folder, 'summary'),
          TWILL_CI_FULL: 'false',
        },
      },
    );
    assert.deepEqual(JSON.parse(result).scope, docs);
    assert.equal(
      readFileSync(output, 'utf8'),
      'core=false\nnative=false\nshell=false\nexperiment=false\n',
    );
    mkdirSync(join(cwd, 'packages/shell-native/src'), { recursive: true });
    writeFileSync(join(cwd, 'packages/shell-native/src/platform.ts'), 'changed ABI\n');
    commit();
    writeFileSync(join(cwd, 'README.md'), '# latest commit only changes docs\n');
    commit();
    assert.equal(eventScope({ eventName: 'pull_request', eventPath, cwd }).scope.native, true);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test('real git diffs preserve deleted/renamed native owners and filenames with newlines', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'twill-ci-scope-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => {
    git('add', '.');
    git(
      '-c',
      'user.name=Twill CI',
      '-c',
      'user.email=ci@example.invalid',
      'commit',
      '-m',
      'fixture',
    );
    return git('rev-parse', 'HEAD');
  };
  const eventPath = join(cwd, 'event.json');
  const select = (base) => {
    writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: base } } }));
    return eventScope({ eventName: 'pull_request', eventPath, cwd }).scope;
  };
  try {
    git('init', '--quiet');
    mkdirSync(join(cwd, 'packages/shell-native/crate/src'), { recursive: true });
    writeFileSync(join(cwd, 'packages/shell-native/crate/src/platform.rs'), 'owned native code\n');
    const base = commit();
    mkdirSync(join(cwd, 'docs'));
    renameSync(
      join(cwd, 'packages/shell-native/crate/src/platform.rs'),
      join(cwd, 'docs/moved.rs'),
    );
    writeFileSync(join(cwd, 'docs/spaces and\nnewlines.md'), '# docs\n');
    commit();
    assert.equal(select(base).native, true);
    assert.deepEqual(select('f'.repeat(40)), all);
    writeFileSync(eventPath, '{invalid');
    assert.deepEqual(eventScope({ eventName: 'pull_request', eventPath, cwd }).scope, all);
    writeFileSync(eventPath, JSON.stringify({ pull_request: { base: { sha: '--not-a-sha' } } }));
    assert.deepEqual(eventScope({ eventName: 'pull_request', eventPath, cwd }).scope, all);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
