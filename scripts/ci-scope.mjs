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

// Optimize only known unaffected paths. New build/dependency locations default
// to full verification until their owners explicitly classify them.
export function ciScope(paths, full = false) {
  if (full) return complete();
  const scope = { core: false, shell: false };
  for (const path of paths) {
    if (shared.has(path) || path.startsWith('.github/') || path.startsWith('scripts/'))
      return complete();
    if (
      path.endsWith('.md') ||
      path.startsWith('docs/') ||
      path.startsWith('skills/') ||
      path.startsWith('apps/docs/') ||
      /^packages\/[^/]+\/benchmarks\/results\/.*\.(json|txt|log)$/.test(path)
    )
      continue;
    scope.core = true;
    if (path.startsWith('packages/shell/')) {
      scope.shell = true;
    } else if (
      ordinaryPackages.some((name) => path.startsWith(`packages/${name}/`)) ||
      path.startsWith('editors/') ||
      path.startsWith('examples/')
    ) {
      if (/^packages\/(twill|export|runtime)\//.test(path)) scope.shell = true;
    } else {
      return complete();
    }
  }
  return scope;
}

export function eventScope({ eventName, eventPath, forceFull = false, cwd }) {
  if (forceFull || eventName !== 'pull_request')
    return { scope: complete(), reason: 'Full main/manual/scheduled/release verification' };
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
    return { scope: ciScope(paths), reason: `Complete PR diff: ${paths.length} changed paths` };
  } catch {
    return { scope: complete(), reason: 'Diff unavailable or invalid: full verification' };
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
      Object.entries(result.scope)
        .map(([name, enabled]) => `${name}=${enabled}\n`)
        .join(''),
    );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${result.reason}\n\n| Checks | Required |\n| --- | --- |\n${Object.entries(result.scope)
        .map(([name, enabled]) => `| ${name} | ${enabled} |`)
        .join('\n')}\n`,
    );
  console.log(JSON.stringify(result));
}
