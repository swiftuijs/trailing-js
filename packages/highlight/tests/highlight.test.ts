import { afterAll, beforeAll, expect, it } from 'vitest';
import { twillLanguages } from '../src/index.twill';
import { createTwillHighlighter } from '../src/shiki.twill';

let highlighter: Awaited<ReturnType<typeof createTwillHighlighter>>;
it.each(['twill', 'twillx'])(
  'highlights branch bindings and retains native expression colors in %s',
  (lang) => {
    for (const theme of ['github-light', 'github-dark']) {
      const source =
        'if /* boundary */ const {value:amount=0}=lookup<number>() ?? null {use(amount && 3);}\nif const [first,...rest]=items{use(first);}\nif(ready){use(1);}';
      const tokens = highlighter
        .codeToTokensBase(source, { lang, theme, includeExplanation: true })
        .flat();
      const parts = tokens.flatMap((t) => t.explanation ?? []);
      expect(
        parts.some(
          (p) =>
            p.content === 'if' && p.scopes.some((s) => s.scopeName === 'keyword.control.twill'),
        ),
      ).toBe(true);
      expect(
        parts.some(
          (p) =>
            p.content === 'const' && p.scopes.some((s) => s.scopeName.startsWith('storage.type.')),
        ),
      ).toBe(true);
      for (const operator of ['??', '&&'])
        expect(tokens.find((t) => t.content === operator)?.color).not.toBe(
          tokens.find((t) => t.content === 'amount')?.color,
        );
      expect(
        parts.some(
          (p) =>
            p.content.includes('boundary') &&
            p.scopes.some((s) => s.scopeName.startsWith('comment.')),
        ),
      ).toBe(true);
    }
    const native = highlighter
      .codeToTokensBase('const text="if const value=lookup(){}"; // if const value=lookup(){}', {
        lang,
        theme: 'github-dark',
        includeExplanation: true,
      })
      .flat();
    expect(
      native.some((t) =>
        t.explanation?.some((p) => p.scopes.some((s) => s.scopeName === 'meta.if.binding.twill')),
      ),
    ).toBe(false);
  },
);
beforeAll(async () => {
  highlighter = await createTwillHighlighter();
});
afterAll(() => highlighter.dispose());

it.each(['twill', 'twillx'])(
  'highlights associated enums and native payload types in %s',
  (lang) => {
    const source =
      'export enum State<T extends {value:number}> {\n case idle;\n case loaded(value:T, callback:<U>(value:U)=>number);\n case 加载(value:T);\n}\nconst result=State.loaded({value:42},value=>1);';
    const tokens = highlighter
      .codeToTokensBase(source, { lang, theme: 'github-dark', includeExplanation: true })
      .flat();
    const scoped = (word: string, scope: string) =>
      tokens.some((token) =>
        token.explanation?.some(
          (part) => part.content === word && part.scopes.some((s) => s.scopeName.startsWith(scope)),
        ),
      );
    expect(scoped('case', 'keyword.control.twill')).toBe(true);
    expect(scoped('loaded', 'entity.name.function.twill')).toBe(true);
    expect(scoped('加载', 'entity.name.function.twill')).toBe(true);
    expect(scoped('number', 'support.type.primitive.')).toBe(true);
    const literal = highlighter
      .codeToTokensBase(
        'const text="enum State<T> { case loaded(value:T); }"; // enum State { case idle; }',
        { lang, theme: 'github-dark', includeExplanation: true },
      )
      .flat();
    expect(
      literal.some((token) =>
        token.explanation?.some((part) =>
          part.scopes.some((s) => s.scopeName === 'entity.name.function.twill'),
        ),
      ),
    ).toBe(false);
    const plain = highlighter
      .codeToTokensBase('enum State {\n // comment\n case idle;\n case loaded(value:number);\n}', {
        lang,
        theme: 'github-dark',
        includeExplanation: true,
      })
      .flat();
    expect(
      plain.some((token) =>
        token.explanation?.some(
          (part) =>
            part.content === 'loaded' &&
            part.scopes.some((s) => s.scopeName === 'entity.name.function.twill'),
        ),
      ),
    ).toBe(true);
  },
);

it('registers both dialects and their native dependencies', () => {
  expect(twillLanguages.map((language) => language.name)).toEqual(['twill', 'twillx']);
  expect(highlighter.getLoadedLanguages()).toEqual(
    expect.arrayContaining(['twill', 'twillx', 'typescript', 'tsx']),
  );
});

