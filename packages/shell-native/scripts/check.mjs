import { execFileSync } from 'node:child_process';
import { rustTargets } from './identity.mjs';
import { nativeTarget } from '../dist/platform.js';
const env = { ...process.env };
if (nativeTarget().endsWith('-musl'))
  env.RUSTFLAGS = `${env.RUSTFLAGS ?? ''} -C target-feature=-crt-static`;
const cwd = new URL('../crate/', import.meta.url);
for (const args of [
  ['fmt', '--check'],
  [
    'clippy',
    '--locked',
    '--release',
    '--target',
    rustTargets[nativeTarget()],
    '--',
    '-D',
    'warnings',
  ],
])
  execFileSync('cargo', args, { cwd, env, stdio: 'inherit' });
