import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { bundleScopes, bundleHelper, emittedRuntime } from '../benchmarks/runtime-fixtures.mjs';
const results = [];
for (const scopes of [1, 10, 100]) {
  const inline = await bundleScopes(scopes, 'inline'),
    external = await bundleScopes(scopes, 'external');
  const size = (b) => ({
    bytes: Buffer.byteLength(b.code),
    gzipBytes: gzipSync(b.code, { level: 9 }).length,
  });
  const a = size(inline),
    b = size(external);
  assert.equal(
    external.inputs.filter((input) => /runtime\/dist\/helpers\/v1\.js$/.test(input)).length,
    1,
    'Import exactly one runtime helper across modules',
  );
  assert(
    !inline.inputs.some((input) => /runtime\/(src|dist)/.test(input)),
    'Inline bundles need no runtime',
  );
  assert(
    !external.inputs.some((input) =>
      /node_modules.*(typescript|acorn|unplugin)|twill\/dist/.test(input),
    ),
    'Runtime application graph must exclude compiler dependencies',
  );
  if (scopes === 1)
    assert(b.bytes <= a.bytes + 64, 'Single scope helper overhead exceeds 64 bytes');
  if (scopes === 100) {
    assert(b.bytes <= a.bytes * 0.8, 'Shared helper must remove repeated draining code');
    assert(b.gzipBytes <= a.gzipBytes * 1.1, 'Shared output gzip regression exceeds 10%');
  }
  results.push({ scopes, inline: a, external: b });
}
const helper = await bundleHelper(),
  bytes = helper.outputFiles[0].contents.length;
assert(bytes <= 256, 'Helper exceeds 256 minified bytes');
assert.equal(
  Object.keys(helper.metafile.inputs).filter((input) => !input.startsWith('<')).length,
  1,
  'Helper must have no dependencies',
);
for (const source of [
  'export const value=1;',
  'function run(){defer {release();}return 1;}',
  'async function run(){defer {await release();}defer {await release();}}',
])
  assert.equal(
    emittedRuntime(source, 'inline'),
    emittedRuntime(source, 'external'),
    'Unused/single/async emission must stay identical',
  );
export const runtimeReport = {
  scope:
    'Actual versioned runtime, minified ES2022 ESM, separate synthetic modules, gzip level 9, all helper bytes included',
  helperBytes: bytes,
  results,
};
