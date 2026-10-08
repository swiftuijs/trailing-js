import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root, sourceIdentity, hash, targets } from './identity.mjs';
const target = `${process.platform}-${process.arch}`;
if (!targets.includes(target)) throw Error(`Unsupported native build target: ${target}`);
execFileSync('cargo', ['build', '--locked', '--release'], {
  cwd: fileURLToPath(new URL('crate/', root)),
  stdio: 'inherit',
});
const library = {
  linux: 'libtwill_shell_native.so',
  darwin: 'libtwill_shell_native.dylib',
  win32: 'twill_shell_native.dll',
}[process.platform];
if (!library) throw Error(`Unsupported native build platform: ${process.platform}`);
mkdirSync(new URL('native/', root), { recursive: true });
const binary = readFileSync(new URL(`crate/target/release/${library}`, root));
const temporary = new URL(`native/${randomUUID()}.tmp`, root);
try {
  writeFileSync(temporary, binary, { flag: 'wx', mode: 0o644 });
  renameSync(temporary, new URL(`native/${target}.node`, root));
} finally {
  rmSync(temporary, { force: true });
}
writeFileSync(
  new URL(`native/${target}.json`, root),
  JSON.stringify(
    {
      protocol: 1,
      version: JSON.parse(readFileSync(new URL('package.json', root))).version,
      target,
      bytes: binary.length,
      sha256: hash(binary),
      sourceSHA256: sourceIdentity(),
      rustc: execFileSync('rustc', ['--version'], {
        cwd: new URL('crate/', root),
        encoding: 'utf8',
      }).trim(),
    },
    null,
    2,
  ) + '\n',
);
