import { copyFileSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
process.chdir(root);
const require = createRequire(import.meta.url);
const typescriptLib = dirname(require.resolve('typescript'));
mkdirSync('editors/vscode/dist/typescript-lib', { recursive: true });
for (const filename of readdirSync(typescriptLib))
  if (/^lib(?:\..+)?\.d\.ts$/.test(filename))
    copyFileSync(
      join(typescriptLib, filename),
      join('editors/vscode/dist/typescript-lib', filename),
    );
mkdirSync('editors/vscode/syntaxes', { recursive: true });
for (const [extension, language] of Object.entries({
  twill: 'ts',
  twillx: 'tsx',
})) {
  const grammar = {
    name: 'Twill ' + language,
    scopeName: 'source.twill.' + { twill: 'ts', twillx: 'tsx' }[extension],
    patterns: [
      { include: '#defer' },
      { include: '#guard' },
      // A real closure header has `in` before its first statement. The body
      // delegates strings, comments, templates, JSX and nested syntax to VS Code.
      { include: '#closure-header' },
      {
        match: '(?<=\\})\\s*\\b([A-Za-z_$][\\w$]*)(\\s*:)(?=\\s*\\{)',
        captures: {
          1: { name: 'entity.name.function.twill' },
          2: { name: 'punctuation.separator.twill' },
        },
      },
      { include: 'source.' + language },
    ],
    repository: {
      defer: {
        match: '\\bdefer\\b(?=(?:[^\\S\\r\\n]|/\\*[^\\r\\n]*?\\*/)*\\{)',
        name: 'keyword.control.twill',
      },
      guard: {
        match: '\\bguard\\b(?=\\s+(?:const\\b|[^\\s;=:.]))',
        name: 'keyword.control.twill',
      },
      'closure-header': {
        begin:
          '(\\{)(?=\\s*(?:async\\s+)?(?:[A-Za-z_$][\\w$]*(?:\\s*,\\s*[A-Za-z_$][\\w$]*)*|\\([^;{}]*\\))\\s+in\\b)',
        beginCaptures: { 1: { name: 'punctuation.section.block.begin.twill' } },
        end: '\\bin\\b',
        endCaptures: { 0: { name: 'keyword.control.twill' } },
        patterns: [{ include: 'source.' + language }],
      },
    },
  };
  // Reach custom syntax inside the base grammar's function/block regions.
  grammar.injections = {
    [`L:${grammar.scopeName} -comment -string`]: {
      patterns: [{ include: '#defer' }, { include: '#guard' }, { include: '#closure-header' }],
    },
  };
  writeFileSync(
    `editors/vscode/syntaxes/${extension}.tmLanguage.json`,
    JSON.stringify(grammar, null, 2) + '\n',
  );
}

rmSync('editors/vscode/licenses', { recursive: true, force: true });
mkdirSync('editors/vscode/licenses', { recursive: true });
copyFileSync('editors/vscode/dist/THIRD_PARTY_LICENSES.txt', 'editors/vscode/licenses/editor.txt');
copyFileSync(
  'editors/vscode/twill-typescript-plugin/dist/THIRD_PARTY_LICENSES.txt',
  'editors/vscode/licenses/tsserver.txt',
);
copyFileSync(
  'packages/twill/dist/typescript-plugin.LICENSE.txt',
  'editors/vscode/licenses/compiler-bridge.txt',
);
writeFileSync(
  'editors/vscode/THIRD_PARTY_NOTICES.md',
  '# Bundled dependencies\n\nVite generates the bundled dependency licenses. See `licenses/editor.txt`, `licenses/tsserver.txt` and `licenses/compiler-bridge.txt`. The shared pinned TypeScript engine includes its license and third-party notices under `node_modules/typescript`.\n',
);
copyFileSync('LICENSE', 'editors/vscode/LICENSE');
copyFileSync('LICENSE', 'editors/vscode/twill-typescript-plugin/LICENSE');
copyFileSync('packages/twill/schemas/twill.schema.json', 'editors/vscode/twill.schema.json');
