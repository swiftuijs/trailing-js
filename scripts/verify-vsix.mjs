import { readZip } from '@vscode/vsce/out/zip.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { probeTypeScriptPlugin } from './probe-typescript-plugin.mjs';

const root = mkdtempSync(join(tmpdir(), 'twill-vsix-'));
try {
  const files = await readZip('dist/twill.vsix', (name) =>
    /^extension\/(?:node_modules\/|dist\/typescript-lib\/|package\.json$)/.test(name),
  );
  assert(files.has('extension/node_modules/@swiftuijs/twill/index.cjs'));
  assert(files.has('extension/dist/typescript-lib/lib.es2022.full.d.ts'));
  for (const [name, contents] of files) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  await probeTypeScriptPlugin(join(root, 'extension'), '@swiftuijs/twill');
  console.log('Extracted VSIX passed native TS/JS editor checks with its packaged plugin.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
