import { defineConfig } from 'vitepress';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../../..');
const repository = 'https://github.com/swiftuijs/twill';
const grammar = (extension: string, scope: string) => ({
  ...JSON.parse(
    readFileSync(resolve(root, `editors/vscode/syntaxes/${extension}.tmLanguage.json`), 'utf8'),
  ),
  name: extension,
  scopeName: scope,
});
const pages = [
  {
    text: 'Start here',
    items: [
      { text: 'Why Twill?', link: '/why-twill' },
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
    ],
  },
  {
    text: 'Language',
    items: [
      { text: 'Language overview', link: '/language' },
      { text: 'Syntax and semantics', link: '/syntax' },
      { text: 'Practical patterns', link: '/patterns' },
    ],
  },
  {
    text: 'Development workflow',
    items: [
      { text: 'Editor and tooling', link: '/tooling' },
      { text: 'Build tools', link: '/build-tools' },
      { text: 'React and Vue', link: '/frameworks' },
      { text: 'Mixed TS / JS', link: '/interoperability' },
      { text: 'Libraries and declarations', link: '/libraries' },
      { text: 'Adoption and migration', link: '/adoption' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'CLI reference', link: '/cli' },
      { text: 'Performance', link: '/performance' },
      { text: 'GitHub highlighting', link: '/github' },
      { text: 'Readiness and support', link: '/readiness' },
    ],
  },
];
export default defineConfig({
  srcDir: '../../docs',
  srcExclude: ['contributing/**', 'rfcs/**'],
  outDir: './dist',
  base: process.env.TWILL_DOCS_BASE ?? '/twill/',
  title: 'Twill',
  description:
    'Clearer flow. Same TypeScript. Make validation, cleanup and business states explicit, with ordinary JavaScript output and a complete development toolchain.',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: (process.env.TWILL_DOCS_BASE ?? '/twill/') + 'favicon.svg' }],
  ],
  sitemap: { hostname: 'https://swiftuijs.github.io/twill/' },
  lang: 'en',
  themeConfig: {
    sidebar: pages,
    nav: [
      { text: 'Why Twill', link: '/why-twill' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'Support', link: '/readiness' },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: repository + '/edit/main/docs/:path' },
    footer: { message: 'MIT licensed · Experimental language', copyright: 'Twill · swiftuijs' },
  },
  markdown: {
    languages: [
      'typescript',
      'tsx',
      grammar('twill', 'source.twill.ts'),
      grammar('twillx', 'source.twill.tsx'),
    ],
    config(md) {
      const original = md.renderer.rules.link_open!;
      md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const token = tokens[index]!;
        const href = token.attrGet('href');
        if (href?.startsWith('../') && /(?:README|packages|examples)/.test(href))
          token.attrSet('href', repository + '/blob/main/' + href.replace(/^\.\.\//, ''));
        return original(tokens, index, options, env, self);
      };
    },
  },
  vite: {
    // Markdown lives in the canonical reference directory, outside this package.
    // Resolve its Vue imports from the docs package rather than root hoisting.
    resolve: { alias: { vue: dirname(require.resolve('vue/package.json')) } },
    publicDir: resolve(import.meta.dirname, '../public'),
    build: { sourcemap: false },
  },
});
