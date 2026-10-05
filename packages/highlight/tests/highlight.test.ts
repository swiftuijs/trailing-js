import { afterAll, beforeAll, expect, it } from 'vitest';
import { twillLanguages } from '../src/index';
import { createTwillHighlighter } from '../src/shiki';

let highlighter: Awaited<ReturnType<typeof createTwillHighlighter>>;
beforeAll(async () => {
  highlighter = await createTwillHighlighter();
});
afterAll(() => highlighter.dispose());

it('registers both dialects and their native dependencies', () => {
  expect(twillLanguages.map((language) => language.name)).toEqual(['twill', 'twillx']);
  expect(highlighter.getLoadedLanguages()).toEqual(
    expect.arrayContaining(['twill', 'twillx', 'typescript', 'tsx']),
  );
});
it.each(['twill', 'twillx'])('retains dialect and native token scopes in %s', (lang) => {
  const tokens = highlighter
    .codeToTokensBase(
      'const users = values.filter { .active }.map { (value: number) in value + 1 };\nfunction run() { guard users.length else { return; } defer { close(); } }',
      { lang, theme: 'github-dark', includeExplanation: true },
    )
    .flat();
  for (const keyword of ['guard', 'defer', 'in']) {
    expect(
      tokens.some((token) =>
        token.explanation?.some(
          (part) =>
            part.content === keyword &&
            part.scopes.some((scope) => scope.scopeName === 'keyword.control.twill'),
        ),
      ),
    ).toBe(true);
  }
  expect(
    tokens.some((token) =>
      token.explanation?.some(
        (part) =>
          part.content === 'active' &&
          part.scopes.some((scope) => scope.scopeName === 'variable.other.property.twill'),
      ),
    ),
  ).toBe(true);
});
it.each(['twill', 'twillx'])('keeps strings and multiline comments literal in %s', (lang) => {
  const tokens = highlighter
    .codeToTokensBase(
      '/* guard true else { return; }\n defer { close(); } */\nconst text = "defer { close(); }";',
      { lang, theme: 'github-light', includeExplanation: true },
    )
    .flat();
  expect(
    tokens.some((token) =>
      token.explanation?.some((part) =>
        part.scopes.some((scope) => scope.scopeName === 'keyword.control.twill'),
      ),
    ),
  ).toBe(false);
});
it('highlights JSX, escapes source HTML and can be reused with both themes', () => {
  const source = 'const view = <div>{users.map { user in <span>{user.name}</span> }}</div>;';
  for (const theme of ['github-light', 'github-dark']) {
    const html = highlighter.codeToHtml(source, { lang: 'twillx', theme });
    expect(html).toMatch(/&(?:lt;|#x3C;)/);
    expect(html).not.toContain('<span>{user.name}</span>');
    expect(html).toContain('style="color:');
  }
  expect(highlighter.codeToHtml('', { lang: 'twill', theme: 'github-light' })).toContain('<pre');
});

it.each([
  '// guard value else { return; } defer { close(); }',
  'const text = `guard value else { return; } defer { close(); }`;',
  'const regex = /guard value else { return; } defer { close(); }/;',
  'const object = { guard: 1, defer: 2 }; object.guard(true); object.defer();',
])('does not mark native literals or properties as dialect controls: %s', (source) => {
  for (const lang of ['twill', 'twillx']) {
    const tokens = highlighter.codeToTokensBase(source, {
      lang,
      theme: 'github-dark',
      includeExplanation: true,
    });
    expect(
      tokens
        .flat()
        .some((token) =>
          token.explanation?.some((part) =>
            part.scopes.some((scope) => scope.scopeName === 'keyword.control.twill'),
          ),
        ),
    ).toBe(false);
  }
});

it.each([
  ['values.map { async (value: number): Promise<number> in await read(value) }', 'in'],
  ['function f() { guard const { value } = input else { return; } }', 'guard'],
  ['const value = switch (input) { case 1: 2; default: 3; };', 'switch'],
  ['const text = `line\n${values.map { value in value.name }}\nend`;', 'in'],
])('retains dialect controls across typed and nested syntax: %s', (source, word) => {
  for (const lang of ['twill', 'twillx']) {
    const tokens = highlighter.codeToTokensBase(source, {
      lang,
      theme: 'github-dark',
      includeExplanation: true,
    });
    expect(
      tokens
        .flat()
        .some((token) =>
          token.explanation?.some(
            (part) =>
              part.content === word &&
              part.scopes.some((scope) => scope.scopeName === 'keyword.control.twill'),
          ),
        ),
    ).toBe(true);
  }
});
