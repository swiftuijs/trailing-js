import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { root, targets, hash, sourceIdentity } from './identity.mjs';
const source = sourceIdentity();
const version = JSON.parse(readFileSync(new URL('package.json', root))).version;
const binaries = readdirSync(new URL('native/', root))
  .filter((name) => name.endsWith('.node'))
  .sort();
assert(binaries.length > 0, 'Build/download validated native binaries before packing');
if (process.argv.includes('--complete'))
  assert.deepEqual(
    binaries,
    targets.map((target) => `${target}.node`).sort(),
    'Release needs every supported platform',
  );
for (const name of binaries) {
  const target = name.slice(0, -5);
  assert(targets.includes(target), `Unsupported binary target: ${target}`);
  const metadata = JSON.parse(readFileSync(new URL(`native/${target}.json`, root)));
  const binary = readFileSync(new URL(`native/${name}`, root));
  assert.equal(metadata.protocol, 1);
  assert.equal(metadata.version, version);
  assert.equal(metadata.target, target);
  assert.equal(metadata.sourceSHA256, source, `Stale or mixed-source native build: ${target}`);
  assert.equal(metadata.sha256, hash(binary), `Native binary digest mismatch: ${target}`);
  assert.equal(metadata.bytes, binary.length);
  assert(binary.length <= 2 * 1024 * 1024, `${target} exceeds its 2 MiB native binary budget`);
  assert.match(metadata.rustc, /^rustc 1\.90\.0 /);
}
console.log(
  `Validated ${binaries.length} native binaries from the same pinned source; 2 MiB budget each.`,
);
