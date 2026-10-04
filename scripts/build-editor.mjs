import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('editors/vscode/dist', { recursive: true });
mkdirSync('editors/vscode/syntaxes', { recursive: true });
for (const [extension, language] of Object.entries({
  tts: 'ts',
  tjs: 'js',
  ttsx: 'tsx',
  tjsx: 'js.jsx',
})) {
  const grammar = {
    name: 'Trailing ' + language,
    scopeName: 'source.trailing.' + { tts: 'ts', tjs: 'js', ttsx: 'tsx', tjsx: 'jsx' }[extension],
    patterns: [
      { include: '#guard' },
      // A real closure header has `in` before its first statement. The body
      // delegates strings, comments, templates, JSX and nested syntax to VS Code.
      { include: '#closure-header' },
      {
        match: '(?<=\\})\\s*\\b([A-Za-z_$][\\w$]*)(\\s*:)(?=\\s*\\{)',
        captures: {
          1: { name: 'entity.name.function.trailing' },
          2: { name: 'punctuation.separator.trailing' },
        },
      },
      { include: 'source.' + language },
    ],
    repository: {
      guard: {
        match: '\\bguard\\b(?=\\s+(?:const\\b|[^\\s;=:.]))',
        name: 'keyword.control.trailing',
      },
      'closure-header': {
        begin:
          '(\\{)(?=\\s*(?:async\\s+)?(?:[A-Za-z_$][\\w$]*(?:\\s*,\\s*[A-Za-z_$][\\w$]*)*|\\([^;{}]*\\))\\s+in\\b)',
        beginCaptures: { 1: { name: 'punctuation.section.block.begin.trailing' } },
        end: '\\bin\\b',
        endCaptures: { 0: { name: 'keyword.control.trailing' } },
        patterns: [{ include: 'source.' + language }],
      },
    },
  };
  // Reach custom syntax inside the base grammar's function/block regions.
  grammar.injections = {
    [`L:${grammar.scopeName} -comment -string`]: {
      patterns: [{ include: '#guard' }, { include: '#closure-header' }],
    },
  };
  writeFileSync(
    `editors/vscode/syntaxes/${extension}.tmLanguage.json`,
    JSON.stringify(grammar, null, 2) + '\n',
  );
}
const result = await build({
  entryPoints: ['editors/vscode/src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'editors/vscode/dist/extension.cjs',
  external: ['vscode'],
  minify: true,
  metafile: true,
});
// The standalone extension bundles dependencies, so ship their actual license
// and NOTICE files with it rather than relying on npm's node_modules layout.
const packages = new Set(
  Object.keys(result.metafile.inputs)
    .map((path) => path.match(/node_modules\/(\@[^/]+\/[^/]+|[^/]+)/)?.[1])
    .filter(Boolean),
);
rmSync('editors/vscode/licenses', { recursive: true, force: true });
let notices = '# Bundled dependencies\n\n';
for (const name of [...packages].sort()) {
  const root = join('node_modules', name);
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const folder = join('editors/vscode/licenses', name.replaceAll('/', '__'));
  mkdirSync(folder, { recursive: true });
  const licenses = readdirSync(root).filter((file) =>
    /^(?:licen[cs]e|notice|copyright)(?:\.|$)/i.test(file),
  );
  for (const file of licenses) copyFileSync(join(root, file), join(folder, file));
  notices += `- ${name}@${metadata.version}: ${metadata.license ?? 'See bundled license files'}\n`;
}
writeFileSync('editors/vscode/THIRD_PARTY_NOTICES.md', notices);
copyFileSync('LICENSE', 'editors/vscode/LICENSE');
copyFileSync('schemas/trailing.schema.json', 'editors/vscode/trailing.schema.json');
