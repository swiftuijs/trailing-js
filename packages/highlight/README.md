# Twill highlighting

Portable TextMate grammars and a browser-compatible Shiki entry. The package imports no compiler, TypeScript engine, VS Code APIs or UI framework. The docs site and VSIX use the same grammar files.

```sh
pnpm add shiki @swiftuijs/twill-highlight
```

Create one highlighter, reuse it for code blocks and dispose it when its owner is destroyed:

```ts
import { createTwillHighlighter } from '@swiftuijs/twill-highlight/shiki';

const highlighter = await createTwillHighlighter();
const html = highlighter.codeToHtml('const active = users.filter { .active };', {
  lang: 'twill', // use twillx for JSX
  theme: 'github-dark', // or github-light
});
highlighter.dispose();
```

The helper loads only TS/TSX grammars and two themes, using Shiki's Oniguruma engine. Initial creation loads its WASM; tokenization is synchronous afterward. Shiki is an optional peer, separate from the grammar-only entry. Reuse the instance, and lazy-load the helper if highlighting is not needed on every page. Published archive size excludes Shiki and its WASM.

## Existing Shiki integrations

```ts
import { createHighlighter } from 'shiki';
import { twillLanguages } from '@swiftuijs/twill-highlight';

const highlighter = await createHighlighter({
  themes: ['nord'],
  langs: ['typescript', 'tsx', ...twillLanguages],
});
```

Both native base grammars are required. For VitePress, use `markdown.languages: twillLanguages`; its built-in grammars supply TS/TSX. Shiki 2.5, 3 and 4 are supported; the packaged consumer tests exercise the pinned versions. Custom themes, token output and transformers remain ordinary Shiki APIs.

For other TextMate-compatible engines, use the JSON exports `@swiftuijs/twill-highlight/grammars/twill` and `/grammars/twillx`; load `source.ts` and `source.tsx` too. Prism and highlight.js use different grammar formats and cannot consume TextMate registrations directly.

Shiki escapes code text in generated HTML. This does not sanitize arbitrary custom transformers, themes or surrounding markup. Highlighting is lexical; it supplies neither compiler diagnostics nor semantic completion. The editable playground continues to use CodeMirror for its incremental editing model.

[Documentation](https://swiftuijs.github.io/twill/highlighting) · [Playground](https://swiftuijs.github.io/twill/playground) · [Issues](https://github.com/swiftuijs/twill/issues) · MIT licensed · Built by [forth.ink](https://forth.ink).
