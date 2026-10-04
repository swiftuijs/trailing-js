import { readVsix } from './read-vsix.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { probeTypeScriptPlugin } from './probe-typescript-plugin.mjs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));

const root = mkdtempSync(join(tmpdir(), 'twill-vsix-'));
try {
  const files = await readVsix('dist/twill.vsix', (name) =>
    /^extension\/(?:node_modules\/|dist\/typescript-lib\/|syntaxes\/|package\.json$)/.test(name),
  );
  const manifest = JSON.parse(files.get('extension/package.json').toString());
  for (const grammar of manifest.contributes.grammars)
    assert(
      files.has('extension/' + grammar.path.replace(/^\.\//, '')),
      `Missing grammar ${grammar.path}`,
    );
  assert(files.has('extension/node_modules/@swiftuijs/twill-vscode-tsserver/dist/index.cjs'));
  assert(files.has('extension/dist/typescript-lib/lib.es2022.full.d.ts'));
  for (const [name, contents] of files) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  await probeTypeScriptPlugin(join(root, 'extension'), '@swiftuijs/twill-vscode-tsserver');
  console.log('Extracted VSIX passed native TS/JS editor checks with its packaged plugin.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
