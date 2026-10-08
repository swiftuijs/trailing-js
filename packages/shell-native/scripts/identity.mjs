import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const root = new URL('../', import.meta.url);
export const rustTargets = {
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'linux-x64-musl': 'x86_64-unknown-linux-musl',
  'linux-arm64-musl': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin',
  'darwin-arm64': 'aarch64-apple-darwin',
  'win32-x64': 'x86_64-pc-windows-msvc',
  'win32-arm64': 'aarch64-pc-windows-msvc',
};
export const targets = Object.keys(rustTargets);
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
