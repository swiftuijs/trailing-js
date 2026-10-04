# Twill

The Twill JS/TS syntax-sugar language in `.twill`, `.twill.js`, `.twillx`, and `.twill.jsx` files: Swift-style trailing closures, early-exit guards, nullish bindings, block-scoped defer and explicit builders for ordinary code and UI. Plain JS files retain JS/JSDoc checking. Configuration is `twill.config.json`; no legacy names or suffixes are registered.

```ts
const doubled = [1, 2, 3].map() { value in value * 2 };
function scoreOf(input: { score: number } | undefined) {
  guard const score = input?.score else { return 0; }
  return score;
}
```

Includes highlighting, bracket/comment support, TypeScript diagnostics, hover, member completion, signature help, and go-to-definition. **Twill: Show Generated TypeScript** opens the compiled source alongside the document.

Use the build plugin and `twill check` from [`@swiftuijs/twill`](https://github.com/swiftuijs/twill). This extension bundles its compiler tooling. Project settings come from the nearest `tsconfig.json` and `twill.config.json`.

Builders are explicit and framework-independent: `{ "builders": ["Stack", "Text"] }`. Optional React and Vue adapters bridge closures to children/default slots. No component library receives special handling.

The bundled TS-server bridge supports native TS/JS documents importing Twill in configured projects, including diagnostics, hover, completion, signatures, definitions and unsaved-source synchronization. Standard-library declarations are included for standalone Twill assistance. Syntax is experimental; formatting, cross-dialect rename and automatic imports remain unavailable. Use the CLI for authoritative whole-project checking. See the repository's [syntax contract](https://github.com/swiftuijs/twill/blob/main/docs/syntax.md) for details.
