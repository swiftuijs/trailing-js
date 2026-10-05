import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const manifest = (path) => JSON.parse(readFileSync(path, 'utf8'));
const version = manifest('package.json').version;
assert.match(version, /^\d+\.\d+\.\d+$/, 'Release versions must use a complete semver');
for (const path of [
  'packages/twill/package.json',
  'packages/formatter/package.json',
  'packages/linter/package.json',
  'editors/vscode/package.json',
  'editors/vscode/twill-typescript-plugin/package.json',
])
  assert.equal(manifest(path).version, version, `Version mismatch: ${path}`);
assert(
  readFileSync('CHANGELOG.md', 'utf8').includes(`\n## ${version}\n`),
  'Missing changelog entry',
);
if (process.env.RELEASE_TAG)
  assert.equal(process.env.RELEASE_TAG, `v${version}`, 'Tag must match package versions');
for (const path of [
  'package.json',
  'apps/docs/package.json',
  'editors/vscode/package.json',
  'editors/vscode/twill-typescript-plugin/package.json',
])
  assert.equal(manifest(path).private, true, `Internal workspace must be private: ${path}`);
for (const name of ['twill', 'formatter', 'linter']) {
  const pkg = manifest(`packages/${name}/package.json`);
  assert(!pkg.private && pkg.publishConfig.access === 'public', `Publication metadata: ${name}`);
  assert(pkg.repository.url.includes('swiftuijs/twill'), `Repository metadata: ${name}`);
  if (process.argv.includes('--artifacts')) {
    assert(
      existsSync(`swiftuijs-${name === 'twill' ? name : 'twill-' + name}-${version}.tgz`),
      `Missing ${name} archive`,
    );
    for (const entry of Object.values(pkg.exports))
      for (const path of typeof entry === 'string' ? [entry] : Object.values(entry))
        assert(existsSync(`packages/${name}/${path}`), `Missing public export: ${name}/${path}`);
  }
}
if (process.argv.includes('--artifacts'))
  assert(existsSync('dist/twill.vsix'), 'Missing editor artifact');
console.log(
  `Release ${version}: synchronized versions, changelog${process.argv.includes('--artifacts') ? ', artifacts and exports' : ''} verified.`,
);
