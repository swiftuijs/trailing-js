import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { hash, root, targets } from '../packages/shell-native/scripts/identity.mjs';
import '../packages/shell-native/scripts/verify-binaries.mjs';
const version = JSON.parse(readFileSync(new URL('package.json', root))).version;
const binaries = targets.map((target) =>
  JSON.parse(readFileSync(new URL(`native/${target}.json`, root))),
);
const filename = `swiftuijs-twill-shell-native-${version}.tgz`;
const bytes = statSync(filename).size;
assert(bytes <= 6 * 1024 * 1024, 'Native archive exceeds its separate 6 MiB compressed budget');
writeFileSync(
  'native-release-manifest.json',
  JSON.stringify(
    {
      version,
      hashAlgorithm: 'sha256',
      artifacts: [{ filename, bytes, sha256: hash(readFileSync(filename)) }],
      binaries,
    },
    null,
    2,
  ) + '\n',
);
console.log('Five validated native targets and separate archive budget verified.');
