import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const root = new URL('../', import.meta.url);
export const targets = ['linux-x64', 'linux-arm64', 'darwin-x64', 'darwin-arm64', 'win32-x64'];
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function sourceIdentity() {
  const identity = createHash('sha256');
  for (const file of [
    'Cargo.toml',
    'Cargo.lock',
    'rust-toolchain.toml',
    'build.rs',
    'src/lib.rs',
    'src/process.rs',
    'src/platform.rs',
  ])
    identity.update(JSON.stringify([file, hash(readFileSync(new URL(`crate/${file}`, root)))]));
  return identity.digest('hex');
}
