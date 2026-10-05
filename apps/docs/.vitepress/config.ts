import { defineConfig } from 'vitepress';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
      { text: 'Getting started', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'Language overview', link: '/language' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Syntax and semantics', link: '/syntax' },
      { text: 'Mixed TS / JS', link: '/interoperability' },
      { text: 'Tooling and libraries', link: '/tooling' },
      { text: 'Framework development', link: '/frameworks' },
      { text: 'Performance', link: '/performance' },
    ],
  },
  {
    text: 'Project',
    items: [
      { text: 'Readiness and support', link: '/readiness' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Releasing', link: '/releasing' },
      { text: 'GitHub highlighting', link: '/github' },
    ],
  },
];
export default defineConfig({
  srcDir: '../../docs',
  outDir: './dist',
  base: process.env.TWILL_DOCS_BASE ?? '/twill/',
  title: 'Twill',
  description:
    'A small syntax-sugar layer over TypeScript and JavaScript. Trailing closures, guard and defer; ordinary JS engines and framework semantics.',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['link', { rel: 'icon', href: (process.env.TWILL_DOCS_BASE ?? '/twill/') + 'favicon.svg' }],
  ],
  sitemap: { hostname: 'https://swiftuijs.github.io/twill/' },
  locales: {
    root: { label: 'English', lang: 'en', themeConfig: { sidebar: pages } },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      title: 'Twill',
      description: '为 JS/TS 添加尾闭包、guard 与 defer，编译后使用现有 JavaScript 生态。',
      themeConfig: {
        nav: [
          { text: '开始使用', link: '/zh/getting-started' },
          { text: '语法', link: '/zh/syntax' },
          { text: 'Playground', link: '/playground' },
        ],
        sidebar: [
          {
            text: '指南',
            items: [
              { text: '开始使用', link: '/zh/getting-started' },
              { text: '语法', link: '/zh/syntax' },
              { text: '工具链', link: '/zh/tooling' },
              { text: 'Playground', link: '/playground' },
            ],
          },
        ],
        outline: { label: '本页目录' },
        docFooter: { prev: '上一页', next: '下一页' },
        editLink: { pattern: repository + '/edit/main/docs/:path', text: '在 GitHub 编辑' },
      },
    },
  },
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'Playground', link: '/playground' },
      { text: 'Readiness', link: '/readiness' },
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    socialLinks: [{ icon: 'github', link: repository }],
    editLink: { pattern: repository + '/edit/main/docs/:path' },
    footer: { message: 'MIT licensed · Experimental 0.x language', copyright: 'Twill · swiftuijs' },
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
    publicDir: resolve(import.meta.dirname, '../public'),
    build: { sourcemap: false },
  },
});
