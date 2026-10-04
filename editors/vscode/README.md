# Trailing JS

Swift-style trailing closures in `.tts`, `.tjs`, `.ttsx`, and `.tjsx` files.

```ts
const doubled = [1, 2, 3].map() { value in value * 2 };
```

Includes highlighting, bracket/comment support, TypeScript diagnostics, hover, member completion, signature help, and go-to-definition. **Trailing JS: Show Generated TypeScript** opens the compiled source alongside the document.

Use the build plugin and `trailing-js check` from [`@swiftuijs/trailing-js`](https://github.com/swiftuijs/trailing-js). This extension bundles its compiler tooling. Project settings come from the nearest `tsconfig.json` and `trailing.config.json`.

Builders are explicit and framework-independent: `{ "builders": ["Stack", "Text"] }`. Optional React and Vue adapters bridge closures to children/default slots. No component library receives special handling.

Syntax is experimental. Formatting, rename, automatic imports, and native TypeScript-server patching are not provided. Use the CLI for whole-project checking, including standard TS files importing extended files. See the repository's [syntax contract](https://github.com/swiftuijs/trailing-js/blob/main/docs/syntax.md) for details.
