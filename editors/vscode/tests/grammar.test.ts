import { beforeAll, afterAll, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Registry, INITIAL, type IGrammar } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';
import typescript from '@shikijs/langs/typescript';
import tsx from '@shikijs/langs/tsx';

let registry: Registry;
const grammars: IGrammar[] = [];
beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const dialect = ['twill', 'twillx'].map((name) =>
    JSON.parse(
      readFileSync(new URL(`../syntaxes/${name}.tmLanguage.json`, import.meta.url), 'utf8'),
    ),
  );
  const all = [...dialect, ...typescript, ...tsx];
  registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: async (scope) =>
      (all.find((grammar) => grammar.scopeName === scope) as any) ?? null,
  });
  for (const grammar of dialect) grammars.push((await registry.loadGrammar(grammar.scopeName))!);
});
afterAll(() => registry.dispose());
function tokens(grammar: IGrammar, source: string) {
  let state = INITIAL;
  return source.split('\n').flatMap((line) => {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    return result.tokens.map((token) => ({
      text: line.slice(token.startIndex, token.endIndex),
      scopes: token.scopes,
    }));
  });
}
const has = (source: string, text: string, scope: string) => {
  for (const grammar of grammars)
    expect(
      tokens(grammar, source).some((token) => token.text === text && token.scopes.includes(scope)),
      (grammar === grammars[0] ? 'Twill' : 'TwillX') + ': ' + source,
    ).toBe(true);
};
it('highlights associated enum cases while preserving native payload types', () => {
  const source = 'enum State<T> {\ncase idle;\ncase loaded(value:T, count:number);\n}';
  has(source, 'case', 'keyword.control.twill');
  has(source, 'loaded', 'entity.name.function.twill');
  has('enum State{case 加载(value:number);}', '加载', 'entity.name.function.twill');
  has(
    'enum State{case /* payload */ loaded(value:number);}',
    'loaded',
    'entity.name.function.twill',
  );
  for (const grammar of grammars)
    expect(
      tokens(grammar, source).some(
        (token) =>
          token.text === 'number' &&
          token.scopes.some((s) => s.startsWith('support.type.primitive.')),
      ),
    ).toBe(true);
});
it.each([
  ['function f() { if const value = lookup() { use(value); } }', 'if'],
  ['function f() { if /* boundary */ const { value } = lookup() { use(value); } }', 'if'],
  ['items.map { value in value + 1 }', 'in'],
  ['items.map { (value: number) in value + 1 }', 'in'],
  ['items.map { async (value: number): Promise<number> in await read(value) }', 'in'],
  ['function f() { defer /* cleanup */ { close(); } }', 'defer'],
  ['function f() { guard value != null else { return 0; } }', 'guard'],
  ['users.filter { guard .active else { return false; } return true; }', 'guard'],
  ['function f() { guard const { value } = input else { return; } }', 'guard'],
  ['const value = switch (input) { case 1: 2; default: 3; };', 'switch'],
])('highlights dialect controls with real TS/TSX grammar: %s', (source, word) =>
  has(source, word, 'keyword.control.twill'),
);
it.each([
  '// guard true else { return; } defer { close(); } in .active',
  '/* guard true else { return; }\n defer { close(); } in .active */',
  'const value = "guard true else { return; } defer { close(); } in .active";',
  "const value = 'guard true else { return; } defer { close(); } in .active';",
  'const value = `guard true else { return; } defer { close(); } in .active`;',
  'const value = /guard true else { return; } defer { close(); } in \\.active/;',
  'const object = { guard: 1, defer: 2 }; object.guard (true); object.defer();',
])('does not inject dialect controls or members into native literals/properties: %s', (source) => {
  for (const grammar of grammars)
    expect(
      tokens(grammar, source).filter((token) =>
        token.scopes.some(
          (scope) => scope === 'keyword.control.twill' || scope === 'variable.other.property.twill',
        ),
      ),
    ).toEqual([]);
});
it('retains template expression and multiline lexical state', () => {
  for (const grammar of grammars) {
    const source =
      'const value = `text\n${users.filter { .active }.map { value in value.name }}\nend`;\nconst next = users.map { .name };';
    const result = tokens(grammar, source);
    expect(
      result.filter(
        (token) => token.text === 'in' && token.scopes.includes('keyword.control.twill'),
      ),
    ).toHaveLength(1);
    expect(
      result
        .filter((token) => token.scopes.includes('variable.other.property.twill'))
        .map((token) => token.text),
    ).toEqual(['active', 'name']);
  }
});
it('retains native TypeScript types and JSX expression highlighting', () => {
  for (const grammar of grammars)
    expect(
      tokens(grammar, 'const values = users.map { (value: number) in value + 1 };').some(
        (token) =>
          token.text === 'number' &&
          token.scopes.some((scope) => scope.startsWith('support.type.primitive.')),
      ),
    ).toBe(true);
  const result = tokens(
    grammars[1]!,
    'const view = <div>{users.map { value in <span>{value.name}</span> }}</div>;',
  );
  expect(
    result.some((token) => token.text === 'in' && token.scopes.includes('keyword.control.twill')),
  ).toBe(true);
  expect(
    result.some(
      (token) =>
        token.text === 'span' && token.scopes.some((scope) => scope.startsWith('entity.name.tag')),
    ),
  ).toBe(true);
});