it.each(['twill', 'twillx'])(
  'highlights explicit enum patterns and retains native call cases in %s',
  (lang) => {
    const source =
      'return switch(state){case enum /*descriptor*/ NS.State.loaded({value:amount}):amount;default:0;}';
    const parts = highlighter
      .codeToTokensBase(source, { lang, theme: 'github-dark', includeExplanation: true })
      .flat()
      .flatMap((token) => token.explanation ?? []);
    for (const [word, scope] of [
      ['enum', 'keyword.control.twill'],
      ['State', 'entity.name.type.twill'],
      ['loaded', 'entity.name.function.twill'],
    ])
      expect(
        parts.some(
          (part) => part.content === word && part.scopes.some((s) => s.scopeName === scope),
        ),
      ).toBe(true);
    expect(
      parts.some(
        (part) =>
          part.content.includes('descriptor') &&
          part.scopes.some((s) => s.scopeName.startsWith('comment.')),
      ),
    ).toBe(true);
    const native = highlighter
      .codeToTokensBase('switch(value){case Factory.loaded(3):break;}', {
        lang,
        theme: 'github-dark',
        includeExplanation: true,
      })
      .flat()
      .flatMap((token) => token.explanation ?? []);
    expect(
      native.some((part) => part.scopes.some((s) => s.scopeName === 'entity.name.function.twill')),
    ).toBe(false);
  },
);

it.each(['twill', 'twillx'])(
  'retains comment scopes between associated case keywords and names in %s',
  (lang) => {
    const tokens = highlighter
      .codeToTokensBase(
        'enum State{case /* payload */ loaded(value:number);}\nenum Native{case /* member */ =1,other=2}',
        { lang, theme: 'github-dark', includeExplanation: true },
      )
      .flat();
    const scoped = (word: string, scope: string) =>
      tokens.some((token) =>
        token.explanation?.some(
          (part) =>
            part.content.includes(word) &&
            part.scopes.some((item) => item.scopeName.startsWith(scope)),
        ),
      );
    expect(scoped('loaded', 'entity.name.function.twill')).toBe(true);
    expect(scoped('payload', 'comment.block')).toBe(true);
    expect(scoped('member', 'comment.block')).toBe(true);
    expect(
      tokens.filter((token) =>
        token.explanation?.some(
          (part) =>
            part.content === 'case' &&
            part.scopes.some((item) => item.scopeName === 'keyword.control.twill'),
        ),
      ),
    ).toHaveLength(1);
  },
);
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

it.each(['github-light', 'github-dark'])(
  'preserves native TS/TSX token colors with %s',
  (theme) => {
    const source = [
      'import { readFile } from "node:fs";',
      'type Result<T> = { value?: T } | null;',
      'enum Native { A = 1, B = "b" }',
      'export async function run<T extends number>(input: Result<T>) {',
      '  const value = input?.value ?? 42;',
      '  const accepted = value >= 0 && value !== 1 || !input;',
      '  let count = accepted ? value + 1 : value ** 2;',
      '  count += 2; count ||= 3; count &&= 4; count ??= 5;',
      '  const text = `value: ${count}`;',
      '  const regex = /guard|defer/g;',
      '  /* guard true else { return; }',
      '     defer { close(); } */',
      '  return await Promise.resolve(text);',
      '}',
    ].join('\n');
    const colors = (text: string, lang: string) =>
      highlighter
        .codeToTokensBase(text, { lang, theme })
        .map((line) =>
          line.flatMap((token) => [...token.content].map((character) => [character, token.color])),
        );
    for (const [dialect, native] of [
      ['twill', 'typescript'],
      ['twillx', 'tsx'],
    ]) {
      expect(colors(source, dialect!)).toEqual(colors(source, native!));
    }
    const jsx = 'const view = <Panel title="guard">{ready && (name ?? "Guest")}</Panel>;';
    expect(colors(jsx, 'twillx')).toEqual(colors(jsx, 'tsx'));
  },
);

it.each(['github-light', 'github-dark'])(
  'highlights JSX inside parameterless trailing closures with %s',
  (theme) => {
    for (const source of [
      'return Panel { <button onClick={() => count + 1}>Count</button>; };',
      'return Panel {\n  <button onClick={() => count + 1}>Count</button>;\n};',
      'return Panel { <>{items.map { item in <span>{item.name}</span> }}</>; };',
    ]) {
      const tokens = highlighter
        .codeToTokensBase(source, { lang: 'twillx', theme, includeExplanation: true })
        .flat();
      const parts = tokens.flatMap((token) => token.explanation ?? []);
      expect(
        parts.some(
          (part) =>
            ['button', 'span'].includes(part.content) &&
            part.scopes.some((scope) => scope.scopeName.startsWith('entity.name.tag.')),
        ),
      ).toBe(true);
      if (source.includes('onClick'))
        expect(
          parts.some(
            (part) =>
              part.content === 'onClick' &&
              part.scopes.some((scope) =>
                scope.scopeName.startsWith('entity.other.attribute-name.'),
              ),
          ),
        ).toBe(true);
    }
  },
);

