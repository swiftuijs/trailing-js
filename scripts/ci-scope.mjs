import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const complete = () => ({ core: true, shell: true });
const shared = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  '.npmrc',
]);
const ordinaryPackages = ['formatter', 'linter', 'highlight', 'runtime', 'export', 'twill'];

const essentialPlatforms = [
  { os: 'macos-15', arch: 'arm64' },
  { os: 'windows-latest', arch: 'x64' },
];
const additionalPlatforms = [
  { os: 'macos-15-intel', arch: 'x64' },
  { os: 'windows-11-arm', arch: 'arm64' },
  { os: 'ubuntu-24.04-arm', arch: 'arm64' },
];

function pathScope(path) {
  if (shared.has(path) || path.startsWith('.github/') || path.startsWith('scripts/')) return 'full';
  if (
    path.endsWith('.md') ||
    path.startsWith('docs/') ||
    path.startsWith('skills/') ||
    path.startsWith('apps/docs/') ||
    /^packages\/[^/]+\/benchmarks\/results\/.*\.(json|txt|log|cpuprofile)$/.test(path)
  )
    return 'docs';
  if (path.startsWith('packages/shell/')) return 'shell';
  if (
    ordinaryPackages.some((name) => path.startsWith(`packages/${name}/`)) ||
    path.startsWith('editors/') ||
    path.startsWith('examples/')
  )
    return /^packages\/(twill|export|runtime)\//.test(path) ? 'shell' : 'core';
  return 'full';
}

// Classify once: unknown/shared inputs retain full coverage; known shell/runner
// PRs keep all three OS families without repeating every CPU/libc combination.
export function ciSelection(paths, full = false) {
  const kinds = paths.map(pathScope);
  const extendedShell = full || kinds.includes('full');
  const scope = extendedShell
    ? complete()
    : {
        core: kinds.includes('core') || kinds.includes('shell'),
        shell: kinds.includes('shell'),
      };
  return {
    scope,
    extendedShell,
    shellPlatforms: {
      include: extendedShell ? [...essentialPlatforms, ...additionalPlatforms] : essentialPlatforms,
    },
  };
}
export function ciScope(paths, full = false) {
  return ciSelection(paths, full).scope;
}

export function eventScope({ eventName, eventPath, forceFull = false, cwd }) {
  if (forceFull || eventName !== 'pull_request')
    return { ...ciSelection([], true), reason: 'Full main/manual/scheduled/release verification' };
  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const base = event.pull_request?.base?.sha;
    if (!/^[a-f0-9]{40}$/.test(base ?? '')) throw new Error('Missing valid PR base SHA');
    // NUL separation preserves spaces/newlines. Disable rename detection so
    // moving native code into a docs directory still selects its old owner.
    const paths = execFileSync(
      'git',
      ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
      .split('\0')
      .filter(Boolean);
    return { ...ciSelection(paths), reason: `Complete PR diff: ${paths.length} changed paths` };
  } catch {
    return { ...ciSelection([], true), reason: 'Diff unavailable or invalid: full verification' };
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const result = eventScope({
    eventName: process.env.GITHUB_EVENT_NAME,
    eventPath: process.env.GITHUB_EVENT_PATH,
    forceFull: process.env.TWILL_CI_FULL === 'true',
    cwd: process.cwd(),
  });
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries({
        ...result.scope,
        'extended-shell': result.extendedShell,
        'shell-matrix': JSON.stringify(result.shellPlatforms),
      })
        .map(([name, enabled]) => `${name}=${enabled}\n`)
        .join(''),
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${result.reason}\n\n| Checks | Required |\n| --- | --- |\n${Object.entries(result.scope)
        .map(([name, enabled]) => `| ${name} | ${enabled} |`)
        .join(
          '\n',
        )}\n\nShell platforms: ${result.extendedShell ? 'full OS/CPU/libc matrix' : 'three OS families for affected code'}.\n`,
    );
  console.log(JSON.stringify(result));
}
