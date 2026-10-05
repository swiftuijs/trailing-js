import { transformSync } from '@babel/core';
import stripFlow from '@babel/plugin-transform-flow-strip-types';
import hermes from 'babel-plugin-syntax-hermes-parser';
import { parse } from '@babel/parser';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rewrite } from './rewrite.mjs';

export const root = resolve(import.meta.dirname, '..');
export const metadata = JSON.parse(readFileSync(resolve(root, 'upstream.json'), 'utf8'));
const upstream = process.argv.includes('--upstream')
  ? resolve(process.argv[process.argv.indexOf('--upstream') + 1])
  : resolve(root, 'upstream');
if (process.argv.includes('--upstream')) {
  if (
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim() !==
    metadata.commit
  )
    throw new Error('React upstream commit mismatch');
  execFileSync(
    'git',
    ['diff', '--quiet', 'HEAD', '--', 'packages/react', 'packages/shared', 'LICENSE'],
    { cwd: upstream },
  );
  mkdirSync(resolve(root, 'upstream'), { recursive: true });
  copyFileSync(resolve(upstream, 'LICENSE'), resolve(root, 'upstream/LICENSE'));
  copyFileSync(resolve(upstream, 'LICENSE'), resolve(root, 'LICENSE'));
}
if (!process.argv.includes('--upstream')) {
  const pinned = JSON.parse(readFileSync(resolve(root, 'sources.json'), 'utf8'));
  if (pinned.commit !== metadata.commit) throw new Error('React snapshot commit mismatch');
  for (const file of pinned.files) {
    const digest = createHash('sha256')
      .update(readFileSync(resolve(upstream, file.path)))
      .digest('hex');
    if (digest !== file.sha256) throw new Error(`Modified React upstream snapshot: ${file.path}`);
  }
}
export function resolveModule(specifier, importer) {
  let path;
  if (specifier === 'shared/ReactSharedInternals')
    path = 'packages/react/src/ReactSharedInternalsClient';
  else if (specifier.startsWith('.'))
    path = relative(upstream, resolve(dirname(resolve(upstream, importer)), specifier));
  else if (specifier.startsWith('shared/')) path = 'packages/' + specifier;
  else throw new Error(`Unsupported React runtime import: ${specifier} in ${importer}`);
  path = path.replaceAll('\\', '/');
  for (const candidate of [path + '.js', path + '/index.js'])
    if (existsSync(resolve(upstream, candidate))) return candidate;
  throw new Error(`Unresolved React import ${specifier} in ${importer}`);
}
const modules = new Map();
function visit(path) {
  if (modules.has(path)) return;
  const source = readFileSync(resolve(upstream, path), 'utf8');
  const code = transformSync(source, {
    filename: path,
    configFile: false,
    babelrc: false,
    plugins: [hermes, [stripFlow, { all: true, allowDeclareFields: true }]],
    comments: true,
  }).code;
  const converted = rewrite(code);
  const dependencies = parse(code, { sourceType: 'module' })
    .program.body.filter(
      (node) =>
        ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          node.type,
        ) && node.source,
    )
    .map((node) => [node.source.value, resolveModule(node.source.value, path)]);
  modules.set(path, {
    source,
    native: code,
    dialect: converted.code,
    dependencies,
    guards: converted.guards,
    closures: converted.closures,
  });
  dependencies.forEach(([, target]) => visit(target));
}
visit(metadata.entry);
visit(metadata.developmentEntry);
const files = [];
for (const [path, module] of modules) {
  for (const [directory, filename, content] of [
    ['upstream', path, module.source],
    ['dist/native-source', path, module.native],
    ['src', path.replace(/\.js$/, '.twill'), module.dialect],
  ]) {
    const destination = resolve(root, directory, filename);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  files.push({
    path,
    sha256: createHash('sha256').update(module.source).digest('hex'),
    dependencies: module.dependencies,
    guards: module.guards,
    closures: module.closures,
  });
}
writeFileSync(
  resolve(root, 'sources.json'),
  JSON.stringify({ ...metadata, files }, null, 2) + '\n',
);
console.log(
  `React ${metadata.tag}: ${files.length} modules, ${files.reduce((n, f) => n + f.guards, 0)} guards, ${files.reduce((n, f) => n + f.closures, 0)} trailing callbacks.`,
);
