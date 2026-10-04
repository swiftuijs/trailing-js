import { expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Registry, INITIAL } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import { TrailingProject, virtualFilename } from '../src/project';

it('offers members while the user is typing an incomplete closure', () => {
  const root = mkdtempSync(join(tmpdir(), 'trailing-editor-'));
  const source = 'const values = [1].map() { value in value. }';
  const filename = join(root, 'main.tts');
  writeFileSync(filename, source);
  const project = new TrailingProject(
    join(root, 'tsconfig.json'),
    {},
    { inferred: true, recover: true },
  );
  try {
    project.update(filename, source);
    const offset = source.indexOf('value.') + 'value.'.length;
    const completions = project.service.getCompletionsAtPosition(
      virtualFilename(filename),
      project.toGeneratedOffset(filename, offset),
      {},
    );
    expect(completions?.entries.map((entry) => entry.name)).toContain('toFixed');
    expect(project.diagnostics(filename).some((item) => item.code === 90001)).toBe(true);
    project.update(filename, 'const values = [1].map() { value in value.toFixed(2)');
    const generated = project.transformed(filename)!;
    expect(generated.code).toContain('toFixed(2)');
  } finally {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});

it('loads the shipped TextMate grammar and highlights the closure delimiter', async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammar = JSON.parse(readFileSync('editors/vscode/syntaxes/tts.tmLanguage.json', 'utf8'));
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (text) => new OnigString(text),
    }),
    // Built-in TS scopes are resolved by VS Code. A minimal grammar isolates
    // this extension's closure rules and verifies its Oniguruma expressions.
    loadGrammar: async (scope) =>
      scope === grammar.scopeName ? grammar : { scopeName: scope, patterns: [] },
  });
  try {
    const loaded = await registry.loadGrammar(grammar.scopeName);
    const line = 'items.map() { (item: number) in item + 1 }';
    const tokens = loaded!.tokenizeLine(line, INITIAL).tokens;
    expect(
      tokens.some(
        (token) =>
          line.slice(token.startIndex, token.endIndex) === 'in' &&
          token.scopes.includes('keyword.control.trailing'),
      ),
    ).toBe(true);
  } finally {
    registry.dispose();
  }
});
