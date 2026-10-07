# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill highlighting

TextMate grammars and browser-compatible Shiki highlighting for Twill, a TypeScript-based language with Swift-inspired syntax extensions. The package imports no compiler, TypeScript engine, VS Code APIs or UI framework. The docs site and VSIX use the same grammar files.

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

Both native base grammars are required at initialization. Shiki 2.5, 3 and 4 are supported; the packaged consumer tests exercise the pinned versions. Custom themes, token output and transformers remain ordinary Shiki APIs.

For VitePress, register the native dependencies explicitly alongside our grammars:

```ts
import { defineConfig } from 'vitepress';
import { twillLanguages } from '@swiftuijs/twill-highlight';
import typescript from 'shiki/langs/typescript.mjs';
import tsx from 'shiki/langs/tsx.mjs';

export default defineConfig({
  markdown: {
    languages: [...typescript, ...tsx, ...twillLanguages],
  },
});
```

VitePress loads built-in languages lazily. Passing only `twillLanguages` leaves the native TextMate includes unresolved, so ordinary keywords, operators and JSX lose their colors. Use `twill` / `twillx` fences with the complete registration above.

For other TextMate-compatible engines, use the JSON exports `@swiftuijs/twill-highlight/grammars/twill` and `/grammars/twillx`; load `source.ts` and `source.tsx` too. Prism and highlight.js use different grammar formats and cannot consume TextMate registrations directly.

Shiki escapes code text in generated HTML. This does not sanitize arbitrary custom transformers, themes or surrounding markup. Highlighting is lexical; it supplies neither compiler diagnostics nor semantic completion. The editable playground continues to use CodeMirror for its incremental editing model.

[Documentation](https://twill.evecalm.com/highlighting) · [Playground](https://twill.evecalm.com/playground) · [Issues](https://github.com/swiftuijs/twill/issues) · MIT licensed · Built by [forth.ink](https://forth.ink).

## Unreleased language work

The RFC 0018 source prototype adds `if const value = lookup() { use(value); }` with branch-local nullish bindings and native destructuring. Group trailing calls in initializers, following Swift’s condition boundary. It emits native branches without a helper, closure or optional wrapper. This is unreleased; see [syntax](https://twill.evecalm.com/syntax#branch-nullish-bindings-unreleased) and [RFC 0018](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0018-optional-branch-bindings.md).

Unreleased source work includes associated-value enums and accepted `match` expressions: `match (state) { case State.loaded({ value }): value; default: 0; }`. Named payload bindings and erased factory descriptors compile to native switches without calling factories. Native switch statements retain JS fallthrough; match and switch expressions return one result without fallthrough. These additions are not included in npm/Marketplace 0.1.2. Compiler, formatter, linter, highlighter, export and editor changes are validated together. See [syntax and compatibility](https://twill.evecalm.com/syntax#match-expressions-unreleased) and [RFC 0016](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0016-pattern-matching.md).
