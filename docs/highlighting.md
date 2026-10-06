# Code highlighting on the web

Use `@swiftuijs/twill-highlight` to display Twill in documentation, blogs, code previews or web applications. It works with Shiki in browsers and server rendering, and exports TextMate grammars for other compatible engines. No VS Code extension or compiler is required.

Install the highlighting package and Shiki in the application or documentation project:

```sh
pnpm add shiki @swiftuijs/twill-highlight
```

```ts
import { createTwillHighlighter } from '@swiftuijs/twill-highlight/shiki';

const highlighter = await createTwillHighlighter();
const html = highlighter.codeToHtml('const active = users.filter { .active };', {
  lang: 'twill',
  theme: 'github-dark',
});
```

Render `html` in the host framework. Use `lang: 'twillx'` for JSX and `theme: 'github-light'` for a light theme. Code text is escaped by Shiki. Create the highlighter once, reuse it across blocks, and call `dispose()` when its owner is destroyed. Lazy-load it on routes that need it; the initial WASM/grammar load has a cost even though no compiler is shipped.

## Use your existing Shiki setup

```ts
import { createHighlighter } from 'shiki';
import { twillLanguages } from '@swiftuijs/twill-highlight';

const highlighter = await createHighlighter({
  themes: ['nord'],
  langs: ['typescript', 'tsx', ...twillLanguages],
});
```

Load both native grammars along with the Twill registrations. Custom themes, token rendering and transformers use Shiki's standard APIs. Shiki 2.5, 3 and 4 are supported.

For VitePress, set `markdown.languages: twillLanguages`; VitePress already loads the native TS/TSX grammars. This documentation site uses that public integration.

Raw TextMate JSON is available through `/grammars/twill` and `/grammars/twillx` package exports. These grammars also supply the VSIX, keeping dialect scopes consistent. Prism/highlight.js need their own grammar formats; this package does not register those engines.

Highlighting identifies syntax and retains multiline lexical state. It does not type-check code or supply semantic editor suggestions; use the compiler/checker and VS Code extension for those workflows.
