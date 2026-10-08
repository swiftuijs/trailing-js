import { execFileSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';

if (process.platform !== 'linux') throw Error('The Rust experiment currently supports Linux only');
execFileSync('cargo', ['build', '--locked', '--release'], {
  cwd: import.meta.dirname,
  stdio: 'inherit',
});
copyFileSync(
  new URL('./target/release/libtwill_native_experiment.so', import.meta.url),
  new URL('./experiment.node', import.meta.url),
);
