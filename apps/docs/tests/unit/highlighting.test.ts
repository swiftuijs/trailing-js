import { beforeAll, expect, it } from 'vitest';
import { createMarkdownRenderer } from 'vitepress';
import { createTwillHighlighter } from '@swiftuijs/twill-highlight/shiki';
import { readFile, readdir } from 'node:fs/promises';
import config from '../../.vitepress/config';

let markdown: Awaited<ReturnType<typeof createMarkdownRenderer>>;
beforeAll(async () => {
  markdown = await createMarkdownRenderer(process.cwd(), config.markdown);
});

function render(source: string, language: string) {
  return markdown.render('```' + language + '\n' + source + '\n```');
}
function colored(html: string, light: string, dark: string) {
  return [...html.matchAll(/<span style="([^"]+)">([^<]*)<\/span>/g)]
    .filter(
      ([, style]) =>
        style.includes('--shiki-light:' + light) && style.includes('--shiki-dark:' + dark),
    )
    .map(([, , text]) =>
      text
        .trim()
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>'),
    );
}

it.each(['twill', 'twillx'])(
  'loads native and dialect syntax before any native fence: %s',
  (lang) => {
    const html = render(
      'export const result = values.map { n in n + 42 };\nfunction run() { guard true else { return; } defer { close(); } }',
      lang,
    );
    expect(colored(html, '#D73A49', '#F97583')).toEqual(
      expect.arrayContaining(['export', 'const', 'function', 'in', 'guard', 'defer']),
    );
    expect(colored(html, '#005CC5', '#79B8FF')).toContain('42');
  },
);

it.each(['twill', 'twillx'])('colors native operators inside dialect syntax: %s', (lang) => {
  const html = render(
    'function run() {\n  guard a && b else { return; }\n  guard const user = input ?? fallback else { return; }\n  const values = items.map { n in n !== 0 ? n + 1 : n ** 2 };\n  defer { ready ||= true; count += 1; }\n}',
    lang,
  );
  expect(colored(html, '#D73A49', '#F97583')).toEqual(
    expect.arrayContaining(['&&', '??', '!==', '?', '+', ':', '**', '||=', '+=']),
  );
});

it('highlights TwillX JSX tags even when no TSX fence appears in the page', () => {
  const html = render('const view = <button onClick={() => count + 1}>Hello</button>;', 'twillx');
  expect(colored(html, '#22863A', '#85E89D')).toContain('button');
  expect(colored(html, '#6F42C1', '#B392F0')).toContain('onClick');
});

it('matches our public highlighter for every Twill/TwillX fence in the published guides', async () => {
  const directory = new URL('../../../../docs/', import.meta.url);
  const highlighter = await createTwillHighlighter();
  let blocks = 0;
  try {
    for (const file of await readdir(directory)) {
      if (!file.endsWith('.md')) continue;
      const source = await readFile(new URL(file, directory), 'utf8');
      for (const token of markdown.parse(source, {})) {
        const lang = token.info.trim().split(/\s+/)[0]!;
        if (token.type !== 'fence' || !['twill', 'twillx'].includes(lang)) continue;
        blocks++;
        const html = render(token.content.trimEnd(), lang);
        for (const theme of ['light', 'dark'] as const) {
          const rendered = [...html.matchAll(/<span style="([^"]+)">([^<]*)<\/span>/g)].flatMap(
            ([, style, text]) => {
              const color = style!.match(new RegExp('--shiki-' + theme + ':([^;]+)'))![1];
              const decoded = text!
                .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
                .replaceAll('&quot;', '"')
                .replaceAll('&amp;', '&');
              return [...decoded].map((character) => [character, color]);
            },
          );
          const expected = highlighter
            .codeToTokensBase(token.content.trimEnd(), { lang, theme: 'github-' + theme })
            .flatMap((line) =>
              line.flatMap((part) => [...part.content].map((character) => [character, part.color])),
            );
          // VitePress moves whitespace into adjacent spans when merging tokens.
          // Compare visible characters so this does not mask syntax color loss.
          const visible = (tokens: (string | undefined)[][]) =>
            tokens.filter(([character]) => character!.trim() !== '');
          expect(visible(rendered), file + ' (' + lang + ', ' + theme + ')').toEqual(
            visible(expected),
          );
        }
      }
    }
    expect(blocks).toBeGreaterThan(20);
  } finally {
    highlighter.dispose();
  }
});