it.each([
  'return Panel { <button onClick={() => count + 1}>Count</button>; };',
  'return Panel {\n  <button onClick={() => count + 1}>Count</button>;\n};',
])('retains JSX scopes in parameterless trailing closures: %s', (source) => {
  const result = tokens(grammars[1]!, source);
  expect(
    result.some(
      (token) =>
        token.text === 'button' &&
        token.scopes.some((scope) => scope.startsWith('entity.name.tag.')),
    ),
  ).toBe(true);
  expect(
    result.some(
      (token) =>
        token.text === 'onClick' &&
        token.scopes.some((scope) => scope.startsWith('entity.other.attribute-name.')),
    ),
  ).toBe(true);
});

it('keeps JSX text literal and highlights dialect code inside JSX expressions', () => {
  const literal = tokens(
    grammars[1]!,
    'const view = <Panel>{ready && <span>guard true else; .active</span>}</Panel>;',
  );
  expect(
    literal.some(
      (token) =>
        token.scopes.includes('keyword.control.twill') ||
        token.scopes.includes('variable.other.property.twill'),
    ),
  ).toBe(false);
  const expression = tokens(
    grammars[1]!,
    'const view = <Panel>{items.map { n in n + 1 }}</Panel>;',
  );
  expect(
    expression.some(
      (token) => token.text === 'in' && token.scopes.includes('keyword.control.twill'),
    ),
  ).toBe(true);
});

it('retains native operators in implicit member closures', () => {
  for (const grammar of grammars) {
    const result = tokens(
      grammar,
      "const names = users.filter {\n .active && .verified;\n}.map {\n .profile?.name ?? 'Anonymous';\n};",
    );
    for (const word of ['&&', '??'])
      expect(
        result.some(
          (token) =>
            token.text === word &&
            token.scopes.some((scope) => scope.startsWith('keyword.operator.logical.')),
        ),
      ).toBe(true);
  }
});

it('highlights explicit enum patterns in the packaged TS/TSX grammar', () => {
  const source = 'return switch(state){case enum State.loaded({value}):value;default:0;};';
  has(source, 'enum', 'keyword.control.twill');
  has(source, 'State', 'entity.name.type.twill');
  has(source, 'loaded', 'entity.name.function.twill');
});

it('highlights match descriptors and keeps native operators in the packaged TS/TSX grammar', () => {
  const source = 'return match(state){case State.loaded({value}):value && value ?? 0;default:0;};';
  has(source, 'match', 'keyword.control.twill');
  has(source, 'State', 'entity.name.type.twill');
  has(source, 'loaded', 'entity.name.function.twill');
  for (const grammar of grammars) {
    const result = tokens(grammar, source);
    for (const word of ['&&', '??'])
      expect(
        result.some(
          (token) =>
            token.text === word &&
            token.scopes.some((scope) => scope.startsWith('keyword.operator.logical.')),
        ),
      ).toBe(true);
  }
});
