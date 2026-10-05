import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Registry, INITIAL } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

it('loads the shipped TextMate grammar and highlights the closure delimiter', async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammar = JSON.parse(
    readFileSync(new URL('../syntaxes/twill.tmLanguage.json', import.meta.url), 'utf8'),
  );
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
          token.scopes.includes('keyword.control.twill'),
      ),
    ).toBe(true);
    const memberLine = 'users.filter { .active }';
    expect(
      loaded!
        .tokenizeLine(memberLine, INITIAL)
        .tokens.some(
          (token) =>
            memberLine.slice(token.startIndex, token.endIndex) === 'active' &&
            token.scopes.includes('variable.other.property.twill'),
        ),
    ).toBe(true);
    const deferLine = 'function f() { defer /* cleanup */ { close(); } }';
    expect(
      loaded!
        .tokenizeLine(deferLine, INITIAL)
        .tokens.some(
          (token) =>
            deferLine.slice(token.startIndex, token.endIndex) === 'defer' &&
            token.scopes.includes('keyword.control.twill'),
        ),
    ).toBe(true);
    const guardLine = 'function f(value) { guard value != null else { return 0; } }';
    expect(
      loaded!
        .tokenizeLine(guardLine, INITIAL)
        .tokens.some(
          (token) =>
            guardLine.slice(token.startIndex, token.endIndex) === 'guard' &&
            token.scopes.includes('keyword.control.twill'),
        ),
    ).toBe(true);
  } finally {
    registry.dispose();
  }
});
