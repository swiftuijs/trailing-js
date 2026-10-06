import { defineConfig } from 'vitepress';
import { twillLanguages } from '@swiftuijs/twill-highlight';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repository = 'https://github.com/swiftuijs/twill';
const site = 'https://twill.evecalm.com';
const base = process.env.TWILL_DOCS_BASE ?? '/';
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
      { text: 'Web highlighting', link: '/highlighting' },
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
      { text: 'React source study', link: '/react-source' },
      { text: 'GitHub highlighting', link: '/github' },
      { text: 'Compatibility and limitations', link: '/readiness' },
    ],
  },
  {
    text: 'Related projects',
    items: [{ text: 'SwiftUI.js', link: 'https://swiftuijs.evecalm.com/docs/' }],
  },
];
export default defineConfig({
  srcDir: '../../docs',
  srcExclude: ['contributing/**', 'rfcs/**'],
  outDir: './dist',
  base,
  title: 'Twill',
  description:
    'A Swift-inspired language for JavaScript and TypeScript, with guards, defer, trailing closures and checked switch expressions. Compiles to ordinary JavaScript.',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: base + 'favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: base + 'favicon.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: base + 'apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', content: '#6d5ce8' }],
  ],
  sitemap: { hostname: site },
  transformHead({ pageData }) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    return [['link', { rel: 'canonical', href: new URL(path, site + '/').href }]];
  },
  lang: 'en',
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'Twill hummingbird' },
    sidebar: pages,
    nav: [
      { text: 'Why Twill', link: '/why-twill' },
      { text: 'Guide', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'GitHub', link: repository },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    editLink: { pattern: repository + '/edit/main/docs/:path' },
    footer: {
      message:
        'MIT licensed · Experimental language · <a href="https://swiftuijs.evecalm.com/">SwiftUI.js</a>',
      copyright: 'Twill · <a href="https://forth.ink">forth.ink</a>',
    },
  },
  markdown: {
    languages: twillLanguages,
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