it.each([
  'const view = <Panel>guard true else; defer cleanup; in .active</Panel>;',
  'const view = <Panel>{ready && <span>guard true else; .active</span>}</Panel>;',
  'const view = <Panel>{"guard true else; .active"}</Panel>;',
  'const view = <Panel>{`guard true else; .active`}</Panel>;',
])('keeps JSX text and embedded literals literal: %s', (source) => {
  const tokens = highlighter
    .codeToTokensBase(source, { lang: 'twillx', theme: 'github-light', includeExplanation: true })
    .flat();
  expect(
    tokens
      .flatMap((token) => token.explanation ?? [])
      .some((part) =>
        part.scopes.some(
          (scope) =>
            scope.scopeName === 'keyword.control.twill' ||
            scope.scopeName === 'variable.other.property.twill',
        ),
      ),
  ).toBe(false);
});

it.each([
  'const view = <Panel>{items.map { n in n + 1 }}</Panel>;',
  'const view = <Panel>{`${items.map { n in n + 1 }}`}</Panel>;',
])('retains dialect scopes in JSX expressions: %s', (source) => {
  const tokens = highlighter
    .codeToTokensBase(source, { lang: 'twillx', theme: 'github-light', includeExplanation: true })
    .flat();
  expect(
    tokens
      .flatMap((token) => token.explanation ?? [])
      .some(
        (part) =>
          part.content === 'in' &&
          part.scopes.some((scope) => scope.scopeName === 'keyword.control.twill'),
      ),
  ).toBe(true);
});

it.each(['twill', 'twillx'])('retains native operators after implicit members in %s', (lang) => {
  const source =
    "const names = users.filter {\n .active && .verified;\n}.map {\n .profile?.name ?? 'Anonymous';\n};\nconst next = 42;";
  const parts = highlighter
    .codeToTokensBase(source, { lang, theme: 'github-light', includeExplanation: true })
    .flat()
    .flatMap((token) => token.explanation ?? []);
  for (const word of ['&&', '??'])
    expect(
      parts.some(
        (part) =>
          part.content === word &&
          part.scopes.some((scope) => scope.scopeName.startsWith('keyword.operator.logical.')),
      ),
    ).toBe(true);
  expect(
    parts.some(
      (part) =>
        part.content === '?.' &&
        part.scopes.some((scope) => scope.scopeName.startsWith('punctuation.accessor.optional.')),
    ),
  ).toBe(true);
  expect(
    parts.some(
      (part) =>
        part.content === 'next' &&
        part.scopes.some((scope) => scope.scopeName.startsWith('variable.other.constant.')),
    ),
  ).toBe(true);
});

it.each(['twill', 'twillx'])(
  'highlights match patterns while retaining native scopes in %s',
  (lang) => {
    for (const theme of ['github-dark', 'github-light']) {
      const source =
        'return match(state){case /*descriptor*/ NS.State.loaded({value:amount}):amount && amount ?? 0;default:0;}';
      const parts = highlighter
        .codeToTokensBase(source, { lang, theme, includeExplanation: true })
        .flat()
        .flatMap((token) => token.explanation ?? []);
      for (const [word, scope] of [
        ['match', 'keyword.control.twill'],
        ['State', 'entity.name.type.twill'],
        ['loaded', 'entity.name.function.twill'],
        ['&&', 'keyword.operator.logical.'],
        ['??', 'keyword.operator.logical.'],
      ])
        expect(
          parts.some(
            (part) =>
              part.content === word && part.scopes.some((s) => s.scopeName.startsWith(scope!)),
          ),
        ).toBe(true);
      expect(
        parts.some(
          (part) =>
            part.content.includes('descriptor') &&
            part.scopes.some((s) => s.scopeName.startsWith('comment.')),
        ),
      ).toBe(true);
      const ordinary = highlighter
        .codeToTokensBase(
          'const result=match(state); object.match(state); const text="match(state){case State.loaded():0;}"; // match(state){case State.loaded():0;}',
          { lang, theme, includeExplanation: true },
        )
        .flat()
        .flatMap((token) => token.explanation ?? []);
      expect(
        ordinary.some((part) => part.scopes.some((s) => s.scopeName === 'keyword.control.twill')),
      ).toBe(false);
      const multiline = highlighter
        .codeToTokensBase(
          'return match (state) {\n case State.loaded({ value }): value;\n default: 0;\n};',
          { lang, theme, includeExplanation: true },
        )
        .flat()
        .flatMap((token) => token.explanation ?? []);
      expect(
        multiline.some(
          (part) =>
            part.content === 'match' &&
            part.scopes.some((s) => s.scopeName === 'keyword.control.twill'),
        ),
      ).toBe(true);
    }
  },
);
