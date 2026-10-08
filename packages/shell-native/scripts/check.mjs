import { execFileSync } from 'node:child_process';
const cwd = new URL('../crate/', import.meta.url);
for (const args of [
  ['fmt', '--check'],
  ['clippy', '--locked', '--release', '--', '-D', 'warnings'],
])
  execFileSync('cargo', args, { cwd, stdio: 'inherit' });
